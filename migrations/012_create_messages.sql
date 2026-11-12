CREATE TABLE messages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id UUID NOT NULL REFERENCES service_requests (id) ON DELETE RESTRICT,
  sender_id          UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  body               TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON messages (service_request_id, created_at);

CREATE TABLE conversation_reads (
  user_id            UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  service_request_id UUID NOT NULL REFERENCES service_requests (id) ON DELETE CASCADE,
  last_read_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, service_request_id)
);
