CREATE TABLE repair_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id         UUID NOT NULL REFERENCES work_orders (id) ON DELETE RESTRICT,
  version               INTEGER NOT NULL CHECK (version > 0),
  technician_findings   TEXT NOT NULL CHECK (char_length(technician_findings) BETWEEN 10 AND 2000),
  parts_plan            TEXT NOT NULL CHECK (char_length(parts_plan) BETWEEN 2 AND 2000),
  labour_plan           TEXT NOT NULL CHECK (char_length(labour_plan) BETWEEN 2 AND 2000),
  notes                 TEXT CHECK (char_length(notes) <= 1000),
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','superseded')),
  submitted_by          UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  reviewed_by           UUID REFERENCES users (id) ON DELETE RESTRICT,
  review_note           TEXT CHECK (char_length(review_note) <= 500),
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (work_order_id, version)
);
CREATE UNIQUE INDEX repair_plans_one_pending ON repair_plans (work_order_id)
  WHERE status = 'pending';

CREATE TABLE repair_media (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id  UUID REFERENCES service_requests (id) ON DELETE CASCADE,
  repair_plan_id      UUID REFERENCES repair_plans (id) ON DELETE CASCADE,
  public_id           TEXT NOT NULL UNIQUE,
  resource_type       TEXT NOT NULL CHECK (resource_type IN ('image','video')),
  format              TEXT NOT NULL,
  version             BIGINT NOT NULL CHECK (version > 0),
  bytes               BIGINT NOT NULL CHECK (
    (resource_type = 'image' AND bytes BETWEEN 1 AND 10485760) OR
    (resource_type = 'video' AND bytes BETWEEN 1 AND 52428800)
  ),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((service_request_id IS NULL) <> (repair_plan_id IS NULL))
);
CREATE INDEX repair_media_request_idx ON repair_media (service_request_id, created_at)
  WHERE service_request_id IS NOT NULL;
CREATE INDEX repair_media_plan_idx ON repair_media (repair_plan_id, created_at)
  WHERE repair_plan_id IS NOT NULL;

CREATE FUNCTION enforce_repair_plan_approval() RETURNS trigger AS $$
BEGIN
  IF NEW.status IN ('in_repair','testing','ready_for_pickup','completed')
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NOT EXISTS (SELECT 1 FROM repair_plans p
                      WHERE p.work_order_id = NEW.id AND p.status = 'approved') THEN
    RAISE EXCEPTION 'Repair plan is awaiting owner approval'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER work_orders_repair_plan_approval
  BEFORE UPDATE OF status ON work_orders
  FOR EACH ROW EXECUTE FUNCTION enforce_repair_plan_approval();
