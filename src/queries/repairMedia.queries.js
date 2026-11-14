export async function insertForRequest(media, requestId, client) {
  const { rows } = await client.query(
    `INSERT INTO repair_media (service_request_id, public_id, resource_type, format, version, bytes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, public_id, resource_type, format, version, bytes`,
    [requestId, media.publicId, media.resourceType, media.format, media.version, media.bytes],
  );
  return rows[0];
}

export async function insertForPlan(media, planId, client) {
  const { rows } = await client.query(
    `INSERT INTO repair_media (repair_plan_id, public_id, resource_type, format, version, bytes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, public_id, resource_type, format, version, bytes`,
    [planId, media.publicId, media.resourceType, media.format, media.version, media.bytes],
  );
  return rows[0];
}
