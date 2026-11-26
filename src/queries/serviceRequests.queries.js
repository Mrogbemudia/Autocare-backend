import { query } from '../db.js';

const REQUEST_SELECT = `
  SELECT sr.id, sr.owner_id, sr.vehicle_id, sr.shop_id, sr.symptoms, sr.urgency, sr.location_type,
         sr.service_address, sr.status, sr.created_at, sr.updated_at,
         s.business_name AS shop_name, s.user_id AS shop_user_id,
         s.user_id AS shop_owner_user_id,
         v.vehicle_type, v.make, v.model, v.year, v.plate_number,
         ou.full_name AS owner_name,
         (SELECT COALESCE(json_agg(json_build_object(
                   'id', m.id, 'public_id', m.public_id, 'resource_type', m.resource_type,
                   'format', m.format, 'version', m.version, 'bytes', m.bytes)
                 ORDER BY m.created_at, m.id), '[]'::json)
            FROM repair_media m WHERE m.service_request_id = sr.id) AS media,
         (SELECT COALESCE(json_agg(json_build_object(
                   'id', q.id, 'version', q.version, 'status', q.status,
                   'labour_kobo', q.labour_kobo, 'items_total_kobo', q.items_total_kobo,
                   'total_kobo', q.total_kobo, 'estimated_duration_hours', q.estimated_duration_hours,
                   'notes', q.notes, 'rejection_reason', q.rejection_reason, 'created_at', q.created_at,
                   'items', (SELECT COALESCE(json_agg(json_build_object(
                                      'description', qi.description, 'quantity', qi.quantity,
                                      'unit_price_kobo', qi.unit_price_kobo,
                                      'line_total_kobo', qi.quantity * qi.unit_price_kobo)
                                    ORDER BY qi.description), '[]'::json)
                               FROM quote_items qi WHERE qi.quote_id = q.id))
                 ORDER BY q.version DESC), '[]'::json)
            FROM quotes q WHERE q.service_request_id = sr.id) AS quotes,
         (SELECT COALESCE(json_agg(json_build_object(
                   'id', b.id, 'proposed_at', b.proposed_at, 'status', b.status,
                   'decline_reason', b.decline_reason, 'responded_at', b.responded_at,
                   'created_at', b.created_at,
                   'owner_user_id', sr.owner_id,
                   'shop_owner_user_id', s.user_id)
                 ORDER BY b.created_at DESC), '[]'::json)
            FROM bookings b JOIN quotes bq ON bq.id = b.quote_id
            JOIN shops s ON s.id = sr.shop_id
           WHERE bq.service_request_id = sr.id) AS bookings
    FROM service_requests sr
    JOIN shops    s  ON s.id  = sr.shop_id
    JOIN vehicles v  ON v.id  = sr.vehicle_id
    JOIN users    ou ON ou.id = sr.owner_id`;

export async function insertServiceRequest(f, client) {
  const { rows } = await (client ?? { query }).query(
    `INSERT INTO service_requests (owner_id, vehicle_id, shop_id, symptoms, urgency, location_type, service_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [f.ownerId, f.vehicleId, f.shopId, f.symptoms, f.urgency, f.locationType, f.serviceAddress ?? null],
  );
  return rows[0];
}

export async function findRequestById(id, client) {
  const { rows } = await (client ?? { query }).query(`${REQUEST_SELECT} WHERE sr.id = $1`, [id]);
  return rows[0] ?? null;
}

// Row lock: used inside transactions so two actions on one request cannot interleave.
export async function findRequestForUpdate(id, client) {
  const { rows } = await client.query(`${REQUEST_SELECT} WHERE sr.id = $1 FOR UPDATE OF sr`, [id]);
  return rows[0] ?? null;
}

export async function listRequests({ ownerId, shopId, status, limit, offset }) {
  const where = [];
  const params = [];
  if (ownerId) { params.push(ownerId); where.push(`sr.owner_id = $${params.length}`); }
  if (shopId)  { params.push(shopId);  where.push(`sr.shop_id = $${params.length}`); }
  if (status)  { params.push(status);  where.push(`sr.status = $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows: c } = await query(`SELECT count(*) AS total FROM service_requests sr ${whereSql}`, params);
  params.push(limit, offset);
  const { rows } = await query(
    `${REQUEST_SELECT} ${whereSql} ORDER BY sr.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: c[0].total };
}

export async function setRequestStatus(id, status, client) {
  await client.query(
    `UPDATE service_requests SET status = $2::text,
            cancelled_at = CASE WHEN $2::text = 'cancelled' THEN now() ELSE cancelled_at END,
            updated_at = now()
      WHERE id = $1`,
    [id, status],
  );
}
