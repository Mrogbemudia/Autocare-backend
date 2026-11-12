import { query } from '../db.js';

const REQUEST_SELECT = `
  SELECT sr.id, sr.owner_id, sr.vehicle_id, sr.shop_id, sr.symptoms, sr.urgency, sr.location_type,
         sr.service_address, sr.status, sr.created_at, sr.updated_at,
         s.business_name AS shop_name, s.user_id AS shop_user_id,
         v.vehicle_type, v.make, v.model, v.year, v.plate_number,
         ou.full_name AS owner_name
    FROM service_requests sr
    JOIN shops    s  ON s.id  = sr.shop_id
    JOIN vehicles v  ON v.id  = sr.vehicle_id
    JOIN users    ou ON ou.id = sr.owner_id`;

export async function insertServiceRequest(f) {
  const { rows } = await query(
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
