CREATE TABLE quotes (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id       UUID NOT NULL REFERENCES service_requests (id) ON DELETE RESTRICT,
  version                  INTEGER NOT NULL CHECK (version > 0),
  status                   TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','accepted','rejected','superseded','withdrawn')),
  labour_kobo              BIGINT NOT NULL DEFAULT 0 CHECK (labour_kobo >= 0),
  items_total_kobo         BIGINT NOT NULL CHECK (items_total_kobo >= 0),
  total_kobo               BIGINT NOT NULL CHECK (total_kobo >= 0),
  estimated_duration_hours INTEGER CHECK (estimated_duration_hours IS NULL OR estimated_duration_hours > 0),
  notes                    TEXT CHECK (char_length(notes) <= 1000),
  rejection_reason         TEXT,
  locked_at                TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_request_id, version),
  CONSTRAINT quotes_total_is_sum CHECK (total_kobo = labour_kobo + items_total_kobo)
);
-- One live (active or accepted) quote per request, enforced by the database.
CREATE UNIQUE INDEX quotes_one_live_per_request ON quotes (service_request_id)
  WHERE status IN ('active','accepted');

CREATE TABLE quote_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id        UUID NOT NULL REFERENCES quotes (id) ON DELETE CASCADE,
  description     TEXT NOT NULL CHECK (char_length(description) BETWEEN 2 AND 200),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_kobo BIGINT  NOT NULL CHECK (unit_price_kobo >= 0)
);
CREATE INDEX quote_items_quote_idx ON quote_items (quote_id);
