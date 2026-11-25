import * as service from '../services/grading.service.js';
// ADAPTER: your asyncHandler wraps async route handlers so errors reach errorHandler.
import { asyncHandler } from '../utils/asyncHandler.js';

// ADAPTER: swap res.json for your respond helper if your envelope differs.
export const start = asyncHandler(async (req, res) => {
  res.status(201).json({ data: await service.startAttempt(req.user.id, req.body) });
});

export const submit = asyncHandler(async (req, res) => {
  res.json({ data: await service.submitAttempt(req.user.id, req.params.attemptId, req.body.answers) });
});

export const status = asyncHandler(async (req, res) => {
  res.json({ data: await service.getGradingStatus(req.user.id) });
});
