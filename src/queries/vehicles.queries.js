import { query } from '../db.js';

const COLS = `id, vehicle_type, make, model, year, plate_number, vin, fuel_type,
              mileage_km, mileage_updated_at, created_at, updated_at`;

export async function listVehiclesByOwner(ownerId) {
  const { rows } = await query(`SELECT ${COLS} FROM vehicles WHERE owner_id = $1 ORDER BY created_at DESC`, [ownerId]);
  return rows;
}

// The owner_id in the WHERE clause is the ownership check (anti-IDOR).
export async function findVehicleForOwner(id, ownerId) {
  const { rows } = await query(`SELECT ${COLS} FROM vehicles WHERE id = $1 AND owner_id = $2`, [id, ownerId]);
  return rows[0] ?? null;
}

export async function insertVehicle(ownerId, f) {
  const { rows } = await query(
    `INSERT INTO vehicles (owner_id, vehicle_type, make, model, year, plate_number, vin, fuel_type, mileage_km, mileage_updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9::int IS NULL THEN NULL ELSE now() END)
     RETURNING ${COLS}`,
    [ownerId, f.vehicleType, f.make, f.model, f.year, f.plateNumber ?? null, f.vin ?? null, f.fuelType, f.mileageKm ?? null],
  );
  return rows[0];
}

export async function updateVehicle(id, ownerId, f) {
  const { rows } = await query(
    `UPDATE vehicles SET
        vehicle_type = COALESCE($3::text, vehicle_type),
        make         = COALESCE($4::text, make),
        model        = COALESCE($5::text, model),
        year         = COALESCE($6::int,  year),
        plate_number = COALESCE($7::text, plate_number),
        vin          = COALESCE($8::text, vin),
        fuel_type    = COALESCE($9::text, fuel_type),
        mileage_updated_at = CASE WHEN $10::int IS NOT NULL THEN now() ELSE mileage_updated_at END,
        mileage_km   = COALESCE($10::int, mileage_km),
        updated_at   = now()
      WHERE id = $1 AND owner_id = $2
      RETURNING ${COLS}`,
    [id, ownerId, f.vehicleType ?? null, f.make ?? null, f.model ?? null, f.year ?? null,
     f.plateNumber ?? null, f.vin ?? null, f.fuelType ?? null, f.mileageKm ?? null],
  );
  return rows[0] ?? null;
}

export async function hasActiveJob(vehicleId) {
  const { rows } = await query(
    `SELECT 1 FROM service_requests WHERE vehicle_id = $1 AND status IN ('open','quoted','accepted','booked')
     UNION ALL
     SELECT 1 FROM work_orders WHERE vehicle_id = $1 AND status NOT IN ('completed','cancelled')
     LIMIT 1`,
    [vehicleId],
  );
  return rows.length > 0;
}

export async function deleteVehicle(id, ownerId) {
  const { rowCount } = await query('DELETE FROM vehicles WHERE id = $1 AND owner_id = $2', [id, ownerId]);
  return rowCount === 1;
}
