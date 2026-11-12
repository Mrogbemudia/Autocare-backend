import { withTransaction } from '../db.js';
import { conflict, notFound } from '../utils/httpError.js';
import * as requests from '../queries/serviceRequests.queries.js';
import * as quotes from '../queries/quotes.queries.js';
import * as bookings from '../queries/bookings.queries.js';
import { loadForUser } from './serviceRequests.service.js';

// The server calculates every amount. The client never sends a total.
export function calculateTotals({ items, labourKobo }) {
  const itemsTotalKobo = items.reduce((sum, i) => sum + i.quantity * i.unitPriceKobo, 0);
  return { itemsTotalKobo, totalKobo: itemsTotalKobo + labourKobo };
}

export async function submitQuote(user, requestId, body) {
  return withTransaction(async (client) => {
    const r = await requests.findRequestForUpdate(requestId, client);
    if (!r || r.shop_user_id !== user.id) throw notFound('Request not found'); // only the addressed shop
    if (!['open', 'quoted'].includes(r.status)) {
      throw conflict('QUOTE_LOCKED', 'A quote can no longer be submitted for this request');
    }
    const totals = calculateTotals(body);
    await quotes.supersedeActiveQuote(requestId, client);            // the revision replaces it; history is kept
    const version = await quotes.nextQuoteVersion(requestId, client);
    const { id } = await quotes.insertQuote({ requestId, version, labourKobo: body.labourKobo, ...totals,
      estimatedDurationHours: body.estimatedDurationHours, notes: body.notes }, client);
    await quotes.insertQuoteItems(id, body.items, client);
    await requests.setRequestStatus(requestId, 'quoted', client);
    const [quote] = (await quotes.listQuotesForRequest(requestId, client)).filter((q) => q.id === id);
    return quote;
  });
}

export async function listForRequest(user, requestId) {
  await loadForUser(user, requestId);
  return quotes.listQuotesForRequest(requestId);
}

// Accepting locks the price and proposes a booking time, all in one transaction.
export async function acceptQuote(user, quoteId, { proposedAt }) {
  return withTransaction(async (client) => {
    const q = await quotes.findQuoteWithRequestForUpdate(quoteId, client);
    if (!q || q.owner_id !== user.id) throw notFound('Quote not found');
    if (q.status !== 'active' || q.request_status !== 'quoted') {
      throw conflict('QUOTE_NOT_ACTIVE', 'This quote can no longer be accepted');
    }
    if (!(await quotes.acceptQuote(quoteId, client))) throw conflict('QUOTE_NOT_ACTIVE', 'This quote can no longer be accepted');
    await requests.setRequestStatus(q.service_request_id, 'accepted', client);
    const booking = await bookings.insertBooking({ quoteId, proposedAt }, client);
    return { quoteId, status: 'accepted', lockedTotalKobo: q.total_kobo, booking };
  });
}

export async function rejectQuote(user, quoteId, { reason }) {
  return withTransaction(async (client) => {
    const q = await quotes.findQuoteWithRequestForUpdate(quoteId, client);
    if (!q || q.owner_id !== user.id) throw notFound('Quote not found');
    if (q.status !== 'active' || q.request_status !== 'quoted') {
      throw conflict('QUOTE_NOT_ACTIVE', 'This quote can no longer be rejected');
    }
    await quotes.rejectQuote(quoteId, reason, client);
    await requests.setRequestStatus(q.service_request_id, 'open', client); // shop may revise
    return { quoteId, status: 'rejected' };
  });
}
