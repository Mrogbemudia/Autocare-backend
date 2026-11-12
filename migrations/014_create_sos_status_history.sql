CREATE TABLE sos_status_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_request_id UUID NOT NULL REFERENCES sos_requests (id) ON DELETE CASCADE,
  from_status    TEXT,
  to_status      TEXT NOT NULL,
  changed_by     UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sos_status_history_idx ON sos_status_history (sos_request_id, created_at);
