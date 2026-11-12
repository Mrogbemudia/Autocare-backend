import { z } from 'zod';
import { normalizeNgPhone } from '../utils/phone.js';

export const NG_STATES = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta',
  'Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi',
  'Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto',
  'Taraba','Yobe','Zamfara',
];

export const idParams = z.object({ id: z.string().uuid('Invalid id') });

export const phoneSchema = z.string().trim()
  .transform((v) => normalizeNgPhone(v))
  .refine((v) => v !== null, { message: 'Enter a valid Nigerian phone number (e.g. 0803 123 4567)' });

export const kobo = (max = 100_000_000_000) => z.number().int().min(0).max(max);

export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
};

export const optionalText = (max) => z.string().trim().max(max).optional();
export const futureDate = z.string().datetime({ offset: true })
  .transform((v) => new Date(v))
  .refine((d) => d.getTime() > Date.now(), { message: 'Date and time must be in the future' });
