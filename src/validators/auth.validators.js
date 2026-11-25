import { z } from 'zod';
import { NG_STATES, phoneSchema } from './common.js';

const email = z.string().trim().toLowerCase().email('Enter a valid email').max(254);
// bcrypt only uses the first 72 bytes, so we cap the length.
const password = z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password is too long');

const account = {
  fullName: z.string().trim().min(2).max(100),
  email,
  phone: phoneSchema,
  password,
};

export const registerOwnerBody = z.object(account).strict();

export const registerShopBody = z.object({
  ...account,
  businessName: z.string().trim().min(2).max(120),
  state: z.enum(NG_STATES),
  cityArea: z.string().trim().min(2).max(100),
  address: z.string().trim().min(5).max(250),
  serviceCodes: z.array(z.string().regex(/^[a-z0-9_]+$/)).min(1).max(10),
  description: z.string().trim().max(1000).optional(),
  openingHours: z.string().trim().max(300).optional(),
  certificationNotes: z.string().trim().max(2000).optional(),
}).strict();

export const registerPartsShopBody = z.object({
  ...account,
  businessName: z.string().trim().min(2).max(120),
  state: z.enum(NG_STATES),
  cityArea: z.string().trim().min(2).max(100),
  address: z.string().trim().min(5).max(250),
  description: z.string().trim().max(1000).optional(),
  openingHours: z.string().trim().max(300).optional(),
  offersPickup: z.boolean().optional(),
  offersDelivery: z.boolean().optional(),
  deliveryFeeKobo: z.number().int().min(0).optional(),
}).strict();

export const loginBody = z.object({ email, password: z.string().min(1).max(72) }).strict();
