CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  full_name     TEXT        NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 100),
  phone         TEXT        NOT NULL CHECK (phone ~ '^\+234[0-9]{10}$'),
  role          TEXT        NOT NULL CHECK (role IN ('owner', 'shop', 'admin')),
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));
