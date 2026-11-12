import { z } from 'zod';
import { NG_STATES, pagination, phoneSchema } from './common.js';

export const searchShopsQuery = z.object({
  state: z.enum(NG_STATES).optional(),
  cityArea: z.string().trim().min(1).max(100).optional(),
  service: z.string().regex(/^[a-z0-9_]+$/).optional(),
  sort: z.enum(['rating', 'newest']).default('rating'),
  ...pagination,
});

export const updateShopBody = z.object({
  businessName: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000),
  state: z.enum(NG_STATES),
  cityArea: z.string().trim().min(2).max(100),
  address: z.string().trim().min(5).max(250),
  openingHours: z.string().trim().max(300),
  certificationNotes: z.string().trim().max(2000),
  phone: phoneSchema,
  serviceCodes: z.array(z.string().regex(/^[a-z0-9_]+$/)).min(1).max(10),
}).partial().strict().refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' });

export const adminListQuery = z.object({
  status: z.enum(['pending', 'verified', 'rejected', 'suspended']).default('pending'),
  ...pagination,
});
export const approveBody = z.object({ note: z.string().trim().max(500).optional() }).strict();
export const reasonBody = z.object({ note: z.string().trim().min(3, 'A reason is required').max(500) }).strict();
