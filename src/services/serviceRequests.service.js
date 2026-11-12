import { withTransaction } from '../db.js';
import { badRequest, conflict, notFound } from '../utils/httpError.js';
import { offsetOf, pageMeta } from '../utils/respond.js';
import * as requests from '../queries/serviceRequests.queries.js';
import * as vehicles from '../queries/vehicles.queries.js';
import * as shops from '../queries/shops.queries.js';
import * as quotes from '../queries/quotes.queries.js';
import * as bookings from '../queries/bookings.queries.js';

const strip = ({ shop_user_id, ...rest }) => rest; // internal field, never sent to clients

// Who may see a request: its owner, the shop it was sent to, or an admin. Everyone else gets 404.
export async function loadForUser(user, id, client) {
  const r = await requests.findRequestById(id, client);
  const allowed = r && (user.role === 'admin' || r.owner_id === user.id || r.shop_user_id === user.id);
  if (!allowed) throw notFound('Request not found');
  return r;
}

export async function create(user, body) {
  const vehicle = await vehicles.findVehicleForOwner(body.vehicleId, user.id);
  if (!vehicle) throw notFound('Vehicle not found');
  const shop = await shops.findVerifiedShopById(body.shopId);
  if (!shop) throw badRequest('That shop is not available', 'SHOP_UNAVAILABLE');
  const { id } = await requests.insertServiceRequest({ ...body, ownerId: user.id });
  return strip(await requests.findRequestById(id));
}

export async function list(user, q) {
  const scope = user.role === 'owner' ? { ownerId: user.id } : {};
  if (user.role === 'shop') {
    const shop = await shops.findShopByUserId(user.id);
    if (!shop) throw notFound('Shop profile not found');
    scope.shopId = shop.id;
  }
  const { rows, total } = await requests.listRequests({ ...scope, status: q.status, limit: q.pageSize, offset: offsetOf(q.page, q.pageSize) });
  return { data: rows.map(strip), meta: pageMeta(q.page, q.pageSize, total) };
}

export async function getDetail(user, id) {
  const r = await loadForUser(user, id);
  const [quoteList, bookingList] = await Promise.all([quotes.listQuotesForRequest(id), bookings.listBookingsForRequest(id)]);
  return { ...strip(r), quotes: quoteList, bookings: bookingList };
}

export async function cancel(user, id) {
  return withTransaction(async (client) => {
    const r = await requests.findRequestForUpdate(id, client);
    if (!r || r.owner_id !== user.id) throw notFound('Request not found');
    if (!['open', 'quoted'].includes(r.status)) {
      throw conflict('CANNOT_CANCEL', 'This request can no longer be cancelled');
    }
    await quotes.supersedeActiveQuote(id, client, 'withdrawn');
    await requests.setRequestStatus(id, 'cancelled', client);
    return { id, status: 'cancelled' };
  });
}
