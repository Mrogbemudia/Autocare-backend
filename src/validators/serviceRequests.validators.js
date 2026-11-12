import { z } from 'zod';
import { pagination, kobo, futureDate } from './common.js';

export const createRequestBody = z.object({
  vehicleId: z.string().uuid(),
  shopId: z.string().uuid(),
  symptoms: z.string().trim().min(10, 'Please describe the problem (at least 10 characters)').max(2000),
  urgency: z.enum(['standard', 'urgent']).default('standard'),
  locationType: z.enum(['visit_shop', 'mobile']),
  serviceAddress: z.string().trim().min(5).max(300).optional(),
}).strict().refine((b) => b.locationType !== 'mobile' || b.serviceAddress, {
  path: ['serviceAddress'], message: 'Address is required for a mobile mechanic visit',
});

export const listRequestsQuery = z.object({
  status: z.enum(['open', 'quoted', 'accepted', 'booked', 'completed', 'cancelled']).optional(),
  ...pagination,
});

export const createQuoteBody = z.object({
  items: z.array(z.object({
    description: z.string().trim().min(2).max(200),
    quantity: z.number().int().min(1).max(1000),
    unitPriceKobo: kobo(),
  }).strict()).min(1, 'Add at least one line item').max(30),
  labourKobo: kobo().default(0),
  estimatedDurationHours: z.number().int().min(1).max(2000).optional(),
  notes: z.string().trim().max(1000).optional(),
}).strict(); // NOTE: no `total` field. The server calculates it.

export const acceptQuoteBody = z.object({ proposedAt: futureDate }).strict();
export const rejectQuoteBody = z.object({ reason: z.string().trim().max(500).optional() }).strict();
export const proposeBookingBody = acceptQuoteBody;
export const declineBookingBody = z.object({ reason: z.string().trim().min(3, 'A reason is required').max(500) }).strict();
