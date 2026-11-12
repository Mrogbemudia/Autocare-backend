import { withTransaction } from '../db.js';
import { badRequest, conflict, notFound } from '../utils/httpError.js';
import { offsetOf, pageMeta } from '../utils/respond.js';
import * as wo from '../queries/workOrders.queries.js';
import * as requests from '../queries/serviceRequests.queries.js';

// The status pipeline. 'approval_pending' is NOT a manual target: only an extra-work request puts a job there.
const TRANSITIONS = {
  inspection:       ['in_repair', 'cancelled'],
  approval_pending: ['in_repair', 'cancelled'],
  in_repair:        ['testing'],
  testing:          ['ready_for_pickup'],
  ready_for_pickup: ['completed'],
  completed:        [],
  cancelled:        [],
};
const EXTRA_ALLOWED_FROM = ['inspection', 'in_repair'];

// final cost = locked quote + approved extras only. Calculated here, never trusted from the client.
const withTotals = ({ shop_user_id, ...w }) => ({
  ...w,
  final_cost_kobo: w.quoted_total_kobo + w.approved_extras_kobo,
});

async function loadForUser(user, id) {
  const w = await wo.findWorkOrderById(id);
  const allowed = w && (user.role === 'admin' || w.owner_id === user.id || w.shop_user_id === user.id);
  if (!allowed) throw notFound('Job not found');
  return w;
}

export async function list(user, q) {
  const scope = user.role === 'owner' ? { ownerId: user.id } : user.role === 'shop' ? { shopUserId: user.id } : {};
  const { rows, total } = await wo.listWorkOrders({ ...scope, status: q.status, limit: q.pageSize, offset: offsetOf(q.page, q.pageSize) });
  return { data: rows.map(withTotals), meta: pageMeta(q.page, q.pageSize, total) };
}

export async function getDetail(user, id) {
  const w = await loadForUser(user, id);
  const [history, extraWork] = await Promise.all([wo.listStatusHistory(id), wo.listExtraWork(id)]);
  return { ...withTotals(w), history, extra_work: extraWork };
}

export async function changeStatus(user, id, { status, note }) {
  return withTransaction(async (client) => {
    const job = await wo.lockWorkOrderForShopUser(id, user.id, client);
    if (!job) throw notFound('Job not found');
    if (!TRANSITIONS[job.status].includes(status)) {
      throw badRequest(`A job in "${job.status}" cannot move to "${status}"`, 'INVALID_TRANSITION');
    }
    // Approval Lock, enforced on the server (and again by a database trigger).
    if (await wo.hasPendingExtra(id, client)) {
      if (status === 'cancelled') {
        await wo.declinePendingExtras(id, 'Job cancelled by the shop', client);
      } else {
        throw conflict('EXTRA_WORK_PENDING', 'The owner has not yet approved or declined the extra work');
      }
    }
    await wo.setWorkOrderStatus(id, status, client);
    await wo.insertStatusHistory({ workOrderId: id, fromStatus: job.status, toStatus: status, changedBy: user.id, note }, client);
    if (status === 'completed') await requests.setRequestStatus(job.service_request_id, 'completed', client);
    if (status === 'cancelled') await requests.setRequestStatus(job.service_request_id, 'cancelled', client);
    return { id, status };
  });
}

export async function raiseExtraWork(user, id, body) {
  return withTransaction(async (client) => {
    const job = await wo.lockWorkOrderForShopUser(id, user.id, client);
    if (!job) throw notFound('Job not found');
    if (!EXTRA_ALLOWED_FROM.includes(job.status)) {
      throw conflict('EXTRA_WORK_NOT_ALLOWED', `Extra work cannot be requested while the job is "${job.status}"`);
    }
    const extra = await wo.insertExtraWork({ workOrderId: id, ...body }, client);
    await wo.setWorkOrderStatus(id, 'approval_pending', client);
    await wo.insertStatusHistory({ workOrderId: id, fromStatus: job.status, toStatus: 'approval_pending',
      changedBy: user.id, note: `Extra work requested: ${body.description.slice(0, 120)}` }, client);
    return extra;
  });
}

export async function decideExtraWork(user, extraId, decision, { note }) {
  return withTransaction(async (client) => {
    const e = await wo.lockExtraForOwner(extraId, user.id, client);
    if (!e) throw notFound('Extra-work request not found');
    if (e.status !== 'pending') throw conflict('ALREADY_DECIDED', 'This extra-work request has already been answered');
    const resolved = await wo.resolveExtra(extraId, decision, note, client);
    await wo.insertStatusHistory({ workOrderId: e.work_order_id, fromStatus: e.work_order_status,
      toStatus: e.work_order_status, changedBy: user.id,
      note: `Owner ${decision} extra work (${resolved.extra_cost_kobo} kobo)` }, client);
    return resolved; // the shop moves the job back to In Repair when ready
  });
}
