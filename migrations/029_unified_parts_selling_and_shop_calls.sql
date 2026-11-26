ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS sells_parts BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE call_sessions
  ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops (id) ON DELETE RESTRICT;

ALTER TABLE call_sessions DROP CONSTRAINT IF EXISTS call_sessions_one_context;
ALTER TABLE call_sessions ADD CONSTRAINT call_sessions_one_context CHECK (
  (service_request_id IS NOT NULL)::int +
  (interview_request_id IS NOT NULL)::int +
  (work_order_id IS NOT NULL)::int +
  (parts_order_id IS NOT NULL)::int +
  (shop_id IS NOT NULL)::int = 1
);

CREATE UNIQUE INDEX IF NOT EXISTS call_sessions_one_live_shop_idx
  ON call_sessions (shop_id)
  WHERE shop_id IS NOT NULL AND status IN ('requested', 'ringing', 'connected');
