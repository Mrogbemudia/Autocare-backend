import { query } from '../db.js';

const WORK_ORDER_SELECT = `
  SELECT wo.id, wo.status, wo.booking_id, wo.service_request_id, wo.quote_id, wo.owner_id, wo.shop_id,
         wo.vehicle_id, wo.quoted_total_kobo, wo.completed_at, wo.created_at, wo.updated_at,
         COALESCE((SELECT SUM(e.extra_cost_kobo) FROM extra_work_requests e
                    WHERE e.work_order_id = wo.id AND e.status = 'approved'), 0)::bigint AS approved_extras_kobo,
         s.business_name AS shop_name, s.user_id AS shop_user_id,
         v.vehicle_type, v.make, v.model, v.year, v.plate_number,
         ou.full_name AS owner_name
    FROM work_orders wo
    JOIN shops    s  ON s.id  = wo.shop_id
    JOIN vehicles v  ON v.id  = wo.vehicle_id
    JOIN users    ou ON ou.id = wo.owner_id`;

export async function insertWorkOrder(f, client) {
  const { rows } = await client.query(
    `INSERT INTO work_orders (booking_id, service_request_id, quote_id, owner_id, shop_id, vehicle_id, quoted_total_kobo)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [f.bookingId, f.serviceRequestId, f.quoteId, f.ownerId, f.shopId, f.vehicleId, f.quotedTotalKobo],
  );
  return rows[0];
}

export async function findWorkOrderById(id, client) {
  const { rows } = await (client ?? { query }).query(`${WORK_ORDER_SELECT} WHERE wo.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listWorkOrders({ ownerId, shopUserId, status, limit, offset }) {
  const where = [];
  const params = [];
  if (ownerId)    { params.push(ownerId);    where.push(`wo.owner_id = $${params.length}`); }
  if (shopUserId) { params.push(shopUserId); where.push(`s.user_id = $${params.length}`); }
  if (status)     { params.push(status);     where.push(`wo.status = $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows: c } = await query(
    `SELECT count(*) AS total FROM work_orders wo JOIN shops s ON s.id = wo.shop_id ${whereSql}`, params);
  params.push(limit, offset);
  const { rows } = await query(
    `${WORK_ORDER_SELECT} ${whereSql} ORDER BY wo.updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: c[0].total };
}

// Locks the job row, and only returns it if it belongs to this shop account (ownership check).
export async function lockWorkOrderForShopUser(id, shopUserId, client) {
  const { rows } = await client.query(
    `SELECT wo.id, wo.status, wo.service_request_id
       FROM work_orders wo JOIN shops s ON s.id = wo.shop_id
      WHERE wo.id = $1 AND s.user_id = $2
        FOR UPDATE OF wo`,
    [id, shopUserId],
  );
  return rows[0] ?? null;
}

export async function setWorkOrderStatus(id, status, client) {
  await client.query(
    `UPDATE work_orders SET status = $2::text,
            completed_at = CASE WHEN $2::text = 'completed' THEN now() ELSE completed_at END,
            updated_at = now()
      WHERE id = $1`,
    [id, status],
  );
}

export async function insertStatusHistory({ workOrderId, fromStatus, toStatus, changedBy, note }, client) {
  await client.query(
    `INSERT INTO work_order_status_history (work_order_id, from_status, to_status, changed_by, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [workOrderId, fromStatus ?? null, toStatus, changedBy, note ?? null],
  );
}

export async function listStatusHistory(workOrderId) {
  const { rows } = await query(
    `SELECT h.id, h.from_status, h.to_status, h.note, h.created_at, u.full_name AS changed_by_name, u.role AS changed_by_role
       FROM work_order_status_history h JOIN users u ON u.id = h.changed_by
      WHERE h.work_order_id = $1 ORDER BY h.created_at ASC, h.id`,
    [workOrderId],
  );
  return rows;
}

// ---- extra work (Approval Lock) ----
export async function hasPendingExtra(workOrderId, client) {
  const { rows } = await client.query(
    `SELECT 1 FROM extra_work_requests WHERE work_order_id = $1 AND status = 'pending' LIMIT 1`, [workOrderId]);
  return rows.length > 0;
}

export async function insertExtraWork(f, client) {
  const { rows } = await client.query(
    `INSERT INTO extra_work_requests (work_order_id, description, reason, extra_cost_kobo)
     VALUES ($1, $2, $3, $4)
     RETURNING id, work_order_id, description, reason, extra_cost_kobo, status, created_at`,
    [f.workOrderId, f.description, f.reason, f.extraCostKobo],
  );
  return rows[0];
}

export async function lockExtraForOwner(extraId, ownerId, client) {
  const { rows } = await client.query(
    `SELECT e.id, e.work_order_id, e.status, wo.status AS work_order_status
       FROM extra_work_requests e JOIN work_orders wo ON wo.id = e.work_order_id
      WHERE e.id = $1 AND wo.owner_id = $2
        FOR UPDATE OF e, wo`,
    [extraId, ownerId],
  );
  return rows[0] ?? null;
}

export async function resolveExtra(id, status, note, client) {
  const { rows } = await client.query(
    `UPDATE extra_work_requests SET status = $2::text, response_note = $3, responded_at = now()
      WHERE id = $1 AND status = 'pending'
      RETURNING id, work_order_id, description, reason, extra_cost_kobo, status, response_note, responded_at, created_at`,
    [id, status, note ?? null],
  );
  return rows[0] ?? null;
}

export async function declinePendingExtras(workOrderId, note, client) {
  await client.query(
    `UPDATE extra_work_requests SET status = 'declined', response_note = $2, responded_at = now()
      WHERE work_order_id = $1 AND status = 'pending'`,
    [workOrderId, note],
  );
}

export async function listExtraWork(workOrderId) {
  const { rows } = await query(
    `SELECT id, description, reason, extra_cost_kobo, status, response_note, responded_at, created_at
       FROM extra_work_requests WHERE work_order_id = $1 ORDER BY created_at ASC`,
    [workOrderId],
  );
  return rows;
}
