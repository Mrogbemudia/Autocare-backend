CREATE TABLE maintenance_templates (
  id                      SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code                    TEXT NOT NULL UNIQUE,
  label                   TEXT NOT NULL,
  default_interval_km     INTEGER CHECK (default_interval_km IS NULL OR default_interval_km > 0),
  default_interval_months INTEGER CHECK (default_interval_months IS NULL OR default_interval_months > 0),
  CHECK (default_interval_km IS NOT NULL OR default_interval_months IS NOT NULL)
);
-- Generic starting points only; owners can edit them per vehicle (check your vehicle's manual).
INSERT INTO maintenance_templates (code, label, default_interval_km, default_interval_months) VALUES
  ('engine_oil',    'Engine oil and filter', 5000,  6),
  ('brake_check',   'Brake inspection',      10000, 12),
  ('tire_rotation', 'Tire rotation',         10000, 6),
  ('air_filter',    'Air filter',            15000, 12);
