import { pool } from '../db.js';

// Every function takes an optional `client` so it can join a transaction.
const run = (client, text, params) => (client ?? pool).query(text, params);

export async function findShopByUserId(userId, client) {
  const { rows } = await run(client,
    `SELECT id, user_id, verification_status, tier, points, years_experience,
            safety_gate_passed_at, tier_warning_at, tier_changed_at
       FROM shops WHERE user_id = $1`, [userId]);
  return rows[0] ?? null;
}

export async function listActiveQuestions(kind, years, client) {
  const { rows } = await run(client,
    `SELECT id, min_years FROM grading_questions
      WHERE kind = $1 AND is_active AND min_years <= $2`, [kind, years]);
  return rows;
}

export async function listQuestionsByAttempt(attemptId, language = 'en', client) {
  const { rows } = await run(client,
    // correct_index is deliberately NOT selected: the answer key never leaves the server.
    `SELECT q.id, COALESCE(t.body,q.body) AS body,
            COALESCE(t.options,q.options) AS options,
            COALESCE(t.audio_url,q.audio_url) AS audio_url, a.position
       FROM grading_attempt_questions a
       JOIN grading_questions q ON q.id = a.question_id
       LEFT JOIN grading_question_translations t
         ON t.question_id=q.id AND t.language=$2 AND t.reviewed_at IS NOT NULL
      WHERE a.attempt_id = $1
      ORDER BY a.position`, [attemptId,language]);
  return rows;
}

export async function createAttempt({ shopId, kind, claimedYears, mode, language }, client) {
  const { rows } = await run(client,
    `INSERT INTO grading_attempts (shop_id, kind, claimed_years, mode, language)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, started_at`, [shopId, kind, claimedYears, mode, language]);
  return rows[0];
}

export async function insertAttemptQuestions(attemptId, questionIds, client) {
  await run(client,
    `INSERT INTO grading_attempt_questions (attempt_id, question_id, position)
     SELECT $1, t.q, t.ord - 1
       FROM unnest($2::uuid[]) WITH ORDINALITY AS t(q, ord)`, [attemptId, questionIds]);
}

export async function findOpenAttempt(shopId, kind, client) {
  const { rows } = await run(client,
    `SELECT id, started_at, mode, language FROM grading_attempts
      WHERE shop_id = $1 AND kind = $2 AND submitted_at IS NULL
      ORDER BY started_at DESC LIMIT 1`, [shopId, kind]);
  return rows[0] ?? null;
}

export async function findLastFinishedFailure(shopId, kind, client) {
  const { rows } = await run(client,
    `SELECT submitted_at FROM grading_attempts
      WHERE shop_id = $1 AND kind = $2 AND passed = FALSE
      ORDER BY submitted_at DESC LIMIT 1`, [shopId, kind]);
  return rows[0] ?? null;
}

export async function getAttemptForUpdate(attemptId, shopId, client) {
  const { rows } = await run(client,
    `SELECT id, kind, claimed_years, started_at, submitted_at
       FROM grading_attempts WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [attemptId, shopId]);
  return rows[0] ?? null;
}

export async function getServedWithKey(attemptId, client) {
  const { rows } = await run(client,
    `SELECT a.question_id, q.correct_index
       FROM grading_attempt_questions a
       JOIN grading_questions q ON q.id = a.question_id
      WHERE a.attempt_id = $1`, [attemptId]);
  return rows;
}

export async function recordAnswers(attemptId, results, client) {
  await run(client,
    `UPDATE grading_attempt_questions g
        SET chosen_index = v.chosen, is_correct = v.ok
       FROM unnest($2::uuid[], $3::int[], $4::bool[]) AS v(qid, chosen, ok)
      WHERE g.attempt_id = $1 AND g.question_id = v.qid`,
    [attemptId, results.map((r) => r.questionId), results.map((r) => r.chosen), results.map((r) => r.isCorrect)]);
}

export async function finishAttempt(attemptId, { scorePct, passed }, client) {
  await run(client,
    `UPDATE grading_attempts SET score_pct = $2, passed = $3, submitted_at = now()
      WHERE id = $1`, [attemptId, scorePct, passed]);
}

export async function markSafetyGatePassed(shopId, client) {
  await run(client,
    `UPDATE shops SET safety_gate_passed_at = COALESCE(safety_gate_passed_at, now()), updated_at = now()
      WHERE id = $1`, [shopId]);
}

export async function setVerifiedYears(shopId, years, client) {
  await run(client,
    `UPDATE shops SET years_experience = GREATEST(COALESCE(years_experience, 0), $2), updated_at = now()
      WHERE id = $1`, [shopId, years]);
}

export async function sumPointsByReason(shopId, reason, client) {
  const { rows } = await run(client,
    `SELECT COALESCE(SUM(delta), 0)::int AS total FROM points_events
      WHERE shop_id = $1 AND reason = $2`, [shopId, reason]);
  return rows[0].total;
}

export async function insertPointsEvent({ shopId, delta, reason, refId = null }, client) {
  await run(client,
    `INSERT INTO points_events (shop_id, delta, reason, ref_id) VALUES ($1, $2, $3, $4)`,
    [shopId, delta, reason, refId]);
}

/** Static reasons count forever; windowed reasons only inside the rolling window. */
export async function sumCurrentPoints(shopId, windowedReasons, windowDays, client) {
  const { rows } = await run(client,
    `SELECT COALESCE(SUM(delta) FILTER (
              WHERE reason <> ALL($2::text[])
                 OR created_at >= now() - make_interval(days => $3)
            ), 0)::int AS total
       FROM points_events WHERE shop_id = $1`, [shopId, windowedReasons, windowDays]);
  return rows[0].total;
}

// ASSUMPTION: reviews has work_order_id and created_at (design doc, table 14).
export async function countReviewsInWindow(shopId, windowDays, client) {
  const { rows } = await run(client,
    `SELECT count(*)::int AS n
       FROM reviews r JOIN work_orders w ON w.id = r.work_order_id
      WHERE w.shop_id = $1 AND r.created_at >= now() - make_interval(days => $2)`,
    [shopId, windowDays]);
  return rows[0].n;
}

export async function getTierRules(client) {
  const { rows } = await run(client, `SELECT tier, min_points FROM tier_rules`, []);
  return rows;
}

export async function getSettings(keys, client) {
  const { rows } = await run(client,
    `SELECT key, int_value FROM platform_settings WHERE key = ANY($1::text[])`, [keys]);
  return Object.fromEntries(rows.map((r) => [r.key, r.int_value]));
}

export async function getShopForReview(shopId, client) {
  const { rows } = await run(client,
    `SELECT id, tier, tier_warning_at, safety_gate_passed_at
       FROM shops WHERE id = $1 FOR UPDATE`, [shopId]);
  return rows[0] ?? null;
}

export async function updateShopTier(shopId, { points, tier, warningAt }, client) {
  await run(client,
    `UPDATE shops
        SET points = GREATEST(0, $2),
            tier_changed_at = CASE WHEN tier <> $3::text THEN now() ELSE tier_changed_at END,
            tier = $3::text,
            tier_warning_at = $4::timestamptz,
            updated_at = now()
      WHERE id = $1`, [shopId, points, tier, warningAt]);
}

export async function listShopIdsForReview(client) {
  const { rows } = await run(client,
    `SELECT id FROM shops WHERE verification_status = 'verified'`, []);
  return rows.map((r) => r.id);
}

export async function latestAttemptPerKind(shopId, client) {
  const { rows } = await run(client,
    `SELECT DISTINCT ON (kind) kind, score_pct, passed, submitted_at
       FROM grading_attempts WHERE shop_id = $1 AND submitted_at IS NOT NULL
      ORDER BY kind, submitted_at DESC`, [shopId]);
  return rows;
}
