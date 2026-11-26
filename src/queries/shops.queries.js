import { query } from '../db.js';

const SORTS = {
  rating: 'r.avg_rating DESC NULLS LAST, s.created_at DESC',
  newest: 's.created_at DESC',
}; // ORDER BY cannot be a parameter, so we map an allow-listed key to a constant fragment.

const escapeLike = (s) => s.replace(/[\\%_]/g, '\\$&');

const SHOP_SELECT = `
  SELECT s.id, s.business_name, s.description, s.state, s.city_area, s.address,
         s.opening_hours, s.certification_notes, s.verification_status, s.verification_note,
         s.sells_parts, s.created_at, s.user_id AS owner_user_id,
         r.avg_rating, COALESCE(r.review_count, 0) AS review_count,
         (SELECT COALESCE(json_agg(json_build_object('code', st.code, 'label', st.label) ORDER BY st.code), '[]'::json)
            FROM shop_services ss JOIN service_types st ON st.id = ss.service_type_id
           WHERE ss.shop_id = s.id) AS services
    FROM shops s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN (
      SELECT shop_id,
             round(avg((rating_quality + rating_price_transparency + rating_communication + rating_speed) / 4.0), 1)::float AS avg_rating,
             count(*) AS review_count
        FROM reviews GROUP BY shop_id
    ) r ON r.shop_id = s.id`;

export async function listServiceTypes() {
  const { rows } = await query('SELECT code, label, is_emergency FROM service_types ORDER BY label');
  return rows;
}

export async function findServiceTypesByCodes(codes, client) {
  const { rows } = await client.query(
    'SELECT id, code FROM service_types WHERE code = ANY($1::text[])',
    [codes],
  );
  return rows;
}

export async function insertShop(f, client) {
  const { rows } = await client.query(
    `INSERT INTO shops (user_id, business_name, description, state, city_area, address, opening_hours, certification_notes, sells_parts)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [f.userId, f.businessName, f.description ?? null, f.state, f.cityArea, f.address,
     f.openingHours ?? null, f.certificationNotes ?? null, f.sellsParts ?? false],
  );
  return rows[0];
}

export async function replaceShopServices(shopId, serviceTypeIds, client) {
  await client.query('DELETE FROM shop_services WHERE shop_id = $1', [shopId]);
  await client.query(
    `INSERT INTO shop_services (shop_id, service_type_id)
     SELECT $1::uuid, unnest($2::smallint[])`,
    [shopId, serviceTypeIds],
  );
}

export async function searchVerifiedShops({ state, cityArea, service, sort, limit, offset }) {
  const where = [`s.verification_status = 'verified'`];
  const params = [];
  if (state)    { params.push(state);                       where.push(`s.state = $${params.length}`); }
  if (cityArea) { params.push(`%${escapeLike(cityArea)}%`); where.push(`s.city_area ILIKE $${params.length}`); }
  if (service)  {
    params.push(service);
    where.push(`EXISTS (SELECT 1 FROM shop_services ss JOIN service_types st ON st.id = ss.service_type_id
                         WHERE ss.shop_id = s.id AND st.code = $${params.length})`);
  }
  const whereSql = where.join(' AND ');
  const { rows: c } = await query(`SELECT count(*) AS total FROM shops s WHERE ${whereSql}`, params);
  params.push(limit, offset);
  const { rows } = await query(
    `${SHOP_SELECT} WHERE ${whereSql}
     ORDER BY ${SORTS[sort] ?? SORTS.newest}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: c[0].total };
}

export async function findVerifiedShopById(id) {
  const { rows } = await query(`${SHOP_SELECT} WHERE s.id = $1 AND s.verification_status = 'verified'`, [id]);
  return rows[0] ?? null;
}

export async function findShopById(id, client) {
  const { rows } = await (client ?? { query }).query(`${SHOP_SELECT} WHERE s.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function findShopByUserId(userId, client) {
  const { rows } = await (client ?? { query }).query(`${SHOP_SELECT} WHERE s.user_id = $1`, [userId]);
  return rows[0] ?? null;
}

// A verified shop that changes its business name or certification text goes back to 'pending' (D-33).
const CRITICAL_CHANGE = `(
  verification_status = 'verified' AND (
    ($2::text IS NOT NULL AND $2::text <> business_name) OR
    ($7::text IS NOT NULL AND $7::text IS DISTINCT FROM certification_notes)
  ))`;

export async function updateShop(shopId, f, client) {
  const { rows } = await client.query(
    `UPDATE shops SET
        verification_status = CASE WHEN ${CRITICAL_CHANGE} THEN 'pending' ELSE verification_status END,
        verified_at         = CASE WHEN ${CRITICAL_CHANGE} THEN NULL      ELSE verified_at END,
        business_name       = COALESCE($2::text, business_name),
        description         = COALESCE($3::text, description),
        state               = COALESCE($4::text, state),
        city_area           = COALESCE($5::text, city_area),
        address             = COALESCE($6::text, address),
        certification_notes = COALESCE($7::text, certification_notes),
        opening_hours       = COALESCE($8::text, opening_hours),
        sells_parts         = COALESCE($9::boolean, sells_parts),
        updated_at          = now()
      WHERE id = $1
      RETURNING id`,
    [shopId, f.businessName ?? null, f.description ?? null, f.state ?? null, f.cityArea ?? null,
     f.address ?? null, f.certificationNotes ?? null, f.openingHours ?? null, f.sellsParts ?? null],
  );
  return rows[0] ?? null;
}

// ---- admin ----
export async function getAdminStats() {
  const { rows } = await query(`
    SELECT
      (SELECT COALESCE(json_object_agg(status, count), '{}'::json) FROM (
        SELECT verification_status AS status, count(*)::int AS count
        FROM shops GROUP BY verification_status
      ) shop_counts) AS shops,
      (SELECT COALESCE(json_object_agg(status, count), '{}'::json) FROM (
        SELECT verification_status AS status, count(*)::int AS count
        FROM parts_shops GROUP BY verification_status
      ) parts_shop_counts) AS parts_shops,
      (SELECT COALESCE(json_object_agg(role, count), '{}'::json) FROM (
        SELECT role, count(*)::int AS count
        FROM users GROUP BY role
      ) user_counts) AS users,
      (SELECT COALESCE(json_object_agg(status, count), '{}'::json) FROM (
        SELECT status, count(*)::int AS count
        FROM work_orders GROUP BY status
      ) job_counts) AS jobs_by_stage,
      (SELECT COALESCE(json_object_agg(status, count), '{}'::json) FROM (
        SELECT status, count(*)::int AS count
        FROM parts_orders GROUP BY status
      ) parts_order_counts) AS parts_orders,
      (SELECT COALESCE(json_agg(json_build_object(
        'id', s.id,
        'business_name', s.business_name,
        'state', s.state,
        'city_area', s.city_area,
        'created_at', s.created_at
      ) ORDER BY s.created_at ASC), '[]'::json)
       FROM parts_shops s
       WHERE s.verification_status = 'pending') AS pending_parts_shops,
      (SELECT COALESCE(json_agg(json_build_object(
        'id', s.id,
        'business_name', s.business_name,
        'state', s.state,
        'city_area', s.city_area,
        'created_at', s.created_at
      ) ORDER BY s.created_at ASC), '[]'::json)
       FROM shops s
       WHERE s.verification_status = 'pending') AS pending_shops
      ,
      (SELECT json_build_object(
        'paid_kobo', COALESCE((SELECT sum(amount_kobo) FROM payments WHERE status='paid'),0),
        'released_kobo', COALESCE((SELECT sum(amount_kobo) FROM payments WHERE status='released'),0),
        'pending_payout_kobo', COALESCE((SELECT sum(amount_kobo) FROM payouts WHERE status='pending'),0),
        'paid_payout_kobo', COALESCE((SELECT sum(amount_kobo) FROM payouts WHERE status='paid'),0)
      )) AS revenue
  `);
  return rows[0];
}

export async function listShopsForAdmin({ status, limit, offset }) {
  const { rows: c } = await query('SELECT count(*) AS total FROM shops WHERE verification_status = $1', [status]);
  const { rows } = await query(
    `${SHOP_SELECT.replace('s.sells_parts, s.created_at, s.user_id AS owner_user_id,',
      's.sells_parts, s.created_at, s.user_id AS owner_user_id, u.full_name AS owner_name, u.email,')}
      WHERE s.verification_status = $1
      ORDER BY s.created_at ASC LIMIT $2 OFFSET $3`,
    [status, limit, offset],
  );
  return { rows, total: c[0].total };
}

export async function transitionVerification({ shopId, from, to, adminId, note }) {
  const { rows } = await query(
    `UPDATE shops SET
        verification_status = $3::text,
        verification_note   = $4,
        verified_at         = CASE WHEN $3::text = 'verified' THEN now() ELSE NULL END,
        verified_by         = $5,
        updated_at          = now()
      WHERE id = $1 AND verification_status = ANY($2::text[])
      RETURNING id, verification_status, verification_note, verified_at`,
    [shopId, from, to, note ?? null, adminId],
  );
  return rows[0] ?? null;
}
