import crypto from 'node:crypto';
import { withTransaction } from '../db.js';
// ADAPTER: adjust to your real util. Expected: httpError(status, message) returns an Error.
import { httpError } from '../utils/httpError.js';
import * as q from '../queries/grading.queries.js';
import {
  WINDOWED_REASONS, pickQuestions, gradeAnswers, hasPassed, experiencePoints,
  isExpired, cooldownEndsAt, computeTier, decideTierAction, DOWNGRADE_WARNING_DAYS,
} from './grading.rules.js';

const rng = () => crypto.randomInt(0, 2 ** 31) / 2 ** 31;

async function requireShop(userId, client) {
  const shop = await q.findShopByUserId(userId, client);
  if (!shop) throw httpError(404, 'Provider profile not found');
  if (['rejected', 'suspended'].includes(shop.verification_status)) {
    throw httpError(403, 'Your account cannot take tests right now');
  }
  return shop;
}

async function presentAttempt(attemptId, startedAt, language = 'en', mode = 'text') {
  const questions = await q.listQuestionsByAttempt(attemptId, language);
  return {
    attemptId,
    language,
    mode,
    expiresAt: new Date(new Date(startedAt).getTime() + 60 * 60_000),
    questions: questions.map(({ id, body, options, audio_url }) => ({ id, body, options, audioUrl: audio_url })),
  };
}

export async function startAttempt(userId, { kind, claimedYears, mode = 'text', language = 'en' }) {
  const shop = await requireShop(userId);

  const open = await q.findOpenAttempt(shop.id, kind);
  if (open) {
    if (!isExpired(open.started_at)) return presentAttempt(open.id, open.started_at, open.language, open.mode); // same paper, no re-rolling
    await q.finishAttempt(open.id, { scorePct: 0, passed: false });                   // abandoned = failed
  }

  const failed = await q.findLastFinishedFailure(shop.id, kind);
  if (failed) {
    const ends = cooldownEndsAt(kind, failed.submitted_at);
    if (ends > new Date()) throw httpError(429, `You can retake this test after ${ends.toISOString()}`);
  }

  const years = kind === 'experience' ? claimedYears : (shop.years_experience ?? 0);
  const pool = await q.listActiveQuestions(kind, years);
  let picked;
  try {
    picked = pickQuestions(pool, { kind, years, rng });
  } catch {
    throw httpError(503, 'This test is not available yet. Please try again later.');
  }

  const attempt = await withTransaction(async (client) => {
    const a = await q.createAttempt({ shopId: shop.id, kind, claimedYears: years, mode, language }, client);
    await q.insertAttemptQuestions(a.id, picked.map((p) => p.id), client);
    return a;
  });
  return presentAttempt(attempt.id, attempt.started_at, language, mode);
}

export async function submitAttempt(userId, attemptId, answerList) {
  return withTransaction(async (client) => {
    const shop = await requireShop(userId, client);
    const attempt = await q.getAttemptForUpdate(attemptId, shop.id, client); // also proves ownership
    if (!attempt) throw httpError(404, 'Attempt not found');
    if (attempt.submitted_at) throw httpError(409, 'This attempt was already submitted');

    if (isExpired(attempt.started_at)) {
      await q.finishAttempt(attempt.id, { scorePct: 0, passed: false }, client);
      throw httpError(410, 'This attempt has expired');
    }

    const served = await q.getServedWithKey(attempt.id, client);
    const servedIds = new Set(served.map((s) => s.question_id));
    const answers = new Map();
    for (const a of answerList) {
      if (!servedIds.has(a.questionId)) throw httpError(400, 'Answer for a question that was not in this test');
      if (answers.has(a.questionId)) throw httpError(400, 'Duplicate answer');
      answers.set(a.questionId, a.chosenIndex);
    }

    const graded = gradeAnswers(served, answers);
    const passed = hasPassed(attempt.kind, graded.scorePct);
    await q.recordAnswers(attempt.id, graded.results, client);
    await q.finishAttempt(attempt.id, { scorePct: graded.scorePct, passed }, client);

    if (passed && attempt.kind === 'safety') {
      await q.markSafetyGatePassed(shop.id, client);
    }
    if (passed && attempt.kind === 'experience') {
      await q.setVerifiedYears(shop.id, attempt.claimed_years, client);
      const already = await q.sumPointsByReason(shop.id, 'experience_test', client);
      const delta = experiencePoints(attempt.claimed_years, graded.scorePct) - already; // retakes never double-count
      if (delta > 0) {
        await q.insertPointsEvent({ shopId: shop.id, delta, reason: 'experience_test', refId: attempt.id }, client);
      }
    }

    const review = await reviewProviderTier(shop.id, client);
    // The answer key stays private: we return the score, not which questions were wrong.
    return { kind: attempt.kind, scorePct: graded.scorePct, passed, tier: review.tier, points: review.points };
  });
}

/** Recalculates points and applies upgrade / warning / downgrade. Safe to call any time. */
export async function reviewProviderTier(shopId, client) {
  const shop = await q.getShopForReview(shopId, client);
  if (!shop) throw httpError(404, 'Provider not found');

  const [rules, s] = await Promise.all([
    q.getTierRules(client),
    q.getSettings(['downgrade_window_days', 'downgrade_min_reviews'], client),
  ]);
  const windowDays = s.downgrade_window_days ?? 90;
  const minReviews = s.downgrade_min_reviews ?? 10;

  const points = await q.sumCurrentPoints(shop.id, WINDOWED_REASONS, windowDays, client);
  const targetTier = computeTier(points, rules, Boolean(shop.safety_gate_passed_at));
  const reviewsInWindow = await q.countReviewsInWindow(shop.id, windowDays, client);

  const decision = decideTierAction({
    currentTier: shop.tier, targetTier, reviewsInWindow, minReviews,
    warningAt: shop.tier_warning_at, warningDays: DOWNGRADE_WARNING_DAYS,
  });

  const warningAt = decision.action === 'warn' ? new Date()
    : ['none'].includes(decision.action) ? shop.tier_warning_at
    : null; // upgrade, downgrade, clear_warning all reset the warning
  await q.updateShopTier(shop.id, { points, tier: decision.newTier, warningAt }, client);
  return { tier: decision.newTier, points, action: decision.action };
}

export async function reviewAllProviders() {
  const ids = await q.listShopIdsForReview();
  const summary = { checked: 0, upgraded: 0, warned: 0, downgraded: 0, cleared: 0 };
  for (const id of ids) {
    const r = await withTransaction((client) => reviewProviderTier(id, client));
    summary.checked++;
    if (r.action === 'upgrade') summary.upgraded++;
    if (r.action === 'warn') summary.warned++;
    if (r.action === 'downgrade') summary.downgraded++;
    if (r.action === 'clear_warning') summary.cleared++;
  }
  return summary;
}

export async function getGradingStatus(userId) {
  const shop = await requireShop(userId);
  const attempts = await q.latestAttemptPerKind(shop.id);
  return {
    tier: shop.tier,
    points: shop.points,
    safetyGatePassed: Boolean(shop.safety_gate_passed_at),
    verifiedYears: shop.years_experience,
    onWarning: Boolean(shop.tier_warning_at),
    warningStartedAt: shop.tier_warning_at,
    latestAttempts: attempts.map((a) => ({
      kind: a.kind, scorePct: a.score_pct, passed: a.passed,
      retakeAfter: a.passed ? null : cooldownEndsAt(a.kind, a.submitted_at),
    })),
  };
}
