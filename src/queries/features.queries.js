import { pool } from '../db.js';
const run = (client, text, params) => (client ?? pool).query(text, params);

export async function createPartsShop({ userId, businessName, state, cityArea, address, description, openingHours, offersPickup, offersDelivery, deliveryFeeKobo }, client) {
  const { rows } = await run(client,
    `INSERT INTO parts_shops (user_id,business_name,state,city_area,address,description,opening_hours,offers_pickup,offers_delivery,delivery_fee_kobo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [userId,businessName,state,cityArea,address,description ?? null,openingHours ?? null,offersPickup ?? true,offersDelivery ?? false,deliveryFeeKobo ?? 0]);
  return rows[0];
}

export async function getPartsShopByUser(userId, client) {
  const { rows } = await run(client, 'SELECT * FROM parts_shops WHERE user_id=$1', [userId]);
  return rows[0] ?? null;
}

export async function getPartsShopById(id) {
  const { rows } = await pool.query(
    'SELECT id,verification_status FROM parts_shops WHERE id=$1',[id]);
  return rows[0] ?? null;
}

export async function listPartsShopsForAdmin({ status, limit, offset }) {
  const { rows } = await pool.query(
    `SELECT ps.id, ps.business_name, ps.state, ps.city_area, ps.address, ps.description,
            ps.verification_status, ps.verification_note, ps.created_at,
            u.full_name AS owner_name, u.email,
            (SELECT coalesce(json_agg(json_build_object(
              'id',d.id,'doc_type',d.doc_type,'label',d.label,'reference_number',d.reference_number,
              'public_id',d.public_id,'resource_type',d.resource_type,'format',d.format,'version',d.version,
              'status',d.status,'review_note',d.review_note,'created_at',d.created_at)
              ORDER BY d.created_at DESC),'[]'::json)
               FROM verification_documents d WHERE d.owner_type='parts_shop' AND d.owner_id=ps.id) AS documents
       FROM parts_shops ps JOIN users u ON u.id=ps.user_id
      WHERE ps.verification_status=$1
      ORDER BY ps.created_at ASC LIMIT $2 OFFSET $3`,
    [status,limit,offset]);
  return rows;
}

export async function transitionPartsShopVerification({ shopId, from, to, adminId, note }) {
  const { rows } = await pool.query(
    `UPDATE parts_shops SET verification_status=$3, verification_note=$4,
       verified_at=CASE WHEN $3='verified' THEN now() ELSE NULL END,
       verified_by=$5, updated_at=now()
     WHERE id=$1 AND verification_status=ANY($2::text[])
     RETURNING id, verification_status, verification_note, verified_at`,
    [shopId,from,to,note ?? null,adminId]);
  return rows[0] ?? null;
}

export async function listInterviewQueue() {
  const { rows } = await pool.query(
    `SELECT ir.id,ir.kind,ir.language,ir.claimed_years,ir.status,ir.interviewer_id,
            ir.scheduled_at,ir.created_at,s.business_name,s.user_id AS shop_user_id
       FROM interview_requests ir JOIN shops s ON s.id=ir.shop_id
      WHERE ir.status IN ('requested','scheduled','in_progress')
      ORDER BY CASE ir.status WHEN 'requested' THEN 0 ELSE 1 END,ir.created_at ASC`);
  return rows;
}

export async function scheduleInterview(id, interviewerId, scheduledAt) {
  const { rows } = await pool.query(
    `UPDATE interview_requests SET status='scheduled',interviewer_id=$2,scheduled_at=$3,updated_at=now()
      WHERE id=$1 AND status IN ('requested','scheduled')
      RETURNING id,kind,language,status,interviewer_id,scheduled_at`,
    [id,interviewerId,scheduledAt]);
  return rows[0] ?? null;
}

export async function updateInterviewStatus(id, userId, role, status) {
  const { rows } = await pool.query(
    `UPDATE interview_requests SET status=$3,updated_at=now()
      WHERE id=$1 AND ($2='admin' OR interviewer_id=$4)
        AND status IN ('scheduled','in_progress')
      RETURNING id,status,interviewer_id,scheduled_at`,
    [id,role,status,userId]);
  return rows[0] ?? null;
}

export async function updatePartsShop(id, data, client) {
  const { rows } = await run(client,
    `UPDATE parts_shops SET business_name=COALESCE($2,business_name),description=COALESCE($3,description),
      state=COALESCE($4,state),city_area=COALESCE($5,city_area),address=COALESCE($6,address),
      opening_hours=COALESCE($7,opening_hours),offers_pickup=COALESCE($8,offers_pickup),
      offers_delivery=COALESCE($9,offers_delivery),delivery_fee_kobo=COALESCE($10,delivery_fee_kobo),
      updated_at=now() WHERE id=$1 RETURNING *`,
    [id,data.businessName ?? null,data.description ?? null,data.state ?? null,data.cityArea ?? null,data.address ?? null,
     data.openingHours ?? null,data.offersPickup ?? null,data.offersDelivery ?? null,data.deliveryFeeKobo ?? null]);
  return rows[0];
}

export async function listParts({ state, cityArea, search, limit, offset }) {
  const where = ["ps.verification_status='verified'", 'p.is_active',
    'NOT EXISTS (SELECT 1 FROM shops s WHERE s.user_id=ps.user_id AND s.sells_parts=FALSE)'];
  const params = [];
  if (state) { params.push(state); where.push(`ps.state=$${params.length}`); }
  if (cityArea) { params.push(`%${cityArea}%`); where.push(`ps.city_area ILIKE $${params.length}`); }
  if (search) { params.push(`%${search}%`); where.push(`(p.name ILIKE $${params.length} OR coalesce(p.brand,'') ILIKE $${params.length} OR coalesce(p.part_number,'') ILIKE $${params.length})`); }
  const whereSql = where.join(' AND ');
  const { rows: count } = await pool.query(
    `SELECT count(*)::int AS total FROM parts p JOIN parts_shops ps ON ps.id=p.parts_shop_id WHERE ${whereSql}`, params);
  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT p.*, ps.business_name, ps.state, ps.city_area, ps.offers_pickup, ps.offers_delivery, ps.delivery_fee_kobo
       FROM parts p JOIN parts_shops ps ON ps.id=p.parts_shop_id
      WHERE ${whereSql} ORDER BY p.updated_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
  return { rows, total: count[0].total };
}

export async function upsertPart(partsShopId, id, data, client) {
  if (id) {
    const { rows } = await run(client,
      `UPDATE parts SET name=COALESCE($3,name),brand=COALESCE($4,brand),part_number=COALESCE($5,part_number),
       condition=COALESCE($6,condition),price_kobo=COALESCE($7,price_kobo),stock_qty=COALESCE($8,stock_qty),
       is_active=COALESCE($9,is_active),description=COALESCE($10,description),
       image_public_id=COALESCE($11,image_public_id),image_resource_type=COALESCE($12,image_resource_type),
       image_format=COALESCE($13,image_format),image_version=COALESCE($14,image_version),image_bytes=COALESCE($15,image_bytes),
       updated_at=now() WHERE id=$1 AND parts_shop_id=$2 RETURNING *`,
      [id,partsShopId,data.name ?? null,data.brand ?? null,data.partNumber ?? null,data.condition ?? null,data.priceKobo ?? null,
       data.stockQty ?? null,data.isActive ?? null,data.description ?? null,data.image?.publicId ?? null,data.image?.resourceType ?? null,
       data.image?.format ?? null,data.image?.version ?? null,data.image?.bytes ?? null]);
    return rows[0] ?? null;
  }
  const { rows } = await run(client,
    `INSERT INTO parts (parts_shop_id,name,brand,part_number,condition,price_kobo,stock_qty,is_active,description,
      image_public_id,image_resource_type,image_format,image_version,image_bytes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [partsShopId,data.name,data.brand ?? null,data.partNumber ?? null,data.condition,data.priceKobo,data.stockQty ?? 0,
     data.isActive ?? true,data.description ?? null,data.image?.publicId ?? null,data.image?.resourceType ?? null,
     data.image?.format ?? null,data.image?.version ?? null,data.image?.bytes ?? null]);
  return rows[0];
}

export async function listShopParts(partsShopId) {
  const { rows } = await pool.query('SELECT * FROM parts WHERE parts_shop_id=$1 ORDER BY updated_at DESC', [partsShopId]);
  return rows;
}

export async function createPartsOrder({ buyerId, partsShopId, fulfilmentType, subtotal, deliveryFee, vehicleId, workOrderId, items, address, latitude, longitude }, client) {
  const { rows } = await run(client,
    `INSERT INTO parts_orders (buyer_id,parts_shop_id,work_order_id,vehicle_id,fulfilment_type,status,subtotal_kobo,delivery_fee_kobo,total_kobo)
     VALUES ($1,$2,$3,$4,$5,'awaiting_payment',$6,$7,$6+$7) RETURNING *`,
    [buyerId,partsShopId,workOrderId ?? null,vehicleId ?? null,fulfilmentType,subtotal,deliveryFee]);
  const order = rows[0];
  await run(client,
    `INSERT INTO parts_order_items (order_id,part_id,name_snapshot,qty,unit_price_kobo)
     SELECT $1, part_id, name_snapshot, qty, unit_price_kobo
       FROM unnest($2::uuid[], $3::text[], $4::int[], $5::bigint[])
            AS t(part_id,name_snapshot,qty,unit_price_kobo)`,
    [order.id, items.map(i => i.partId), items.map(i => i.name), items.map(i => i.qty), items.map(i => i.unitPrice)]);
  if (fulfilmentType === 'delivery') {
    await run(client,
      'INSERT INTO parts_deliveries (order_id,address,latitude,longitude) VALUES ($1,$2,$3,$4)',
      [order.id,address,latitude ?? null,longitude ?? null]);
  }
  await run(client,
    "INSERT INTO parts_order_events (order_id,status,note,actor_id) VALUES ($1,'awaiting_payment','Order created',$2)",
    [order.id,buyerId]);
  return order;
}

export async function getPartById(id, client) {
  const { rows } = await run(client,
    `SELECT p.*, ps.business_name, ps.city_area, ps.state, ps.offers_pickup, ps.offers_delivery, ps.delivery_fee_kobo
       FROM parts p JOIN parts_shops ps ON ps.id=p.parts_shop_id WHERE p.id=$1`, [id]);
  return rows[0] ?? null;
}

export async function listPartsOrders({ buyerId, partsShopId }) {
  const where = buyerId ? 'po.buyer_id=$1' : 'po.parts_shop_id=$1';
  const { rows } = await pool.query(
    `SELECT po.*, ps.business_name, ps.user_id AS parts_shop_user_id,
      (SELECT coalesce(json_agg(json_build_object('partId',poi.part_id,'name',poi.name_snapshot,'qty',poi.qty,'unitPrice',poi.unit_price_kobo,'lineTotal',poi.qty*poi.unit_price_kobo)),'[]'::json)
       FROM parts_order_items poi WHERE poi.order_id=po.id) AS items
     FROM parts_orders po JOIN parts_shops ps ON ps.id=po.parts_shop_id
     WHERE ${where} ORDER BY po.created_at DESC`, [buyerId ?? partsShopId]);
  return rows;
}

export async function getPartsOrder(id, userId) {
  const { rows } = await pool.query(
    `SELECT po.*, ps.business_name, ps.user_id AS parts_shop_user_id,
      (SELECT coalesce(json_agg(json_build_object('partId',poi.part_id,'name',poi.name_snapshot,'qty',poi.qty,'unitPrice',poi.unit_price_kobo)),'[]'::json)
       FROM parts_order_items poi WHERE poi.order_id=po.id) AS items,
      (SELECT row_to_json(d) FROM parts_deliveries d WHERE d.order_id=po.id) AS delivery,
      (SELECT coalesce(json_agg(json_build_object('id',e.id,'status',e.status,'note',e.note,'latitude',e.latitude,'longitude',e.longitude,'createdAt',e.created_at) ORDER BY e.created_at),'[]'::json)
       FROM parts_order_events e WHERE e.order_id=po.id) AS events
     FROM parts_orders po JOIN parts_shops ps ON ps.id=po.parts_shop_id
     WHERE po.id=$1 AND (po.buyer_id=$2 OR ps.user_id=$2)`, [id,userId]);
  return rows[0] ?? null;
}

export async function updatePartsOrderStatus(id, userId, status, note, latitude, longitude, client) {
  const { rows } = await run(client,
    `UPDATE parts_orders po SET status=$3,updated_at=now()
       FROM parts_shops ps
      WHERE po.id=$1 AND po.parts_shop_id=ps.id AND ps.user_id=$2
      RETURNING po.*`, [id,userId,status]);
  if (!rows[0]) return null;
  await run(client,
    'INSERT INTO parts_order_events (order_id,status,note,latitude,longitude,actor_id) VALUES ($1,$2,$3,$4,$5,$6)',
    [id,status,note ?? null,latitude ?? null,longitude ?? null,userId]);
  return rows[0];
}

export async function updatePartsDeliveryLocation(id, userId, latitude, longitude, client) {
  const { rows } = await run(client,
    `UPDATE parts_deliveries d
        SET last_latitude=$3,last_longitude=$4,last_position_at=now()
       FROM parts_orders po JOIN parts_shops ps ON ps.id=po.parts_shop_id
      WHERE d.order_id=$1 AND po.id=d.order_id AND po.parts_shop_id=ps.id
        AND ps.user_id=$2 AND po.fulfilment_type='delivery'
      RETURNING d.order_id,d.last_latitude,d.last_longitude,d.last_position_at`,
    [id,userId,latitude,longitude]);
  return rows[0] ?? null;
}

export async function insertVerificationDocument(ownerType, ownerId, doc, client) {
  const { rows } = await run(client,
    `INSERT INTO verification_documents (owner_type,owner_id,doc_type,label,reference_number,
      public_id,resource_type,format,version,bytes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [ownerType,ownerId,doc.docType,doc.label ?? null,doc.referenceNumber ?? null,
     doc.file?.publicId ?? null,doc.file?.resourceType ?? null,doc.file?.format ?? null,doc.file?.version ?? null,doc.file?.bytes ?? null]);
  return rows[0];
}
