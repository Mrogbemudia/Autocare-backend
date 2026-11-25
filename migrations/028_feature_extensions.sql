ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'shop', 'admin', 'parts_shop', 'support'));

CREATE TABLE IF NOT EXISTS verification_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type     TEXT NOT NULL CHECK (owner_type IN ('shop', 'parts_shop')),
  owner_id       UUID NOT NULL,
  doc_type       TEXT NOT NULL CHECK (doc_type IN (
                   'nin', 'cac', 'apprenticeship_letter', 'certificate', 'other')),
  label          TEXT,
  reference_number TEXT,
  public_id      TEXT,
  resource_type  TEXT,
  format         TEXT,
  version        BIGINT,
  bytes          BIGINT,
  status         TEXT NOT NULL DEFAULT 'submitted'
                 CHECK (status IN ('submitted', 'approved', 'rejected')),
  review_note    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_documents_owner_idx
  ON verification_documents (owner_type, owner_id, created_at DESC);

ALTER TABLE parts ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS image_public_id TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS image_resource_type TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS image_format TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS image_version BIGINT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS image_bytes BIGINT;

ALTER TABLE payments ALTER COLUMN work_order_id DROP NOT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS parts_order_id UUID REFERENCES parts_orders (id) ON DELETE RESTRICT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method TEXT
  CHECK (payment_method IN ('paystack', 'bank_transfer'));
ALTER TABLE payments ADD COLUMN IF NOT EXISTS bank_transfer_reference TEXT;

CREATE TABLE IF NOT EXISTS call_signals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id UUID NOT NULL REFERENCES call_sessions (id) ON DELETE CASCADE,
  sender_id      UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  kind           TEXT NOT NULL CHECK (kind IN ('offer', 'answer', 'ice', 'hangup')),
  payload        JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_signals_session_idx
  ON call_signals (call_session_id, created_at);

ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS work_order_id UUID REFERENCES work_orders (id) ON DELETE RESTRICT;
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS parts_order_id UUID REFERENCES parts_orders (id) ON DELETE RESTRICT;
ALTER TABLE call_sessions DROP CONSTRAINT IF EXISTS call_sessions_one_context;
ALTER TABLE call_sessions ADD CONSTRAINT call_sessions_one_context CHECK (
  (service_request_id IS NOT NULL)::int +
  (interview_request_id IS NOT NULL)::int +
  (work_order_id IS NOT NULL)::int +
  (parts_order_id IS NOT NULL)::int = 1
);
