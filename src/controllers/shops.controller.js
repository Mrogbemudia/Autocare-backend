import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';
import * as shops from '../services/shops.service.js';
import * as sq from '../queries/shops.queries.js';

export const serviceTypes = asyncHandler(async (req, res) => ok(res, await sq.listServiceTypes()));

export const search = asyncHandler(async (req, res) => {
  const { data, meta } = await shops.search(req.query, req.user);
  ok(res, data, meta);
});
export const getPublic = asyncHandler(async (req, res) => ok(res, await shops.getPublic(req.params.id, req.user)));
export const getMine = asyncHandler(async (req, res) => ok(res, await shops.getMine(req.user)));
export const updateMine = asyncHandler(async (req, res) => ok(res, await shops.updateMine(req.user, req.body)));

export const adminList = asyncHandler(async (req, res) => {
  const { data, meta } = await shops.adminList(req.query);
  ok(res, data, meta);
});
export const adminStats = asyncHandler(async (req, res) =>
  ok(res, await sq.getAdminStats()));
export const adminDecision = (action) => asyncHandler(async (req, res) =>
  ok(res, await shops.adminDecide(action, req.params.id, req.user.id, req.body.note)));
