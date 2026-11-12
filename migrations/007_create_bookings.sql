CREATE TABLE bookings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id       UUID NOT NULL REFERENCES quotes (id) ON DELETE RESTRICT,
  proposed_at    TIMESTAMPTZ NOT NULL,
  status         TEXT NOT NULL DEFAULT 'proposed'
                 CHECK (status IN ('proposed','confirmed','declined','cancelled')),
  decline_reason TEXT,
  responded_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bookings_one_live_per_quote ON bookings (quote_id)
  WHERE status IN ('proposed','confirmed');
