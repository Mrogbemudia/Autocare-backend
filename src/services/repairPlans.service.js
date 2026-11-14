import { withTransaction } from '../db.js';
import { conflict, notFound } from '../utils/httpError.js';
import * as mediaQueries from '../queries/repairMedia.queries.js';
import * as repairPlans from '../queries/repairPlans.queries.js';
import * as workOrders from '../queries/workOrders.queries.js';
import { deleteRepairMedia, mediaDeliveryUrl, uploadRepairMedia } from './cloudinary.service.js';

const SUBMITTABLE_STATUSES = new Set(['inspection', 'approval_pending']);
const withMediaUrls = (plan) => plan && ({
  ...plan,
  media: (plan.media ?? []).map((media) => ({ ...media, url: mediaDeliveryUrl(media) })),
});

async function removeUploadedMedia(media) {
  for (const asset of media) {
    try {
      await deleteRepairMedia(asset);
    } catch (error) {
      console.error('Cloudinary cleanup failed:', error.message);
    }
  }
}

export async function submit(user, workOrderId, body, files = []) {
  const job = await workOrders.findWorkOrderForShopUser(workOrderId, user.id);
  if (!job) throw notFound('Job not found');
  if (!SUBMITTABLE_STATUSES.has(job.status)) {
    throw conflict('REPAIR_PLAN_LOCKED', 'A repair plan can only be submitted during inspection.');
  }

  const uploaded = [];
  try {
    for (const file of files) {
      uploaded.push(await uploadRepairMedia(file, { userId: user.id, folder: `work-orders/${workOrderId}` }));
    }

    await withTransaction(async (client) => {
      const lockedJob = await workOrders.lockWorkOrderForShopUser(workOrderId, user.id, client);
      if (!lockedJob) throw notFound('Job not found');
      if (!SUBMITTABLE_STATUSES.has(lockedJob.status)) {
        throw conflict('REPAIR_PLAN_LOCKED', 'A repair plan can only be submitted during inspection.');
      }
      if (await workOrders.hasPendingExtra(workOrderId, client)) {
        throw conflict('EXTRA_WORK_PENDING', 'Resolve pending extra work before submitting the repair plan.');
      }
      if (await repairPlans.hasPendingPlan(workOrderId, client)) {
        throw conflict('REPAIR_PLAN_PENDING', 'A repair plan is already waiting for owner approval.');
      }

      const version = await repairPlans.nextVersion(workOrderId, client);
      const plan = await repairPlans.insertRepairPlan({
        workOrderId,
        version,
        ...body,
        submittedBy: user.id,
      }, client);
      for (const media of uploaded) await mediaQueries.insertForPlan(media, plan.id, client);
    });

    const updatedJob = await workOrders.findWorkOrderById(workOrderId);
    return withMediaUrls(updatedJob.repair_plan);
  } catch (error) {
    await removeUploadedMedia(uploaded);
    throw error;
  }
}

export async function review(user, planId, decision, { note }) {
  return withTransaction(async (client) => {
    const plan = await repairPlans.findForOwnerReview(planId, user.id, client);
    if (!plan) throw notFound('Repair plan not found');
    if (plan.status !== 'pending') throw conflict('REPAIR_PLAN_DECIDED', 'This repair plan has already been reviewed.');
    if (!SUBMITTABLE_STATUSES.has(plan.work_order_status)) {
      throw conflict('REPAIR_PLAN_LOCKED', 'This repair plan can no longer be reviewed.');
    }

    if (decision === 'approved' && await workOrders.hasPendingExtra(plan.work_order_id, client)) {
      throw conflict('EXTRA_WORK_PENDING', 'Resolve pending extra work before approving the repair plan.');
    }
    const updated = await repairPlans.setStatus(planId, decision, user.id, note, client);
    if (!updated) throw conflict('REPAIR_PLAN_DECIDED', 'This repair plan has already been reviewed.');

    if (decision === 'approved') {
      await workOrders.setWorkOrderStatus(plan.work_order_id, 'in_repair', client);
      await workOrders.insertStatusHistory({
        workOrderId: plan.work_order_id,
        fromStatus: plan.work_order_status,
        toStatus: 'in_repair',
        changedBy: user.id,
        note: 'Owner approved the repair plan.',
      }, client);
    } else {
      await workOrders.insertStatusHistory({
        workOrderId: plan.work_order_id,
        fromStatus: plan.work_order_status,
        toStatus: plan.work_order_status,
        changedBy: user.id,
        note: note || 'Owner requested a repair plan revision.',
      }, client);
    }
    return updated;
  });
}
