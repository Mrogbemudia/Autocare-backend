import { z } from 'zod';
import { pagination, kobo } from './common.js';

export const listWorkOrdersQuery = z.object({
  status: z.enum(['inspection', 'approval_pending', 'in_repair', 'testing', 'ready_for_pickup', 'completed', 'cancelled']).optional(),
  ...pagination,
});

// 'inspection' and 'approval_pending' are not valid targets here: the first is the start state,
// the second is reached only by raising an extra-work request.
export const changeStatusBody = z.object({
  status: z.enum(['in_repair', 'testing', 'ready_for_pickup', 'completed', 'cancelled']),
  note: z.string().trim().max(500).optional(),
}).strict();

export const extraWorkBody = z.object({
  description: z.string().trim().min(5).max(1000),
  reason: z.string().trim().min(5).max(1000),
  extraCostKobo: kobo().refine((n) => n > 0, { message: 'Extra cost must be greater than 0' }),
}).strict();

export const extraDecisionBody = z.object({ note: z.string().trim().max(500).optional() }).strict();
