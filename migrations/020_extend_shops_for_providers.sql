-- A "shop" row now represents any provider: an individual technician or a workshop.
-- Existing quote / booking / work-order code keeps working because shops.id is unchanged.

ALTER TABLE shops
  ADD COLUMN provider_type TEXT NOT NULL DEFAULT 'workshop'
    CHECK (provider_type IN ('individual', 'workshop')),
  ADD COLUMN service_mode TEXT NOT NULL DEFAULT 'shop_only'
    CHECK (service_mode IN ('shop_only', 'mobile_only', 'hybrid')),

  -- Grading. "verified" here is the LOWEST grade tier. It is separate from
  -- verification_status (admin approval), which stays as it is.
  ADD COLUMN tier TEXT NOT NULL DEFAULT 'verified'
    CHECK (tier IN ('verified', 'certified', 'elite')),
  ADD COLUMN points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  ADD COLUMN tier_changed_at TIMESTAMPTZ,
  ADD COLUMN tier_warning_at TIMESTAMPTZ,        -- set when the downgrade warning stage starts

  ADD COLUMN years_experience SMALLINT CHECK (years_experience BETWEEN 0 AND 60),
  ADD COLUMN safety_gate_passed_at TIMESTAMPTZ,  -- NULL = gate not passed

  -- Optional identity paths: CAC registration or an alternative ID (text only, no uploads yet).
  ADD COLUMN cac_number TEXT,
  ADD COLUMN alt_id_type TEXT CHECK (alt_id_type IN ('nin', 'voters_card', 'drivers_license', 'intl_passport', 'other')),
  ADD COLUMN alt_id_reference TEXT,

  -- Needed for distance-based call-out fees. Required for mobile_only and hybrid.
  ADD COLUMN latitude  NUMERIC(9,6) CHECK (latitude  BETWEEN -90  AND 90),
  ADD COLUMN longitude NUMERIC(9,6) CHECK (longitude BETWEEN -180 AND 180),
  ADD COLUMN service_radius_km SMALLINT CHECK (service_radius_km BETWEEN 1 AND 200),

  ADD COLUMN strikes SMALLINT NOT NULL DEFAULT 0 CHECK (strikes >= 0);

-- Database-enforced rules (D-31):
-- 1. Mobile providers must have a base location and radius.
ALTER TABLE shops ADD CONSTRAINT shops_mobile_needs_location CHECK (
  service_mode = 'shop_only'
  OR (latitude IS NOT NULL AND longitude IS NOT NULL AND service_radius_km IS NOT NULL)
);
-- 2. Certified and Elite require the safety gate.
ALTER TABLE shops ADD CONSTRAINT shops_tier_needs_safety_gate CHECK (
  tier = 'verified' OR safety_gate_passed_at IS NOT NULL
);

CREATE INDEX shops_mode_tier_idx ON shops (service_mode, tier)
  WHERE verification_status = 'verified';
