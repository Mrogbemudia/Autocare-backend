CREATE TABLE sos_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             UUID NOT NULL REFERENCES users (id)    ON DELETE RESTRICT,
  vehicle_id           UUID NOT NULL REFERENCES vehicles (id) ON DELETE RESTRICT,
  severity             TEXT NOT NULL CHECK (severity IN ('immediate_hazard','urgent_roadside','standard_repair')),
  hazard_fire          BOOLEAN NOT NULL DEFAULT FALSE,
  hazard_accident      BOOLEAN NOT NULL DEFAULT FALSE,
  hazard_in_traffic    BOOLEAN NOT NULL DEFAULT FALSE,
  hazard_injury        BOOLEAN NOT NULL DEFAULT FALSE,
  description          TEXT CHECK (char_length(description) <= 500),
  -- State is always required: shops are matched by state (D-17), even when GPS works.
  state                TEXT NOT NULL,
  city_area            TEXT NOT NULL,
  landmark             TEXT CHECK (char_length(landmark) <= 200),
  latitude             NUMERIC(9,6) CHECK (latitude  IS NULL OR latitude  BETWEEN  -90 AND  90),
  longitude            NUMERIC(9,6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  accuracy_m           INTEGER CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  location_captured_at TIMESTAMPTZ,
  status               TEXT NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','claimed','en_route','arrived','resolved','cancelled')),
  claimed_by_shop_id   UUID REFERENCES shops (id) ON DELETE RESTRICT,
  claimed_at           TIMESTAMPTZ,
  eta_minutes          INTEGER CHECK (eta_minutes IS NULL OR eta_minutes BETWEEN 1 AND 600),
  cancelled_at         TIMESTAMPTZ,
  resolved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sos_coords_together CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CONSTRAINT sos_claimed_has_shop CHECK (status IN ('open','cancelled') OR claimed_by_shop_id IS NOT NULL)
);
-- SOS shop inbox.
CREATE INDEX sos_open_by_state_idx ON sos_requests (state, created_at) WHERE status = 'open';
-- One active SOS per owner, enforced by the database.
CREATE UNIQUE INDEX sos_one_active_per_owner ON sos_requests (owner_id)
  WHERE status IN ('open','claimed','en_route','arrived');
CREATE INDEX sos_shop_idx ON sos_requests (claimed_by_shop_id) WHERE claimed_by_shop_id IS NOT NULL;
