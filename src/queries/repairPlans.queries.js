export async function nextVersion(workOrderId, client) {
  const { rows } = await client.query(
    'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM repair_plans WHERE work_order_id = $1',
    [workOrderId],
  );
  return rows[0].version;
}

export async function insertRepairPlan(plan, client) {
  const { rows } = await client.query(
    `INSERT INTO repair_plans
       (work_order_id, version, technician_findings, parts_plan, labour_plan, notes, submitted_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [plan.workOrderId, plan.version, plan.technicianFindings, plan.partsPlan, plan.labourPlan,
      plan.notes ?? null, plan.submittedBy],
  );
  return rows[0];
}

export async function findForOwnerReview(id, ownerId, client) {
  const { rows } = await client.query(
    `SELECT rp.id, rp.work_order_id, rp.status, wo.status AS work_order_status,
            wo.owner_id, wo.shop_id, s.user_id AS shop_user_id
       FROM repair_plans rp
       JOIN work_orders wo ON wo.id = rp.work_order_id
       JOIN shops s ON s.id = wo.shop_id
      WHERE rp.id = $1 AND wo.owner_id = $2
        FOR UPDATE OF rp, wo`,
    [id, ownerId],
  );
  return rows[0] ?? null;
}

export async function setStatus(id, status, reviewerId, note, client) {
  const { rows } = await client.query(
    `UPDATE repair_plans SET status = $2::text, reviewed_by = $3, review_note = $4, reviewed_at = now()
      WHERE id = $1 AND status = 'pending'
      RETURNING id, work_order_id, status, review_note, reviewed_at`,
    [id, status, reviewerId, note ?? null],
  );
  return rows[0] ?? null;
}

export async function hasApprovedPlan(workOrderId, client) {
  const { rows } = await client.query(
    `SELECT 1 FROM repair_plans WHERE work_order_id = $1 AND status = 'approved' LIMIT 1`,
    [workOrderId],
  );
  return rows.length > 0;
}

export async function hasPendingPlan(workOrderId, client) {
  const { rows } = await client.query(
    `SELECT 1 FROM repair_plans WHERE work_order_id = $1 AND status = 'pending' LIMIT 1`,
    [workOrderId],
  );
  return rows.length > 0;
}
