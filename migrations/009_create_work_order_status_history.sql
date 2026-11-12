CREATE TABLE work_order_status_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES work_orders (id) ON DELETE CASCADE,
  from_status   TEXT,
  to_status     TEXT NOT NULL,
  changed_by    UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX work_order_status_history_idx ON work_order_status_history (work_order_id, created_at);
