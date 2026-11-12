CREATE TABLE payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id      UUID NOT NULL REFERENCES work_orders (id) ON DELETE RESTRICT,
  owner_id           UUID NOT NULL REFERENCES users (id)       ON DELETE RESTRICT,
  provider           TEXT NOT NULL,
  provider_reference TEXT NOT NULL,
  amount_kobo        BIGINT NOT NULL CHECK (amount_kobo > 0),
  currency           TEXT NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','paid','released','refunded','disputed','failed')),
  paid_at            TIMESTAMPTZ,
  released_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Idempotency: the same gateway event can never create a second payment.
  CONSTRAINT payments_provider_ref_unique UNIQUE (provider, provider_reference)
);
CREATE INDEX payments_work_order_idx ON payments (work_order_id);
