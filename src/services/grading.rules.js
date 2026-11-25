// Pure grading rules: no database, no HTTP. Everything here is unit-tested.
// Numbers marked PLACEHOLDER are mine; replace them with your real policy.

export const TIER_ORDER = ['verified', 'certified', 'elite'];

// Points that only count while they are inside the rolling window.
// Everything else (experience test, CAC, alt ID, equipment, kit, badges, admin) persists.
export const WINDOWED_REASONS = [
  'job_completed', 'review', 'rating', 'completion_rate',
  'response_time', 'punctuality', 'penalty',
];

export const PASS_PCT = { safety: 80, experience: 60 };          // PLACEHOLDER
export const ATTEMPT_MINUTES = 60;                                // PLACEHOLDER
export const RETAKE_COOLDOWN_HOURS = { safety: 24, experience: 72 }; // PLACEHOLDER
export const DOWNGRADE_WARNING_DAYS = 14;                         // PLACEHOLDER

export function questionCountFor(kind, years) {
  if (kind === 'safety') return 10;
  if (years <= 2) return 10;
  if (years <= 9) return 15;
  return 20;
}

function shuffle(items, rng) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Picks a random paper. For experience tests, about 60% of questions come from the
 * "hard" band (min_years >= half the claimed years), so more years means harder papers.
 * `pool` rows look like { id, min_years }.
 */
export function pickQuestions(pool, { kind, years, rng = Math.random }) {
  const count = questionCountFor(kind, years);
  if (pool.length < count) throw new Error('QUESTION_BANK_TOO_SMALL');
  if (kind === 'safety') return shuffle(pool, rng).slice(0, count);

  const cut = Math.ceil(years / 2);
  const hard = shuffle(pool.filter((q) => q.min_years >= cut), rng);
  const easy = shuffle(pool.filter((q) => q.min_years < cut), rng);
  const hardTarget = Math.min(hard.length, Math.ceil(count * 0.6));
  const chosen = [...hard.slice(0, hardTarget), ...easy.slice(0, count - hardTarget)];
  if (chosen.length < count) {
    chosen.push(...hard.slice(hardTarget, hardTarget + (count - chosen.length)));
  }
  return shuffle(chosen, rng);
}

/** served: [{ question_id, correct_index }], answers: Map(questionId -> chosenIndex). */
export function gradeAnswers(served, answers) {
  const results = served.map((s) => {
    const chosen = answers.has(s.question_id) ? answers.get(s.question_id) : null;
    return { questionId: s.question_id, chosen, isCorrect: chosen === s.correct_index };
  });
  const correct = results.filter((r) => r.isCorrect).length;
  const scorePct = served.length === 0 ? 0 : Math.round((correct / served.length) * 100);
  return { results, correct, total: served.length, scorePct };
}

export const hasPassed = (kind, scorePct) => scorePct >= PASS_PCT[kind];

/** Up to 4 points per verified year (max 10 years), scaled by score. Max 40. PLACEHOLDER. */
export function experiencePoints(years, scorePct) {
  return Math.round(Math.min(years, 10) * 4 * (scorePct / 100));
}

export const isExpired = (startedAt, now = new Date()) =>
  now - new Date(startedAt) > ATTEMPT_MINUTES * 60_000;

export function cooldownEndsAt(kind, submittedAt) {
  return new Date(new Date(submittedAt).getTime() + RETAKE_COOLDOWN_HOURS[kind] * 3_600_000);
}

/** rules: [{ tier, min_points }]. Without the safety gate you cannot rise above 'verified'. */
export function computeTier(points, rules, safetyPassed) {
  if (!safetyPassed) return 'verified';
  let best = 'verified';
  for (const r of rules) {
    if (points >= r.min_points && TIER_ORDER.indexOf(r.tier) > TIER_ORDER.indexOf(best)) best = r.tier;
  }
  return best;
}

/**
 * What to do at a tier review.
 *  - Upgrades are immediate.
 *  - A downgrade needs enough reviews in the window, then a warning, then a grace period,
 *    and drops ONE tier at a time.
 */
export function decideTierAction({
  currentTier, targetTier, reviewsInWindow, minReviews,
  warningAt, now = new Date(), warningDays = DOWNGRADE_WARNING_DAYS,
}) {
  const cur = TIER_ORDER.indexOf(currentTier);
  const tgt = TIER_ORDER.indexOf(targetTier);

  if (tgt > cur) return { action: 'upgrade', newTier: targetTier };
  if (tgt === cur) return warningAt ? { action: 'clear_warning', newTier: currentTier } : { action: 'none', newTier: currentTier };

  if (reviewsInWindow < minReviews) return { action: 'none', newTier: currentTier };
  if (!warningAt) return { action: 'warn', newTier: currentTier };
  const elapsedDays = (now - new Date(warningAt)) / 86_400_000;
  if (elapsedDays >= warningDays) return { action: 'downgrade', newTier: TIER_ORDER[cur - 1] };
  return { action: 'none', newTier: currentTier };
}
