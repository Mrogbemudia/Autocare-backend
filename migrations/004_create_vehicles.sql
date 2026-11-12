-- owner_id RESTRICT: users are deactivated, never deleted (D-29), and vehicles hold job history.
CREATE TABLE vehicles (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  vehicle_type       TEXT NOT NULL CHECK (vehicle_type IN ('car','suv','bus','truck','motorcycle','tricycle')),
  make               TEXT NOT NULL CHECK (char_length(make)  BETWEEN 1 AND 50),
  model              TEXT NOT NULL CHECK (char_length(model) BETWEEN 1 AND 50),
  year               INTEGER NOT NULL CHECK (year BETWEEN 1950 AND 2100),
  plate_number       TEXT CHECK (plate_number IS NULL OR char_length(plate_number) BETWEEN 3 AND 15),
  vin                TEXT CHECK (vin IS NULL OR char_length(vin) = 17),
  fuel_type          TEXT NOT NULL CHECK (fuel_type IN ('petrol','diesel','cng','electric','hybrid')),
  mileage_km         INTEGER CHECK (mileage_km IS NULL OR mileage_km >= 0),
  mileage_updated_at TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULLs are distinct in a UNIQUE constraint, so many vehicles may have no plate,
  -- but one owner cannot save the same plate twice. The leading owner_id column also
  -- serves "all vehicles of this owner", so no separate index is needed.
  CONSTRAINT vehicles_owner_plate_unique UNIQUE (owner_id, plate_number)
);
