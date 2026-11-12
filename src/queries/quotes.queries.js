import { query } from '../db.js';

export async function nextQuoteVersion(requestId, client) {
  const { rows } = await client.query(
    'SELECT COALESCE(MAX(version), 0) + 1 AS v FROM quotes WHERE service_request_id = $1',
    [requestId],
  );
  return rows[0].v;
}

export async function supersedeActiveQuote(requestId, client, newStatus = 'superseded') {
  await client.query(
    `UPDATE quotes SET status = $2::text, updated_at = now()
      WHERE service_request_id = $1 AND status = 'active'`,
    [requestId, newStatus],
  );
}

export async function insertQuote(f, client) {
  const { rows } = await client.query(
    `INSERT INTO quotes (service_request_id, version, labour_kobo, items_total_kobo, total_kobo,
                         estimated_duration_hours, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [f.requestId, f.version, f.labourKobo, f.itemsTotalKobo, f.totalKobo, f.estimatedDurationHours ?? null, f.notes ?? null],
  );
  return rows[0];
}

export async function insertQuoteItems(quoteId, items, client) {
  await client.query(
    `INSERT INTO quote_items (quote_id, description, quantity, unit_price_kobo)
     SELECT $1::uuid, d, q, p FROM unnest($2::text[], $3::int[], $4::bigint[]) AS t(d, q, p)`,
    [quoteId, items.map((i) => i.description), items.map((i) => i.quantity), items.map((i) => i.unitPriceKobo)],
  );
}

const QUOTE_SELECT = `
  SELECT q.id, q.service_request_id, q.version, q.status, q.labour_kobo, q.items_total_kobo, q.total_kobo,
         q.estimated_duration_hours, q.notes, q.rejection_reason, q.locked_at, q.created_at,
         (SELECT COALESCE(json_agg(json_build_object(
                   'id', i.id, 'description', i.description, 'quantity', i.quantity,
                   'unit_price_kobo', i.unit_price_kobo, 'line_total_kobo', i.quantity * i.unit_price_kobo)
                 ORDER BY i.description), '[]'::json)
            FROM quote_items i WHERE i.quote_id = q.id) AS items
    FROM quotes q`;

export async function listQuotesForRequest(requestId, client) {
  const { rows } = await (client ?? { query }).query(
    `${QUOTE_SELECT} WHERE q.service_request_id = $1 ORDER BY q.version DESC`, [requestId]);
  return rows;
}

export async function findQuoteWithRequestForUpdate(quoteId, client) {
  const { rows } = await client.query(
    `SELECT q.id, q.service_request_id, q.status, q.total_kobo,
            sr.owner_id, sr.shop_id, sr.status AS request_status
       FROM quotes q JOIN service_requests sr ON sr.id = q.service_request_id
      WHERE q.id = $1
        FOR UPDATE OF q, sr`,
    [quoteId],
  );
  return rows[0] ?? null;
}

export async function acceptQuote(id, client) {
  const { rowCount } = await client.query(
    `UPDATE quotes SET status = 'accepted', locked_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'active'`, [id]);
  return rowCount === 1;
}

export async function rejectQuote(id, reason, client) {
  const { rowCount } = await client.query(
    `UPDATE quotes SET status = 'rejected', rejection_reason = $2, updated_at = now()
      WHERE id = $1 AND status = 'active'`, [id, reason ?? null]);
  return rowCount === 1;
}
