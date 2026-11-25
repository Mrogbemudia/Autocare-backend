import { withTransaction } from '../db.js';
import { badRequest, conflict, notFound } from '../utils/httpError.js';
import { offsetOf, pageMeta } from '../utils/respond.js';
import * as shops from '../queries/shops.queries.js';
import * as users from '../queries/users.queries.js';

// Phone numbers are deliberately omitted from every shop response, including authenticated views.
const publicShop = (s) => ({
  id: s.id, business_name: s.business_name, description: s.description, state: s.state,
  city_area: s.city_area, address: s.address, opening_hours: s.opening_hours,
  certification_notes: s.certification_notes, services: s.services,
  avg_rating: s.avg_rating, review_count: s.review_count, created_at: s.created_at,
});

const ownShop = (s) => ({ ...publicShop(s, true), verification_status: s.verification_status, verification_note: s.verification_note });

export async function search(q, viewer) {
  const { rows, total } = await shops.searchVerifiedShops({ ...q, limit: q.pageSize, offset: offsetOf(q.page, q.pageSize) });
  return { data: rows.map((s) => publicShop(s, viewer)), meta: pageMeta(q.page, q.pageSize, total) };
}

export async function getPublic(id, viewer) {
  const shop = await shops.findVerifiedShopById(id);
  if (!shop) throw notFound('Shop not found');
  return publicShop(shop, viewer);
}

export async function getMine(user) {
  const shop = await shops.findShopByUserId(user.id);
  if (!shop) throw notFound('Shop profile not found');
  return ownShop(shop);
}

export async function updateMine(user, body) {
  return withTransaction(async (client) => {
    const shop = await shops.findShopByUserId(user.id, client);
    if (!shop) throw notFound('Shop profile not found');

    if (body.serviceCodes) {
      const types = await shops.findServiceTypesByCodes(body.serviceCodes, client);
      if (types.length !== new Set(body.serviceCodes).size) {
        throw badRequest('One or more service types are not recognised', 'UNKNOWN_SERVICE_TYPE');
      }
      await shops.replaceShopServices(shop.id, types.map((t) => t.id), client);
    }
    if (body.phone) await users.updateUserPhone(user.id, body.phone, client);
    await shops.updateShop(shop.id, body, client);
    return ownShop(await shops.findShopById(shop.id, client));
  });
}

// ---- admin ----
export async function adminList(q) {
  const { rows, total } = await shops.listShopsForAdmin({ status: q.status, limit: q.pageSize, offset: offsetOf(q.page, q.pageSize) });
  return {
    data: rows.map((s) => ({ ...ownShop(s), email: s.email, owner_name: s.owner_name })),
    meta: pageMeta(q.page, q.pageSize, total),
  };
}

const RULES = {
  verify:  { from: ['pending', 'rejected', 'suspended'], to: 'verified' },
  reject:  { from: ['pending'],                          to: 'rejected' },
  suspend: { from: ['verified'],                         to: 'suspended' },
};

export async function adminDecide(action, shopId, adminId, note) {
  const rule = RULES[action];
  const updated = await shops.transitionVerification({ shopId, ...rule, adminId, note });
  if (updated) return updated;
  const exists = await shops.findShopById(shopId);
  if (!exists) throw notFound('Shop not found');
  throw conflict('INVALID_TRANSITION', `A shop that is ${exists.verification_status} cannot be ${rule.to}`);
}
