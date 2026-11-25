-- Platform-set distance bands: the same for every provider.
CREATE TABLE distance_bands (
  id         SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label      TEXT NOT NULL,
  min_km     NUMERIC(6,2) NOT NULL CHECK (min_km >= 0),
  max_km     NUMERIC(6,2) NOT NULL,
  fee_kobo   BIGINT NOT NULL CHECK (fee_kobo >= 0),
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (max_km > min_km),
  UNIQUE (min_km)
  -- Overlap between bands is checked in the service on admin edit
  -- (an exclusion constraint would need the btree_gist extension).
);

-- PLACEHOLDER fees (kobo). 100 kobo = 1 naira. Replace with your real bands.
INSERT INTO distance_bands (label, min_km, max_km, fee_kobo) VALUES
  ('0-5 km',   0,  5, 300000),
  ('5-10 km',  5, 10, 500000),
  ('10-20 km', 10, 20, 800000),
  ('20-40 km', 20, 40, 1500000);

-- One call-out fee per booking, paid before dispatch.
CREATE TABLE call_out_fees (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       UUID NOT NULL UNIQUE REFERENCES bookings (id) ON DELETE RESTRICT,
  band_id          SMALLINT NOT NULL REFERENCES distance_bands (id) ON DELETE RESTRICT,
  distance_km      NUMERIC(6,2) NOT NULL CHECK (distance_km >= 0),
  amount_kobo      BIGINT NOT NULL CHECK (amount_kobo >= 0),   -- snapshot of the band fee
  status           TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN (
                     'awaiting_payment', 'paid', 'credited_to_bill',
                     'refunded_full', 'refunded_partial', 'forfeited_to_provider')),
  payment_id       UUID REFERENCES payments (id) ON DELETE RESTRICT,
  refund_kobo      BIGINT NOT NULL DEFAULT 0 CHECK (refund_kobo >= 0),
  refund_reason    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (refund_kobo <= amount_kobo),
  -- Dispatch is only possible once the fee is paid: the service checks status = 'paid'.
  CHECK (status <> 'awaiting_payment' OR payment_id IS NULL)
);
