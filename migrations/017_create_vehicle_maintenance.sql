CREATE TABLE vehicle_maintenance_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      UUID NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
  template_id     SMALLINT NOT NULL REFERENCES maintenance_templates (id) ON DELETE RESTRICT,
  interval_km     INTEGER CHECK (interval_km IS NULL OR interval_km > 0),
  interval_months INTEGER CHECK (interval_months IS NULL OR interval_months > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vehicle_id, template_id),
  CHECK (interval_km IS NOT NULL OR interval_months IS NOT NULL)
);

CREATE TABLE vehicle_service_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    UUID NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
  template_id   SMALLINT REFERENCES maintenance_templates (id) ON DELETE RESTRICT,
  service_date  DATE NOT NULL,
  mileage_km    INTEGER CHECK (mileage_km IS NULL OR mileage_km >= 0),
  source        TEXT NOT NULL CHECK (source IN ('manual','kaza_job')),
  work_order_id UUID REFERENCES work_orders (id) ON DELETE RESTRICT,
  notes         TEXT CHECK (char_length(notes) <= 500),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vehicle_service_log_vehicle_idx ON vehicle_service_log (vehicle_id, service_date DESC);
