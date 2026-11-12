import { z } from 'zod';

const thisYearPlusOne = () => new Date().getFullYear() + 1;

const fields = {
  vehicleType: z.enum(['car', 'suv', 'bus', 'truck', 'motorcycle', 'tricycle']),
  make: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(50),
  year: z.number().int().min(1950).refine((y) => y <= thisYearPlusOne(), { message: 'Year cannot be in the future' }),
  plateNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9 -]{3,15}$/, 'Invalid plate number'),
  vin: z.string().trim().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'VIN must be 17 characters'),
  fuelType: z.enum(['petrol', 'diesel', 'cng', 'electric', 'hybrid']),
  mileageKm: z.number().int().min(0).max(5_000_000),
};

export const createVehicleBody = z.object({
  vehicleType: fields.vehicleType, make: fields.make, model: fields.model, year: fields.year,
  fuelType: fields.fuelType,
  plateNumber: fields.plateNumber.optional(), vin: fields.vin.optional(), mileageKm: fields.mileageKm.optional(),
}).strict();

export const updateVehicleBody = z.object(fields).partial().strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' });
