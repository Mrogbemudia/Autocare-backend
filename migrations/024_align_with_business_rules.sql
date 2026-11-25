-- 024: aligns migrations 020-023 with the settled business rules.
-- It only ALTERs, so it is safe whether or not 020-023 already ran on your dev branch.
-- (Constraint names below are Postgres's auto-generated defaults; DROP ... IF EXISTS
--  keeps this from failing if one differs. Check with \d shops if a rule seems missing.)

-- 1. Alternative ID options: NIN, guarantor, apprenticeship letter, trade association, etc.
ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_alt_id_type_check;
ALTER TABLE shops ADD CONSTRAINT shops_alt_id_type_check CHECK (alt_id_type IN (
  'nin', 'voters_card', 'drivers_license', 'intl_passport',
  'guarantor', 'apprenticeship_letter', 'trade_association', 'other'));

-- 2. Points ledger: every scoring input from the grading model.
ALTER TABLE points_events DROP CONSTRAINT IF EXISTS points_events_reason_check;
ALTER TABLE points_events ADD CONSTRAINT points_events_reason_check CHECK (reason IN (
  'experience_test', 'cac', 'alt_id', 'equipment', 'mobility_kit', 'rating',
  'completion_rate', 'response_time', 'punctuality', 'job_completed', 'review',
  'badge', 'penalty', 'admin_adjustment'));

-- 3. Platform-wide settings you can tune without a deploy. PLACEHOLDER values.
CREATE TABLE platform_settings (
  key         TEXT PRIMARY KEY CHECK (key ~ '^[a-z_]+$'),
  int_value   INTEGER NOT NULL,
  description TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO platform_settings (key, int_value, description) VALUES
  ('warranty_days',              30,  'Uniform warranty length for in-app paid jobs (not tier-based)'),
  ('arrival_auto_confirm_min',   10,  'Minutes before arrival auto-confirms if the customer does not respond'),
  ('arrival_geofence_m',         150, 'Max metres from the job location for a valid GPS check-in'),
  ('provider_late_threshold_min', 30, 'Minutes late after which the call-out fee is fully refunded'),
  ('downgrade_window_days',      90,  'Rolling window for tier review'),
  ('downgrade_min_reviews',      10,  'Minimum reviews in the window before a downgrade can happen');

-- 4. Call-out fee: held by the licensed provider until arrival, then released.
--    No OTP: arrival = GPS check-in inside the geofence + customer confirmation,
--    auto-confirmed after arrival_auto_confirm_min unless disputed.
ALTER TABLE call_out_fees DROP CONSTRAINT IF EXISTS call_out_fees_status_check;
UPDATE call_out_fees SET status = 'held' WHERE status = 'paid';
UPDATE call_out_fees SET status = 'released_to_provider' WHERE status = 'forfeited_to_provider';
ALTER TABLE call_out_fees ADD CONSTRAINT call_out_fees_status_check CHECK (status IN (
  'awaiting_payment', 'held', 'released_to_provider', 'credited_to_bill',
  'refunded_full', 'refunded_partial'));

ALTER TABLE call_out_fees
  -- Why the fee ended the way it did. Mirrors the refund rules:
  --   refunded:  provider_no_show, provider_late, provider_cancelled, customer_cancelled_before_dispatch, dispute_upheld
  --   kept:      customer_cancelled_en_route, customer_absent, safety_abort, arrived_confirmed
  ADD COLUMN outcome_code TEXT CHECK (outcome_code IN (
    'provider_no_show', 'provider_late', 'provider_cancelled',
    'customer_cancelled_before_dispatch', 'customer_cancelled_en_route',
    'customer_absent', 'safety_abort', 'dispute_upheld', 'arrived_confirmed')),
  ADD COLUMN dispatched_at          TIMESTAMPTZ,
  ADD COLUMN en_route_at            TIMESTAMPTZ,
  ADD COLUMN arrived_at             TIMESTAMPTZ,
  ADD COLUMN arrival_latitude       NUMERIC(9,6) CHECK (arrival_latitude  BETWEEN -90  AND 90),
  ADD COLUMN arrival_longitude      NUMERIC(9,6) CHECK (arrival_longitude BETWEEN -180 AND 180),
  ADD COLUMN arrival_distance_m     INTEGER CHECK (arrival_distance_m >= 0),
  ADD COLUMN customer_confirmed_at  TIMESTAMPTZ,
  ADD COLUMN auto_confirm_at        TIMESTAMPTZ,
  ADD COLUMN arrival_disputed_at    TIMESTAMPTZ;

ALTER TABLE call_out_fees ADD CONSTRAINT call_out_fees_refund_needs_outcome CHECK (
  status NOT IN ('refunded_full', 'refunded_partial') OR outcome_code IS NOT NULL);
ALTER TABLE call_out_fees ADD CONSTRAINT call_out_fees_full_refund_amount CHECK (
  status <> 'refunded_full' OR refund_kobo = amount_kobo);

-- 5. Commission: the call-out cut is a flat platform rate (same for every tier).
--    Labor stays tier-based. PLACEHOLDERS: 15 / 12 / 10 percent for labor, 15 percent call-out.
UPDATE commission_rates SET rate_bps = 1500 WHERE payment_type = 'call_out';
UPDATE commission_rates SET rate_bps = 1500 WHERE payment_type = 'labor' AND tier = 'verified';
UPDATE commission_rates SET rate_bps = 1200 WHERE payment_type = 'labor' AND tier = 'certified';
UPDATE commission_rates SET rate_bps = 1000 WHERE payment_type = 'labor' AND tier = 'elite';

-- 6. Parts money goes to the parts shop, and the shop pays the commission,
--    so a split's payee can be a provider OR a parts shop (table added with the parts migration).
ALTER TABLE payment_splits
  ALTER COLUMN shop_id DROP NOT NULL,
  ALTER COLUMN tier_at_payment DROP NOT NULL,
  ADD COLUMN payee_type TEXT NOT NULL DEFAULT 'provider' CHECK (payee_type IN ('provider', 'parts_shop')),
  ADD COLUMN parts_shop_id UUID;   -- FK to parts_shops is added in the parts migration

ALTER TABLE payment_splits ADD CONSTRAINT payment_splits_payee_check CHECK (
  (payee_type = 'provider'   AND shop_id IS NOT NULL AND tier_at_payment IS NOT NULL AND parts_shop_id IS NULL)
  OR
  (payee_type = 'parts_shop' AND parts_shop_id IS NOT NULL AND shop_id IS NULL));
