-- Reference table; rows are added in a later migration/seed once the content has been reviewed.
CREATE TABLE diagnostic_codes (
  id              SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL CHECK (kind IN ('obd','symptom')),
  title           TEXT NOT NULL,
  possible_causes TEXT NOT NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('safe_to_drive','see_mechanic_soon','stop_driving')),
  keywords        TEXT[] NOT NULL DEFAULT '{}'
);
CREATE INDEX diagnostic_codes_keywords_idx ON diagnostic_codes USING GIN (keywords);
