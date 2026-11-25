import test from 'node:test';
import assert from 'node:assert/strict';
import {
  questionCountFor, pickQuestions, gradeAnswers, hasPassed, experiencePoints,
  computeTier, decideTierAction, isExpired, cooldownEndsAt,
} from '../src/services/grading.rules.js';

const pool = (n) => Array.from({ length: n }, (_, i) => ({ id: `q${i}`, min_years: i % 12 }));
const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

test('question count grows with years', () => {
  assert.equal(questionCountFor('experience', 1), 10);
  assert.equal(questionCountFor('experience', 5), 15);
  assert.equal(questionCountFor('experience', 12), 20);
  assert.equal(questionCountFor('safety', 30), 10);
});

test('picked paper has no duplicates and leans hard for senior claims', () => {
  const picked = pickQuestions(pool(100), { kind: 'experience', years: 10, rng: seeded(7) });
  assert.equal(picked.length, 20);
  assert.equal(new Set(picked.map((q) => q.id)).size, 20);
  assert.ok(picked.filter((q) => q.min_years >= 5).length >= 12);
});

test('small bank is rejected', () => {
  assert.throws(() => pickQuestions(pool(5), { kind: 'safety', years: 0 }), /QUESTION_BANK_TOO_SMALL/);
});

test('two papers differ (randomised)', () => {
  const a = pickQuestions(pool(100), { kind: 'safety', years: 0, rng: seeded(1) }).map((q) => q.id).join();
  const b = pickQuestions(pool(100), { kind: 'safety', years: 0, rng: seeded(2) }).map((q) => q.id).join();
  assert.notEqual(a, b);
});

test('grading counts unanswered as wrong', () => {
  const served = [{ question_id: 'a', correct_index: 1 }, { question_id: 'b', correct_index: 0 }];
  const g = gradeAnswers(served, new Map([['a', 1]]));
  assert.equal(g.correct, 1);
  assert.equal(g.scorePct, 50);
  assert.equal(hasPassed('safety', 79), false);
  assert.equal(hasPassed('safety', 80), true);
});

test('experience points are capped and score-scaled', () => {
  assert.equal(experiencePoints(20, 100), 40);
  assert.equal(experiencePoints(5, 80), 16);
  assert.equal(experiencePoints(0, 100), 0);
});

test('tier needs the safety gate', () => {
  const rules = [{ tier: 'verified', min_points: 0 }, { tier: 'certified', min_points: 100 }, { tier: 'elite', min_points: 300 }];
  assert.equal(computeTier(500, rules, false), 'verified');
  assert.equal(computeTier(150, rules, true), 'certified');
  assert.equal(computeTier(300, rules, true), 'elite');
});

test('downgrade flow: needs reviews, warns, waits, then drops one tier', () => {
  const base = { currentTier: 'elite', targetTier: 'verified', minReviews: 10 };
  const now = new Date('2026-12-01T00:00:00Z');
  assert.equal(decideTierAction({ ...base, reviewsInWindow: 3, warningAt: null, now }).action, 'none');
  assert.equal(decideTierAction({ ...base, reviewsInWindow: 12, warningAt: null, now }).action, 'warn');
  assert.equal(decideTierAction({ ...base, reviewsInWindow: 12, warningAt: '2026-11-25T00:00:00Z', now }).action, 'none');
  const d = decideTierAction({ ...base, reviewsInWindow: 12, warningAt: '2026-11-10T00:00:00Z', now });
  assert.deepEqual([d.action, d.newTier], ['downgrade', 'certified']);
});

test('recovery clears the warning, rise upgrades immediately', () => {
  assert.equal(decideTierAction({ currentTier: 'certified', targetTier: 'certified', reviewsInWindow: 20, minReviews: 10, warningAt: '2026-11-01T00:00:00Z' }).action, 'clear_warning');
  assert.equal(decideTierAction({ currentTier: 'verified', targetTier: 'certified', reviewsInWindow: 0, minReviews: 10, warningAt: null }).action, 'upgrade');
});

test('expiry and cooldown', () => {
  assert.equal(isExpired('2026-11-24T10:00:00Z', new Date('2026-11-24T11:30:00Z')), true);
  assert.equal(isExpired('2026-11-24T10:00:00Z', new Date('2026-11-24T10:30:00Z')), false);
  assert.equal(cooldownEndsAt('safety', '2026-11-24T10:00:00Z').toISOString(), '2026-11-25T10:00:00.000Z');
});
