import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/respond.js';
import * as jobs from '../services/workOrders.service.js';

export const list = asyncHandler(async (req, res) => {
  const { data, meta } = await jobs.list(req.user, req.query);
  ok(res, data, meta);
});
export const get = asyncHandler(async (req, res) => ok(res, await jobs.getDetail(req.user, req.params.id)));
export const changeStatus = asyncHandler(async (req, res) => ok(res, await jobs.changeStatus(req.user, req.params.id, req.body)));
export const raiseExtraWork = asyncHandler(async (req, res) => created(res, await jobs.raiseExtraWork(req.user, req.params.id, req.body)));
export const decideExtra = (decision) => asyncHandler(async (req, res) =>
  ok(res, await jobs.decideExtraWork(req.user, req.params.id, decision, req.body)));
