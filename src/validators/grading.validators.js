import { z } from 'zod';

export const startAttemptSchema = z.object({
  kind: z.enum(['safety', 'experience']),
  claimedYears: z.number().int().min(0).max(60).optional(),
  mode: z.enum(['text', 'audio']).default('text'),
  language: z.enum(['en', 'pcm']).default('en'),
}).refine((v) => v.kind !== 'experience' || v.claimedYears !== undefined, {
  message: 'claimedYears is required for the experience test',
  path: ['claimedYears'],
});

export const attemptIdParamSchema = z.object({ attemptId: z.string().uuid() });

export const submitAttemptSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string().uuid(),
    chosenIndex: z.number().int().min(0).max(9),
  })).min(1).max(30),
});
