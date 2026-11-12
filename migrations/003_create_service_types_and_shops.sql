CREATE TABLE service_types (
  id           SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code         TEXT    NOT NULL UNIQUE,
  label        TEXT    NOT NULL,
  is_emergency BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO service_types (code, label, is_emergency) VALUES
  ('mobile_mechanic', 'Mobile Mechanic',  TRUE),
  ('heavy_towing',    'Heavy Towing',     TRUE),
  ('open_24_7',       '24/7 Shop',        TRUE),
  ('tire_specialist', 'Tire Specialist',  FALSE),
  ('ev_technician',   'EV Technician',    FALSE),
  ('general_repair',  'General Repair',   FALSE);

CREATE TABLE shops (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  business_name       TEXT NOT NULL CHECK (char_length(business_name) BETWEEN 2 AND 120),
  description         TEXT CHECK (char_length(description) <= 1000),
  state               TEXT NOT NULL,
  city_area           TEXT NOT NULL,
  address             TEXT NOT NULL,
  opening_hours       TEXT,
  certification_notes TEXT CHECK (char_length(certification_notes) <= 2000),
  verification_status TEXT NOT NULL DEFAULT 'pending'
                      CHECK (verification_status IN ('pending', 'verified', 'rejected', 'suspended')),
  verification_note   TEXT,
  verified_at         TIMESTAMPTZ,
  verified_by         UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX shops_discovery_idx ON shops (state, city_area)
  WHERE verification_status = 'verified';

CREATE TABLE shop_services (
  shop_id         UUID     NOT NULL REFERENCES shops (id)         ON DELETE CASCADE,
  service_type_id SMALLINT NOT NULL REFERENCES service_types (id) ON DELETE RESTRICT,
  PRIMARY KEY (shop_id, service_type_id)
);
CREATE INDEX shop_services_type_idx ON shop_services (service_type_id);
