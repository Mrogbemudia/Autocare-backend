import { query } from '../db.js';

export async function insertBooking({ quoteId, proposedAt }, client) {
  const { rows } = await client.query(
    'INSERT INTO bookings (quote_id, proposed_at) VALUES ($1, $2) RETURNING id, quote_id, proposed_at, status, created_at',
    [quoteId, proposedAt],
  );
  return rows[0];
}

export async function findBookingForUpdate(id, client) {
  const { rows } = await client.query(
    `SELECT b.id, b.quote_id, b.proposed_at, b.status,
            q.service_request_id, q.total_kobo,
            sr.owner_id, sr.shop_id, sr.vehicle_id, sr.status AS request_status,
            s.user_id AS shop_user_id
       FROM bookings b
       JOIN quotes q            ON q.id  = b.quote_id
       JOIN service_requests sr ON sr.id = q.service_request_id
       JOIN shops s             ON s.id  = sr.shop_id
      WHERE b.id = $1
        FOR UPDATE OF b, sr`,
    [id],
  );
  return rows[0] ?? null;
}

export async function setBookingStatus(id, status, declineReason, client) {
  await client.query(
    `UPDATE bookings SET status = $2::text, decline_reason = $3, responded_at = now(), updated_at = now()
      WHERE id = $1`,
    [id, status, declineReason ?? null],
  );
}

export async function hasLiveBooking(quoteId, client) {
  const { rows } = await client.query(
    `SELECT 1 FROM bookings WHERE quote_id = $1 AND status IN ('proposed','confirmed') LIMIT 1`, [quoteId]);
  return rows.length > 0;
}

export async function findAcceptedQuote(requestId, client) {
  const { rows } = await client.query(
    `SELECT id, total_kobo FROM quotes WHERE service_request_id = $1 AND status = 'accepted'`, [requestId]);
  return rows[0] ?? null;
}

export async function listBookingsForRequest(requestId) {
  const { rows } = await query(
    `SELECT b.id, b.quote_id, b.proposed_at, b.status, b.decline_reason, b.responded_at, b.created_at
       FROM bookings b JOIN quotes q ON q.id = b.quote_id
      WHERE q.service_request_id = $1 ORDER BY b.created_at DESC`,
    [requestId],
  );
  return rows;
}
