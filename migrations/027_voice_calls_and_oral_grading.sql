-- 027: in-app voice calls, spoken / interview grading, Pidgin support, support-agent role.

-- 1. Customer-service staff who run grading interviews.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'shop', 'admin', 'parts_shop', 'support'));

-- Language for screens and tests: 'en' English, 'pcm' Nigerian Pidgin.
ALTER TABLE users ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'en'
  CHECK (preferred_language IN ('en', 'pcm'));

-- 2. Questions can be read aloud and translated. The English row in grading_questions
--    stays the single source of truth: the correct answer index is shared by every language.
ALTER TABLE grading_questions ADD COLUMN audio_url TEXT;   -- recorded English audio (e.g. on Cloudinary)

CREATE TABLE grading_question_translations (
  question_id UUID NOT NULL REFERENCES grading_questions (id) ON DELETE CASCADE,
  language    TEXT NOT NULL CHECK (language IN ('pcm')),
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 10 AND 1000),
  options     JSONB NOT NULL CHECK (jsonb_typeof(options) = 'array'),  -- same count and order as the English options (service checks)
  audio_url   TEXT,
  reviewed_at TIMESTAMPTZ,       -- set when a native speaker has checked the wording
  PRIMARY KEY (question_id, language)
);

-- 3. How an attempt was taken.
ALTER TABLE grading_attempts
  ADD COLUMN mode TEXT NOT NULL DEFAULT 'text' CHECK (mode IN ('text', 'audio', 'interview')),
  ADD COLUMN language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'pcm')),
  ADD COLUMN interviewer_id UUID REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN interviewer_notes TEXT CHECK (char_length(interviewer_notes) <= 2000);
ALTER TABLE grading_attempts ADD CONSTRAINT grading_attempts_interview_needs_agent
  CHECK (mode <> 'interview' OR interviewer_id IS NOT NULL);

ALTER TABLE grading_attempt_questions ADD COLUMN agent_note TEXT CHECK (char_length(agent_note) <= 500);

-- 4. Interview booking. The agent asks the same question bank aloud and marks each answer,
--    so the result flows into the same points, safety gate and tier engine.
CREATE TABLE interview_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id        UUID NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('safety', 'experience')),
  language       TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'pcm')),
  claimed_years  SMALLINT CHECK (claimed_years BETWEEN 0 AND 60),
  status         TEXT NOT NULL DEFAULT 'requested' CHECK (status IN (
                   'requested', 'scheduled', 'in_progress', 'completed', 'no_show', 'cancelled')),
  interviewer_id UUID REFERENCES users (id) ON DELETE SET NULL,
  scheduled_at   TIMESTAMPTZ,
  attempt_id     UUID REFERENCES grading_attempts (id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (kind = 'safety' OR claimed_years IS NOT NULL),
  CHECK (status <> 'scheduled'   OR (interviewer_id IS NOT NULL AND scheduled_at IS NOT NULL)),
  CHECK (status <> 'in_progress' OR interviewer_id IS NOT NULL)
);
-- One open interview per provider and test type.
CREATE UNIQUE INDEX interview_requests_open_idx ON interview_requests (shop_id, kind)
  WHERE status IN ('requested', 'scheduled', 'in_progress');
CREATE INDEX interview_requests_queue_idx ON interview_requests (status, scheduled_at);

-- 5. Calls now work for job conversations AND grading interviews.
--    Audio and signalling are handled by a managed voice provider; Kaza stores only
--    who may call whom and the outcome. Still no phone numbers in this table.
ALTER TABLE call_sessions
  ALTER COLUMN service_request_id DROP NOT NULL,
  ADD COLUMN interview_request_id UUID REFERENCES interview_requests (id) ON DELETE RESTRICT,
  ADD COLUMN ring_expires_at TIMESTAMPTZ,
  ADD COLUMN ended_reason TEXT CHECK (ended_reason IN (
    'hangup', 'no_answer', 'declined', 'network', 'timeout', 'provider_error'));

ALTER TABLE call_sessions ADD CONSTRAINT call_sessions_one_context CHECK (
  (service_request_id IS NOT NULL)::int + (interview_request_id IS NOT NULL)::int = 1);

CREATE UNIQUE INDEX call_sessions_one_live_interview_idx ON call_sessions (interview_request_id)
  WHERE interview_request_id IS NOT NULL AND status IN ('requested', 'ringing', 'connected');

-- The app polls for incoming calls while it is open.
CREATE INDEX call_sessions_incoming_idx ON call_sessions (recipient_id)
  WHERE status IN ('requested', 'ringing');
