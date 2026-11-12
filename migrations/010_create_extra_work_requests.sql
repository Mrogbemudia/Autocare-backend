CREATE TABLE extra_work_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   UUID NOT NULL REFERENCES work_orders (id) ON DELETE RESTRICT,
  description     TEXT NOT NULL CHECK (char_length(description) BETWEEN 5 AND 1000),
  reason          TEXT NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 1000),
  extra_cost_kobo BIGINT NOT NULL CHECK (extra_cost_kobo > 0),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  response_note   TEXT,
  responded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX extra_work_work_order_idx ON extra_work_requests (work_order_id);
-- At most one pending extra-work request per job.
CREATE UNIQUE INDEX extra_work_one_pending ON extra_work_requests (work_order_id) WHERE status = 'pending';

-- Approval Lock backstop (D-31): even if application code has a bug, the database refuses
-- to move a job into a working stage while an extra-work request is pending.
CREATE FUNCTION enforce_approval_lock() RETURNS trigger AS $$
BEGIN
  IF NEW.status IN ('in_repair','testing','ready_for_pickup','completed')
     AND NEW.status IS DISTINCT FROM OLD.status
     AND EXISTS (SELECT 1 FROM extra_work_requests e
                  WHERE e.work_order_id = NEW.id AND e.status = 'pending') THEN
    RAISE EXCEPTION 'Approval Lock: extra work is awaiting owner approval'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER work_orders_approval_lock
  BEFORE UPDATE OF status ON work_orders
  FOR EACH ROW EXECUTE FUNCTION enforce_approval_lock();
