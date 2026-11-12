CREATE TABLE work_orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         UUID NOT NULL UNIQUE REFERENCES bookings (id)        ON DELETE RESTRICT,
  service_request_id UUID NOT NULL UNIQUE REFERENCES service_requests (id) ON DELETE RESTRICT,
  quote_id           UUID NOT NULL REFERENCES quotes (id)    ON DELETE RESTRICT,
  owner_id           UUID NOT NULL REFERENCES users (id)     ON DELETE RESTRICT,
  shop_id            UUID NOT NULL REFERENCES shops (id)     ON DELETE RESTRICT,
  vehicle_id         UUID NOT NULL REFERENCES vehicles (id)  ON DELETE RESTRICT,
  status             TEXT NOT NULL DEFAULT 'inspection'
                     CHECK (status IN ('inspection','approval_pending','in_repair','testing',
                                       'ready_for_pickup','completed','cancelled')),
  -- Copy of the accepted quote total at the moment the job was created (the locked price).
  quoted_total_kobo  BIGINT NOT NULL CHECK (quoted_total_kobo >= 0),
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX work_orders_shop_status_idx  ON work_orders (shop_id, status);
CREATE INDEX work_orders_owner_status_idx ON work_orders (owner_id, status);
CREATE INDEX work_orders_vehicle_idx      ON work_orders (vehicle_id);
