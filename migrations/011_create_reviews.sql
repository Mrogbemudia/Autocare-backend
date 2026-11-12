-- Schema only. Acceptance criteria for US-15 are still your exercise (Q11); adjust with a new migration if needed.
CREATE TABLE reviews (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id              UUID NOT NULL UNIQUE REFERENCES work_orders (id) ON DELETE RESTRICT,
  owner_id                   UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  shop_id                    UUID NOT NULL REFERENCES shops (id) ON DELETE RESTRICT,
  rating_quality             SMALLINT NOT NULL CHECK (rating_quality BETWEEN 1 AND 5),
  rating_price_transparency  SMALLINT NOT NULL CHECK (rating_price_transparency BETWEEN 1 AND 5),
  rating_communication       SMALLINT NOT NULL CHECK (rating_communication BETWEEN 1 AND 5),
  rating_speed               SMALLINT NOT NULL CHECK (rating_speed BETWEEN 1 AND 5),
  comment                    TEXT CHECK (char_length(comment) <= 1000),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reviews_shop_idx ON reviews (shop_id);
