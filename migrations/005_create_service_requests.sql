CREATE TABLE service_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES users (id)    ON DELETE RESTRICT,
  vehicle_id      UUID NOT NULL REFERENCES vehicles (id) ON DELETE RESTRICT,
  shop_id         UUID NOT NULL REFERENCES shops (id)    ON DELETE RESTRICT,
  symptoms        TEXT NOT NULL CHECK (char_length(symptoms) BETWEEN 10 AND 2000),
  urgency         TEXT NOT NULL DEFAULT 'standard' CHECK (urgency IN ('standard','urgent')),
  location_type   TEXT NOT NULL CHECK (location_type IN ('visit_shop','mobile')),
  service_address TEXT CHECK (char_length(service_address) <= 300),
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','quoted','accepted','booked','completed','cancelled')),
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_requests_mobile_needs_address
    CHECK (location_type <> 'mobile' OR service_address IS NOT NULL)
);
CREATE INDEX service_requests_shop_status_idx ON service_requests (shop_id, status);
CREATE INDEX service_requests_owner_idx       ON service_requests (owner_id, created_at DESC);
CREATE INDEX service_requests_vehicle_idx     ON service_requests (vehicle_id);
