import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/respond.js';
import * as vehicles from '../services/vehicles.service.js';

export const list   = asyncHandler(async (req, res) => ok(res, await vehicles.list(req.user)));
export const get    = asyncHandler(async (req, res) => ok(res, await vehicles.get(req.user, req.params.id)));
export const create = asyncHandler(async (req, res) => created(res, await vehicles.create(req.user, req.body)));
export const update = asyncHandler(async (req, res) => ok(res, await vehicles.update(req.user, req.params.id, req.body)));
export const remove = asyncHandler(async (req, res) => { await vehicles.remove(req.user, req.params.id); res.status(204).end(); });
