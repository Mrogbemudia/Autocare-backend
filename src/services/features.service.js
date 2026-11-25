import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { withTransaction, query } from '../db.js';
import { badRequest, conflict, forbidden, HttpError, notFound } from '../utils/httpError.js';
import * as q from '../queries/features.queries.js';
import { uploadDocument } from './cloudinary.service.js';

export async function submitDocuments(user, ownerType, docType, label, referenceNumber, files) {
  let ownerId;
  if (ownerType === 'shop') {
    const { rows } = await query('SELECT id FROM shops WHERE user_id=$1', [user.id]);
    if (!rows[0]) throw notFound('Shop profile not found');
    ownerId = rows[0].id;
  } else {
    const { rows } = await query('SELECT id FROM parts_shops WHERE user_id=$1', [user.id]);
    if (!rows[0]) throw notFound('Parts shop profile not found');
    ownerId = rows[0].id;
  }
  if (!['nin','cac','apprenticeship_letter','certificate','other'].includes(docType)) throw badRequest('Unknown document type');
  return withTransaction(async (client) => {
    const uploaded = [];
    for (const file of files) {
      const media = await uploadDocument(file, { userId: user.id, folder: 'verification-documents' });
      uploaded.push(await q.insertVerificationDocument(ownerType, ownerId, {
        docType, label, referenceNumber, file: media,
      }, client));
    }
    return uploaded;
  });
}

export async function getPartsShopDashboard(user) {
  const shop = await q.getPartsShopByUser(user.id);
  if (!shop) throw notFound('Parts shop profile not found');
  const [orders, revenue, parts] = await Promise.all([
    query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status NOT IN ('completed','cancelled'))::int AS open
      FROM parts_orders WHERE parts_shop_id=$1`, [shop.id]),
    query(`SELECT coalesce(sum(total_kobo) FILTER (WHERE status IN ('paid','preparing','ready_for_pickup','out_for_delivery','completed')),0)::bigint AS total
      FROM parts_orders WHERE parts_shop_id=$1`, [shop.id]),
    q.listShopParts(shop.id),
  ]);
  return { shop, orders: orders.rows[0], revenueKobo: revenue.rows[0].total, parts };
}

export async function updatePartsShop(user, body) {
  const shop = await q.getPartsShopByUser(user.id);
  if (!shop) throw notFound('Parts shop profile not found');
  return q.updatePartsShop(shop.id, body);
}

export async function savePart(user, partId, body, file) {
  const shop = await q.getPartsShopByUser(user.id);
  if (!shop) throw notFound('Parts shop profile not found');
  let image;
  if (file) image = await uploadDocument(file, { userId: user.id, folder: 'parts' });
  const saved = await q.upsertPart(shop.id, partId, { ...body, image }, undefined);
  if (!saved) throw notFound('Part not found');
  return saved;
}

export async function browseParts(qb) {
  const { rows, total } = await q.listParts({
    ...qb, limit: qb.pageSize, offset: (qb.page - 1) * qb.pageSize,
  });
  return { data: rows, meta: { page: qb.page, pageSize: qb.pageSize, total, totalPages: Math.ceil(total / qb.pageSize) } };
}

export async function checkoutParts(user, body) {
  if (!Array.isArray(body.items) || body.items.length === 0) throw badRequest('Add at least one item');
  return withTransaction(async (client) => {
    const shopIds = new Set();
    const resolved = [];
    let subtotal = 0;
    for (const item of body.items) {
      const part = await q.getPartById(item.partId, client);
      if (!part || !part.is_active || part.stock_qty < item.qty) throw conflict('PART_UNAVAILABLE', 'One or more parts are unavailable');
      shopIds.add(part.parts_shop_id);
      subtotal += Number(part.price_kobo) * item.qty;
      resolved.push({ partId: part.id, name: part.name, qty: item.qty, unitPrice: Number(part.price_kobo) });
    }
    if (shopIds.size !== 1) throw badRequest('Checkout items must come from one parts shop');
    const shopId = [...shopIds][0];
    const shop = (await client.query('SELECT * FROM parts_shops WHERE id=$1', [shopId])).rows[0];
    if (!shop || shop.verification_status !== 'verified') throw conflict('SHOP_NOT_VERIFIED', 'This parts shop is not available');
    if (body.fulfilmentType === 'delivery' && !shop.offers_delivery) throw badRequest('Delivery is not offered');
    if (body.fulfilmentType === 'pickup' && !shop.offers_pickup) throw badRequest('Pickup is not offered');
    const deliveryFee = body.fulfilmentType === 'delivery' ? Number(shop.delivery_fee_kobo) : 0;
    if (body.fulfilmentType === 'delivery' && (!body.address || body.address.length < 5)) throw badRequest('Delivery address is required');
    const order = await q.createPartsOrder({
      buyerId: user.id, partsShopId: shopId, fulfilmentType: body.fulfilmentType,
      subtotal, deliveryFee, vehicleId: body.vehicleId ?? null, workOrderId: body.workOrderId ?? null,
      items: resolved, address: body.address, latitude: body.latitude ?? null, longitude: body.longitude ?? null,
    }, client);
    for (const item of resolved) {
      await client.query('UPDATE parts SET stock_qty=stock_qty-$2 WHERE id=$1', [item.partId, item.qty]);
    }
    return { order, totalKobo: subtotal + deliveryFee };
  });
}

export async function listBuyerOrders(user) {
  return q.listPartsOrders({ buyerId: user.id });
}

export async function listVendorOrders(user) {
  const shop = await q.getPartsShopByUser(user.id);
  if (!shop) throw notFound('Parts shop profile not found');
  return q.listPartsOrders({ partsShopId: shop.id });
}

export async function getOrder(user, orderId) {
  const order = await q.getPartsOrder(orderId, user.id);
  if (!order) throw notFound('Order not found');
  return order;
}

export async function updateOrderStatus(user, orderId, status, note, latitude, longitude) {
  const allowed = new Set(['paid','preparing','ready_for_pickup','out_for_delivery','completed','cancelled']);
  if (!allowed.has(status)) throw badRequest('Invalid order status');
  const result = await withTransaction((client) =>
    q.updatePartsOrderStatus(orderId, user.id, status, note, latitude, longitude, client));
  if (!result) throw forbidden('Only the parts shop can update this order');
  return result;
}

export async function initializePartsPayment(user, orderId) {
  if (!env.paystack) throw new HttpError(503, 'PAYSTACK_NOT_CONFIGURED', 'Paystack is not configured.');
  const order = await q.getPartsOrder(orderId, user.id);
  if (!order) throw notFound('Order not found');
  if (order.status !== 'awaiting_payment') throw conflict('ORDER_NOT_AWAITING_PAYMENT', 'This order has already been submitted');
  const reference = `KAZA-${order.id}-${crypto.randomUUID().slice(0,8)}`;
  const { rows } = await withTransaction(async (client) => client.query(
    `INSERT INTO payments (owner_id,parts_order_id,provider,provider_reference,amount_kobo,status,payment_method)
     VALUES ($1,$2,'paystack',$3,$4,'pending','paystack') RETURNING *`,
    [user.id,order.id,reference,order.total_kobo]));
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.paystack.secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user.email,
      amount: Number(order.total_kobo),
      reference,
      callback_url: `${env.frontendUrl ?? ''}/parts/orders/${order.id}`,
    }),
  });
  const payload = await res.json();
  if (!res.ok || !payload.status) throw badRequest(payload.message ?? 'Paystack initialization failed');
  return { authorizationUrl: payload.data.authorization_url, accessCode: payload.data.access_code, reference };
}

export async function verifyPartsPayment(user, reference) {
  if (!env.paystack) throw new HttpError(503, 'PAYSTACK_NOT_CONFIGURED', 'Paystack is not configured.');
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${env.paystack.secretKey}` },
  });
  const payload = await res.json();
  if (!res.ok || payload.data?.status !== 'success') throw conflict('PAYMENT_NOT_PAID', 'Payment is not confirmed');
  return withTransaction(async (client) => {
    const payment = (await client.query(
      'UPDATE payments SET status=$2,paid_at=now(),updated_at=now() WHERE provider_reference=$1 AND owner_id=$3 RETURNING *',
      [reference,'paid',user.id])).rows[0];
    if (!payment) throw notFound('Payment not found');
    await client.query(
      `UPDATE parts_orders SET status='paid',payment_id=$2,updated_at=now() WHERE id=$1
       RETURNING id,status,payment_id,total_kobo`,
      [payment.parts_order_id,payment.id]);
    await client.query(
      "INSERT INTO parts_order_events (order_id,status,note,actor_id) VALUES ($1,'paid','Paystack payment confirmed',$2)",
      [payment.parts_order_id,user.id]);
    return { reference, status: 'paid', orderId: payment.parts_order_id };
  });
}

export async function createBankTransferPayment(user, orderId) {
  const order = await q.getPartsOrder(orderId, user.id);
  if (!order) throw notFound('Order not found');
  if (order.status !== 'awaiting_payment') throw conflict('ORDER_NOT_AWAITING_PAYMENT', 'This order has already been submitted');
  const reference = `KAZA-BANK-${crypto.randomUUID().slice(0,12).toUpperCase()}`;
  await withTransaction(async (client) => client.query(
    `INSERT INTO payments (owner_id,parts_order_id,provider,provider_reference,amount_kobo,status,payment_method,bank_transfer_reference)
     VALUES ($1,$2,'bank_transfer',$3,$4,'pending','bank_transfer',$3)`,
    [user.id,order.id,reference,order.total_kobo]));
  return { reference, status: 'pending', instructions: 'Transfer the exact total to the account details supplied by Kaza support, then keep this reference for confirmation.' };
}

export async function maintenanceDashboard(user) {
  const [templates, vehicles, settings] = await Promise.all([
    query('SELECT * FROM maintenance_templates ORDER BY label'),
    query('SELECT id,make,model,year,mileage_km FROM vehicles WHERE owner_id=$1 ORDER BY make,model', [user.id]),
    query('SELECT * FROM reminder_settings WHERE user_id=$1', [user.id]),
  ]);
  const rules = await query(
    `SELECT r.*, t.code,t.label,t.default_interval_km,t.default_interval_months
       FROM vehicle_maintenance_rules r JOIN maintenance_templates t ON t.id=r.template_id
       JOIN vehicles v ON v.id=r.vehicle_id WHERE v.owner_id=$1`, [user.id]);
  const upcoming = await query(
    `SELECT v.id AS vehicle_id,v.make,v.model,v.year,v.mileage_km,
            t.id AS template_id,t.label,r.interval_km,r.interval_months,
            (SELECT max(service_date) FROM vehicle_service_log l WHERE l.vehicle_id=v.id AND l.template_id=t.id) AS last_service_date,
            (SELECT max(mileage_km) FROM vehicle_service_log l WHERE l.vehicle_id=v.id AND l.template_id=t.id) AS last_service_mileage
       FROM vehicles v
       JOIN vehicle_maintenance_rules r ON r.vehicle_id=v.id
       JOIN maintenance_templates t ON t.id=r.template_id
      WHERE v.owner_id=$1`, [user.id]);
  return {
    templates: templates.rows,
    vehicles: vehicles.rows,
    rules: rules.rows,
    upcoming: upcoming.rows,
    settings: settings.rows[0] ?? {
      maintenanceLeadDays: 14, maintenanceLeadKm: 500, documentLeadDays: 30, inAppEnabled: true,
    },
  };
}

export async function setMaintenanceRule(user, body) {
  if (!body.vehicleId || !body.templateId) throw badRequest('Vehicle and maintenance type are required');
  const owned = await query('SELECT id FROM vehicles WHERE id=$1 AND owner_id=$2', [body.vehicleId,user.id]);
  if (!owned.rows[0]) throw forbidden('Vehicle not found');
  const { rows } = await query(
    `INSERT INTO vehicle_maintenance_rules (vehicle_id,template_id,interval_km,interval_months)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (vehicle_id,template_id) DO UPDATE SET interval_km=EXCLUDED.interval_km,
       interval_months=EXCLUDED.interval_months,updated_at=now()
     RETURNING *`,
    [body.vehicleId,body.templateId,body.intervalKm ?? null,body.intervalMonths ?? null]);
  return rows[0];
}

export async function setReminderSettings(user, body) {
  const { rows } = await query(
    `INSERT INTO reminder_settings (user_id,maintenance_lead_days,maintenance_lead_km,document_lead_days,in_app_enabled)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id) DO UPDATE SET maintenance_lead_days=EXCLUDED.maintenance_lead_days,
       maintenance_lead_km=EXCLUDED.maintenance_lead_km,document_lead_days=EXCLUDED.document_lead_days,
       in_app_enabled=EXCLUDED.in_app_enabled,updated_at=now()
     RETURNING *`,
    [user.id,body.maintenanceLeadDays ?? 14,body.maintenanceLeadKm ?? 500,body.documentLeadDays ?? 30,body.inAppEnabled ?? true]);
  return rows[0];
}

export async function insuranceProducts() {
  const { rows } = await query(
    `SELECT ip.id,ip.type,ip.name,ip.summary,i.id AS insurer_id,i.name AS insurer_name,i.description,i.website_url
       FROM insurance_products ip JOIN insurers i ON i.id=ip.insurer_id
      WHERE ip.is_active AND i.is_active ORDER BY i.name,ip.name`);
  return rows;
}

export async function applyInsurance(user, body) {
  if (!body.vehicleId || !body.productId) throw badRequest('Vehicle and insurance product are required');
  const owned = await query('SELECT id FROM vehicles WHERE id=$1 AND owner_id=$2', [body.vehicleId,user.id]);
  if (!owned.rows[0]) throw forbidden('Vehicle not found');
  const { rows } = await query(
    `INSERT INTO insurance_requests (owner_id,vehicle_id,product_id,owner_note)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [user.id,body.vehicleId,body.productId,body.ownerNote ?? null]);
  return rows[0];
}

export async function myInsuranceRequests(user) {
  const { rows } = await query(
    `SELECT ir.*,ip.name AS product_name,ip.type AS product_type,i.name AS insurer_name,
      v.make,v.model,v.year
     FROM insurance_requests ir
     JOIN insurance_products ip ON ip.id=ir.product_id
     JOIN insurers i ON i.id=ip.insurer_id
     JOIN vehicles v ON v.id=ir.vehicle_id
     WHERE ir.owner_id=$1 ORDER BY ir.created_at DESC`, [user.id]);
  return rows;
}

export async function technicianDashboard(user) {
  const shop = (await query('SELECT * FROM shops WHERE user_id=$1',[user.id])).rows[0];
  if (!shop) throw notFound('Technician profile not found');
  const [jobs,revenue,completed] = await Promise.all([
    query(`SELECT count(*)::int AS total,count(*) FILTER (WHERE status NOT IN ('completed','cancelled'))::int AS in_progress
      FROM work_orders WHERE shop_id=$1`,[shop.id]),
    query(`SELECT coalesce(sum(final_cost_kobo),0)::bigint AS total FROM (
      SELECT wo.quoted_total_kobo+coalesce(sum(e.extra_cost_kobo) FILTER (WHERE e.status='approved'),0) AS final_cost_kobo
      FROM work_orders wo LEFT JOIN extra_work_requests e ON e.work_order_id=wo.id
      WHERE wo.shop_id=$1 GROUP BY wo.id,wo.quoted_total_kobo) x`,[shop.id]),
    query(`SELECT count(*)::int AS total,max(completed_at) AS latest_completed
      FROM work_orders WHERE shop_id=$1 AND status='completed'`,[shop.id]),
  ]);
  return {
    shop,
    jobs: jobs.rows[0],
    revenueKobo: revenue.rows[0].total,
    completed: completed.rows[0],
  };
}

export async function requestInterview(user, body) {
  const shop = (await query('SELECT id,verification_status FROM shops WHERE user_id=$1',[user.id])).rows[0];
  if (!shop) throw notFound('Technician profile not found');
  if (shop.verification_status !== 'verified') throw forbidden('Admin verification is required before interviews');
  const { rows } = await query(
    `INSERT INTO interview_requests (shop_id,kind,language,claimed_years)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [shop.id,body.kind,body.language ?? 'en',body.claimedYears ?? null]);
  return rows[0];
}

export async function listInterviewRequests(user) {
  const shop = (await query('SELECT id FROM shops WHERE user_id=$1',[user.id])).rows[0];
  if (!shop) throw notFound('Technician profile not found');
  const { rows } = await query('SELECT * FROM interview_requests WHERE shop_id=$1 ORDER BY created_at DESC',[shop.id]);
  return rows;
}

export async function createCall(user, body) {
  if (!body.recipientId) throw badRequest('Recipient is required');
  if (body.recipientId === user.id) throw badRequest('You cannot call yourself');
  const contexts = [
    body.serviceRequestId ? 'serviceRequestId' : null,
    body.interviewRequestId ? 'interviewRequestId' : null,
    body.workOrderId ? 'workOrderId' : null,
    body.partsOrderId ? 'partsOrderId' : null,
  ].filter(Boolean);
  if (contexts.length !== 1) throw badRequest('Exactly one call context is required');
  const { rows } = await withTransaction(async (client) => client.query(
    `INSERT INTO call_sessions (initiated_by,recipient_id,service_request_id,interview_request_id,work_order_id,parts_order_id,status)
     VALUES ($1,$2,$3,$4,$5,$6,'requested') RETURNING *`,
    [user.id,body.recipientId,body.serviceRequestId ?? null,body.interviewRequestId ?? null,
     body.workOrderId ?? null,body.partsOrderId ?? null]));
  return rows[0];
}

export async function incomingCalls(user) {
  const { rows } = await query(
    `SELECT c.*,u.full_name AS caller_name
       FROM call_sessions c JOIN users u ON u.id=c.initiated_by
      WHERE c.recipient_id=$1 AND c.status IN ('requested','ringing')
      ORDER BY c.created_at DESC`, [user.id]);
  return rows;
}

export async function updateCall(user, callId, status) {
  const allowed = new Set(['ringing','connected','completed','missed','declined','failed']);
  if (!allowed.has(status)) throw badRequest('Invalid call status');
  const { rows } = await query(
    `UPDATE call_sessions SET status=$3,
      started_at=CASE WHEN $3='connected' AND started_at IS NULL THEN now() ELSE started_at END,
      ended_at=CASE WHEN $3 IN ('completed','missed','declined','failed') THEN now() ELSE ended_at END
     WHERE id=$1 AND (initiated_by=$2 OR recipient_id=$2)
     RETURNING *`, [callId,user.id,status]);
  if (!rows[0]) throw notFound('Call not found');
  return rows[0];
}

export async function addCallSignal(user, callId, kind, payload) {
  const allowed = new Set(['offer','answer','ice','hangup']);
  if (!allowed.has(kind)) throw badRequest('Invalid signal');
  const participant = await query('SELECT id FROM call_sessions WHERE id=$1 AND (initiated_by=$2 OR recipient_id=$2)',[callId,user.id]);
  if (!participant.rows[0]) throw notFound('Call not found');
  const { rows } = await query(
    'INSERT INTO call_signals (call_session_id,sender_id,kind,payload) VALUES ($1,$2,$3,$4) RETURNING *',
    [callId,user.id,kind,payload]);
  return rows[0];
}

export async function callSignals(user, callId, afterId) {
  const participant = await query('SELECT id FROM call_sessions WHERE id=$1 AND (initiated_by=$2 OR recipient_id=$2)',[callId,user.id]);
  if (!participant.rows[0]) throw notFound('Call not found');
  const { rows } = await query(
    `SELECT * FROM call_signals WHERE call_session_id=$1 AND sender_id<>$2
     AND ($3::uuid IS NULL OR id>$3) ORDER BY created_at ASC`,
    [callId,user.id,afterId ?? null]);
  return rows;
}
