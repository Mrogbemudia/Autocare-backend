-- 025: auto-parts shops, catalogue with vehicle compatibility, orders, delivery tracking.

-- New account role for parts-shop owners.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'shop', 'admin', 'parts_shop'));

CREATE TABLE parts_shops (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  business_name       TEXT NOT NULL CHECK (char_length(business_name) BETWEEN 2 AND 120),
  description         TEXT CHECK (char_length(description) <= 1000),
  state               TEXT NOT NULL,
  city_area           TEXT NOT NULL,
  address             TEXT NOT NULL,
  latitude            NUMERIC(9,6) CHECK (latitude  BETWEEN -90  AND 90),
  longitude           NUMERIC(9,6) CHECK (longitude BETWEEN -180 AND 180),
  opening_hours       TEXT,
  offers_pickup       BOOLEAN NOT NULL DEFAULT TRUE,
  offers_delivery     BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_fee_kobo   BIGINT NOT NULL DEFAULT 0 CHECK (delivery_fee_kobo >= 0),  -- flat; PLACEHOLDER model
  verification_status TEXT NOT NULL DEFAULT 'pending'
                      CHECK (verification_status IN ('pending', 'verified', 'rejected', 'suspended')),
  verification_note   TEXT,
  verified_at         TIMESTAMPTZ,
  verified_by         UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (offers_pickup OR offers_delivery)
);
CREATE INDEX parts_shops_discovery_idx ON parts_shops (state, city_area)
  WHERE verification_status = 'verified';

-- Parts shops are payees too (see migration 024).
ALTER TABLE payment_splits ADD CONSTRAINT payment_splits_parts_shop_fk
  FOREIGN KEY (parts_shop_id) REFERENCES parts_shops (id) ON DELETE RESTRICT;
ALTER TABLE payouts
  ALTER COLUMN shop_id DROP NOT NULL,
  ADD COLUMN parts_shop_id UUID REFERENCES parts_shops (id) ON DELETE RESTRICT;
ALTER TABLE payouts ADD CONSTRAINT payouts_one_payee CHECK (
  (shop_id IS NOT NULL)::int + (parts_shop_id IS NOT NULL)::int = 1);
CREATE INDEX payouts_parts_shop_idx ON payouts (parts_shop_id, status);

CREATE TABLE parts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parts_shop_id UUID NOT NULL REFERENCES parts_shops (id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 150),
  brand         TEXT,
  part_number   TEXT,
  condition     TEXT NOT NULL CHECK (condition IN ('new', 'foreign_used', 'local_used')),
  price_kobo    BIGINT NOT NULL CHECK (price_kobo > 0),
  stock_qty     INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX parts_shop_idx ON parts (parts_shop_id) WHERE is_active;

-- Which vehicles a part fits. model NULL = every model of that make.
CREATE TABLE part_compatibility (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id   UUID NOT NULL REFERENCES parts (id) ON DELETE CASCADE,
  make      TEXT NOT NULL,
  model     TEXT,
  year_from SMALLINT NOT NULL CHECK (year_from BETWEEN 1950 AND 2100),
  year_to   SMALLINT NOT NULL CHECK (year_to   BETWEEN 1950 AND 2100),
  CHECK (year_to >= year_from)
);
CREATE INDEX part_compat_lookup_idx ON part_compatibility (lower(make), lower(model));
CREATE INDEX part_compat_part_idx ON part_compatibility (part_id);

CREATE TABLE parts_orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id           UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,   -- owner, or technician ordering for a job
  parts_shop_id      UUID NOT NULL REFERENCES parts_shops (id) ON DELETE RESTRICT,
  work_order_id      UUID REFERENCES work_orders (id) ON DELETE RESTRICT,
  vehicle_id         UUID REFERENCES vehicles (id) ON DELETE RESTRICT,
  fulfilment_type    TEXT NOT NULL CHECK (fulfilment_type IN ('delivery', 'pickup')),
  status             TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN (
                       'awaiting_payment', 'paid', 'preparing', 'ready_for_pickup',
                       'out_for_delivery', 'completed', 'cancelled')),
  subtotal_kobo      BIGINT NOT NULL CHECK (subtotal_kobo > 0),
  delivery_fee_kobo  BIGINT NOT NULL DEFAULT 0 CHECK (delivery_fee_kobo >= 0),
  total_kobo         BIGINT NOT NULL,
  payment_id         UUID REFERENCES payments (id) ON DELETE RESTRICT,
  cancelled_reason   TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (total_kobo = subtotal_kobo + delivery_fee_kobo),            -- the server computes it; the DB double-checks
  CHECK (fulfilment_type = 'delivery' OR delivery_fee_kobo = 0),
  -- a pickup order can never be "out for delivery"; a delivery order can never be "ready for pickup"
  CHECK (NOT (fulfilment_type = 'pickup'   AND status = 'out_for_delivery')),
  CHECK (NOT (fulfilment_type = 'delivery' AND status = 'ready_for_pickup'))
);
CREATE INDEX parts_orders_buyer_idx ON parts_orders (buyer_id, created_at DESC);
CREATE INDEX parts_orders_shop_idx  ON parts_orders (parts_shop_id, status);

CREATE TABLE parts_order_items (
  order_id        UUID NOT NULL REFERENCES parts_orders (id) ON DELETE CASCADE,
  part_id         UUID NOT NULL REFERENCES parts (id) ON DELETE RESTRICT,
  name_snapshot   TEXT NOT NULL,                     -- the listing may change later; the order must not
  qty             INTEGER NOT NULL CHECK (qty > 0),
  unit_price_kobo BIGINT NOT NULL CHECK (unit_price_kobo >= 0),
  PRIMARY KEY (order_id, part_id)
);

-- Delivery details for orders with fulfilment_type = 'delivery' (service enforces the pairing).
-- No courier phone number is stored: contact goes through the masked call feature.
CREATE TABLE parts_deliveries (
  order_id          UUID PRIMARY KEY REFERENCES parts_orders (id) ON DELETE CASCADE,
  address           TEXT NOT NULL,
  latitude          NUMERIC(9,6) CHECK (latitude  BETWEEN -90  AND 90),
  longitude         NUMERIC(9,6) CHECK (longitude BETWEEN -180 AND 180),
  courier_name      TEXT,
  courier_reference TEXT,
  last_latitude     NUMERIC(9,6) CHECK (last_latitude  BETWEEN -90  AND 90),   -- optional rider position
  last_longitude    NUMERIC(9,6) CHECK (last_longitude BETWEEN -180 AND 180),
  last_position_at  TIMESTAMPTZ
);

-- Tracking timeline. The customer's page polls this (same pattern as job status).
CREATE TABLE parts_order_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES parts_orders (id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT CHECK (char_length(note) <= 500),
  latitude   NUMERIC(9,6) CHECK (latitude  BETWEEN -90  AND 90),
  longitude  NUMERIC(9,6) CHECK (longitude BETWEEN -180 AND 180),
  actor_id   UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX parts_order_events_idx ON parts_order_events (order_id, created_at);
