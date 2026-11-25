-- 026: client dashboard: reminders, vehicle documents, insurance partners, masked calls.

-- In-app notifications (no SMS in the MVP).
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN (
               'maintenance_due', 'document_expiring', 'job_update',
               'order_update', 'insurance_update', 'call_missed', 'system')),
  title      TEXT NOT NULL CHECK (char_length(title) <= 150),
  body       TEXT CHECK (char_length(body) <= 500),
  ref_type   TEXT,
  ref_id     UUID,
  dedupe_key TEXT,                                  -- e.g. 'maint:<vehicle>:<template>:2026-12'
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The reminder job can run daily without ever creating the same reminder twice.
CREATE UNIQUE INDEX notifications_dedupe_idx ON notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE reminder_settings (
  user_id              UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  maintenance_lead_days SMALLINT NOT NULL DEFAULT 14 CHECK (maintenance_lead_days BETWEEN 0 AND 120),
  maintenance_lead_km   INTEGER  NOT NULL DEFAULT 500 CHECK (maintenance_lead_km >= 0),
  document_lead_days    SMALLINT NOT NULL DEFAULT 30 CHECK (document_lead_days BETWEEN 0 AND 180),
  in_app_enabled        BOOLEAN  NOT NULL DEFAULT TRUE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Document expiry dates (insurance, road worthiness, vehicle licence ...) drive renewal reminders.
CREATE TABLE vehicle_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id       UUID NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
  doc_type         TEXT NOT NULL CHECK (doc_type IN (
                     'insurance', 'road_worthiness', 'vehicle_license', 'proof_of_ownership', 'other')),
  label            TEXT CHECK (char_length(label) <= 100),
  reference_number TEXT,
  issued_on        DATE,
  expires_on       DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on)
);
CREATE INDEX vehicle_documents_vehicle_idx ON vehicle_documents (vehicle_id);
CREATE INDEX vehicle_documents_expiry_idx ON vehicle_documents (expires_on) WHERE expires_on IS NOT NULL;

-- Insurance: Kaza refers owners to licensed insurers. Kaza does not underwrite or sell policies.
CREATE TABLE insurers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 2 AND 120),
  description        TEXT CHECK (char_length(description) <= 1000),
  website_url        TEXT,
  licence_reference  TEXT,                         -- admin records the licence they checked
  is_active          BOOLEAN NOT NULL DEFAULT FALSE,   -- only active after admin review
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE insurance_products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id  UUID NOT NULL REFERENCES insurers (id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN (
                'third_party', 'third_party_fire_theft', 'comprehensive', 'motorcycle', 'commercial')),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  summary     TEXT CHECK (char_length(summary) <= 1000),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX insurance_products_insurer_idx ON insurance_products (insurer_id) WHERE is_active;

CREATE TABLE insurance_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  vehicle_id  UUID NOT NULL REFERENCES vehicles (id) ON DELETE RESTRICT,
  product_id  UUID NOT NULL REFERENCES insurance_products (id) ON DELETE RESTRICT,
  status      TEXT NOT NULL DEFAULT 'submitted'
              CHECK (status IN ('submitted', 'contacted', 'quoted', 'purchased', 'declined', 'cancelled')),
  owner_note  TEXT CHECK (char_length(owner_note) <= 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- No duplicate open requests for the same vehicle and product.
CREATE UNIQUE INDEX insurance_requests_open_idx ON insurance_requests (vehicle_id, product_id)
  WHERE status IN ('submitted', 'contacted', 'quoted');
CREATE INDEX insurance_requests_owner_idx ON insurance_requests (owner_id, created_at DESC);

-- Masked calls. This table stores NO phone numbers: the numbers stay in `users`,
-- and only the server (through the telephony provider) ever uses them.
CREATE TABLE call_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id  UUID NOT NULL REFERENCES service_requests (id) ON DELETE RESTRICT,
  initiated_by        UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  recipient_id        UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  status              TEXT NOT NULL DEFAULT 'requested' CHECK (status IN (
                        'requested', 'ringing', 'connected', 'completed', 'missed', 'declined', 'failed')),
  provider            TEXT,
  provider_session_id TEXT,
  started_at          TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ,
  duration_seconds    INTEGER CHECK (duration_seconds >= 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (initiated_by <> recipient_id),
  UNIQUE (provider, provider_session_id)
);
-- One live call per job conversation, enforced by the database.
CREATE UNIQUE INDEX call_sessions_one_live_idx ON call_sessions (service_request_id)
  WHERE status IN ('requested', 'ringing', 'connected');
CREATE INDEX call_sessions_recipient_idx ON call_sessions (recipient_id, created_at DESC);
