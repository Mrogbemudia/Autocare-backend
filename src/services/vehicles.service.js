import { conflict, notFound } from '../utils/httpError.js';
import * as vehicles from '../queries/vehicles.queries.js';

const duplicatePlate = (err) => err?.code === '23505' && err.constraint === 'vehicles_owner_plate_unique';

export const list = (user) => vehicles.listVehiclesByOwner(user.id);

export async function get(user, id) {
  const v = await vehicles.findVehicleForOwner(id, user.id);
  if (!v) throw notFound('Vehicle not found'); // same answer for "missing" and "someone else's"
  return v;
}

export async function create(user, body) {
  try {
    return await vehicles.insertVehicle(user.id, body);
  } catch (err) {
    if (duplicatePlate(err)) throw conflict('DUPLICATE_PLATE', 'You have already saved a vehicle with this plate number');
    throw err;
  }
}

export async function update(user, id, body) {
  try {
    const v = await vehicles.updateVehicle(id, user.id, body);
    if (!v) throw notFound('Vehicle not found');
    return v;
  } catch (err) {
    if (duplicatePlate(err)) throw conflict('DUPLICATE_PLATE', 'You have already saved a vehicle with this plate number');
    throw err;
  }
}

export async function remove(user, id) {
  await get(user, id);
  if (await vehicles.hasActiveJob(id)) throw conflict('VEHICLE_HAS_ACTIVE_JOB', 'This vehicle has an active request or job and cannot be deleted');
  try {
    await vehicles.deleteVehicle(id, user.id);
  } catch (err) {
    if (err?.code === '23503') throw conflict('VEHICLE_HAS_HISTORY', 'This vehicle has service history and cannot be deleted');
    throw err;
  }
}
