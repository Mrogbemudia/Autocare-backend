-- Tier rules: thresholds live in data, so you can tune them without a deploy.
CREATE TABLE tier_rules (
  tier                TEXT PRIMARY KEY CHECK (tier IN ('verified', 'certified', 'elite')),
  min_points          INTEGER NOT NULL CHECK (min_points >= 0),
  min_reviews_window  SMALLINT NOT NULL DEFAULT 10 CHECK (min_reviews_window >= 0),
  window_days         SMALLINT NOT NULL DEFAULT 90 CHECK (window_days > 0)
);

-- PLACEHOLDER thresholds. Replace with your real numbers.
INSERT INTO tier_rules (tier, min_points) VALUES
  ('verified', 0), ('certified', 100), ('elite', 300);

-- Question bank for the safety gate and the experience test.
CREATE TABLE grading_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          TEXT NOT NULL CHECK (kind IN ('safety', 'experience')),
  min_years     SMALLINT NOT NULL DEFAULT 0 CHECK (min_years BETWEEN 0 AND 60),
                -- eligible only when the provider claims at least this many years
  specialty     TEXT,                      -- NULL = general question
  body          TEXT NOT NULL CHECK (char_length(body) BETWEEN 10 AND 1000),
  options       JSONB NOT NULL CHECK (jsonb_typeof(options) = 'array'),
  correct_index SMALLINT NOT NULL CHECK (correct_index >= 0),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX grading_questions_pick_idx ON grading_questions (kind, min_years) WHERE is_active;

-- One attempt = one randomized paper.
CREATE TABLE grading_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      UUID NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('safety', 'experience')),
  claimed_years SMALLINT NOT NULL,
  score_pct    SMALLINT CHECK (score_pct BETWEEN 0 AND 100),
  passed       BOOLEAN,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ
);
CREATE INDEX grading_attempts_shop_idx ON grading_attempts (shop_id, kind, started_at DESC);

-- The questions served in an attempt. Grading happens on the server from this table,
-- so the answer key never has to reach the browser.
CREATE TABLE grading_attempt_questions (
  attempt_id   UUID NOT NULL REFERENCES grading_attempts (id) ON DELETE CASCADE,
  question_id  UUID NOT NULL REFERENCES grading_questions (id) ON DELETE RESTRICT,
  position     SMALLINT NOT NULL,
  chosen_index SMALLINT,
  is_correct   BOOLEAN,
  PRIMARY KEY (attempt_id, question_id)
);

-- Specialty badges.
CREATE TABLE specialty_badges (
  code  TEXT PRIMARY KEY,
  label TEXT NOT NULL
);
INSERT INTO specialty_badges (code, label) VALUES
  ('ev', 'EV Systems'), ('diesel', 'Diesel Engines'), ('ac', 'Air Conditioning'),
  ('electrical', 'Auto Electrical'), ('transmission', 'Transmission'), ('bodywork', 'Bodywork');

CREATE TABLE shop_badges (
  shop_id    UUID NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
  badge_code TEXT NOT NULL REFERENCES specialty_badges (code) ON DELETE RESTRICT,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, badge_code)
);

-- Append-only points ledger. Points are the sum of this table, which gives you the
-- 90-day rolling window and an audit trail for appeals.
CREATE TABLE points_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    UUID NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
  delta      INTEGER NOT NULL CHECK (delta <> 0),
  reason     TEXT NOT NULL CHECK (reason IN
             ('experience_test', 'cac', 'alt_id', 'job_completed', 'review', 'badge', 'penalty', 'admin_adjustment')),
  ref_id     UUID,                         -- review, work order, attempt ... (no FK: many tables)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX points_events_shop_idx ON points_events (shop_id, created_at DESC);
