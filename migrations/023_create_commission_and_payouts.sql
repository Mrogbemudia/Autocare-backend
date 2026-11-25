-- Commission rate per tier and per payment type, in basis points (100 bps = 1%).
CREATE TABLE commission_rates (
  tier         TEXT NOT NULL CHECK (tier IN ('verified', 'certified', 'elite')),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('labor', 'parts', 'call_out')),
  rate_bps     INTEGER NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  PRIMARY KEY (tier, payment_type)
);

-- PLACEHOLDER rates. Replace with your real numbers.
INSERT INTO commission_rates (tier, payment_type, rate_bps) VALUES
  ('verified',  'labor', 1500), ('verified',  'parts', 500), ('verified',  'call_out', 2000),
  ('certified', 'labor', 1200), ('certified', 'parts', 500), ('certified', 'call_out', 1500),
  ('elite',     'labor', 1000), ('elite',     'parts', 500), ('elite',     'call_out', 1000);

-- One row per payment component. The rate used is COPIED here, so changing
-- commission_rates later never rewrites history.
CREATE TABLE payment_splits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      UUID NOT NULL REFERENCES payments (id) ON DELETE RESTRICT,
  shop_id         UUID NOT NULL REFERENCES shops (id) ON DELETE RESTRICT,
  payment_type    TEXT NOT NULL CHECK (payment_type IN ('labor', 'parts', 'call_out')),
  tier_at_payment TEXT NOT NULL CHECK (tier_at_payment IN ('verified', 'certified', 'elite')),
  gross_kobo      BIGINT NOT NULL CHECK (gross_kobo > 0),
  rate_bps        INTEGER NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  commission_kobo BIGINT NOT NULL CHECK (commission_kobo >= 0),
  provider_kobo   BIGINT NOT NULL CHECK (provider_kobo >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (commission_kobo + provider_kobo = gross_kobo),   -- no kobo lost or invented
  UNIQUE (payment_id, payment_type)
);
CREATE INDEX payment_splits_shop_idx ON payment_splits (shop_id, created_at DESC);

-- Payouts to providers (earnings dashboard = splits minus payouts).
CREATE TABLE payouts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id            UUID NOT NULL REFERENCES shops (id) ON DELETE RESTRICT,
  amount_kobo        BIGINT NOT NULL CHECK (amount_kobo > 0),
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'paid', 'failed')),
  provider           TEXT,
  provider_reference TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at            TIMESTAMPTZ,
  UNIQUE (provider, provider_reference)
);
CREATE INDEX payouts_shop_idx ON payouts (shop_id, status);
