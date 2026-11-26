import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/respond.js';
import * as service from '../services/features.service.js';

export const submitDocuments = asyncHandler(async (req,res) => {
  const data = await service.submitDocuments(req.user,req.params.ownerType,req.body.docType,req.body.label,req.body.referenceNumber,req.files ?? []);
  created(res,data);
});
export const technicianDashboard = asyncHandler(async (req,res) => ok(res,await service.technicianDashboard(req.user)));
export const partsShopDashboard = asyncHandler(async (req,res) => ok(res,await service.getPartsShopDashboard(req.user)));
export const updatePartsShop = asyncHandler(async (req,res) => ok(res,await service.updatePartsShop(req.user,req.body)));
export const savePart = asyncHandler(async (req,res) => ok(res,await service.savePart(req.user,req.params.partId,req.body,req.file)));
export const browseParts = asyncHandler(async (req,res) => {
  const result = await service.browseParts({ page:Number(req.query.page ?? 1),pageSize:Number(req.query.pageSize ?? 20),state:req.query.state,cityArea:req.query.cityArea,search:req.query.search });
  res.json({ data: result.data.map((row) => row), meta: result.meta });
});
export const checkoutParts = asyncHandler(async (req,res) => created(res,await service.checkoutParts(req.user,req.body)));
export const initializePartsPayment = asyncHandler(async (req,res) => ok(res,await service.initializePartsPayment(req.user,req.params.orderId)));
export const verifyPartsPayment = asyncHandler(async (req,res) => ok(res,await service.verifyPartsPayment(req.user,req.params.reference)));
export const bankTransfer = asyncHandler(async (req,res) => ok(res,await service.createBankTransferPayment(req.user,req.params.orderId)));
export const buyerOrders = asyncHandler(async (req,res) => ok(res,await service.listBuyerOrders(req.user)));
export const vendorOrders = asyncHandler(async (req,res) => ok(res,await service.listVendorOrders(req.user)));
export const getOrder = asyncHandler(async (req,res) => ok(res,await service.getOrder(req.user,req.params.orderId)));
export const updateOrderStatus = asyncHandler(async (req,res) => ok(res,await service.updateOrderStatus(req.user,req.params.orderId,req.body.status,req.body.note,req.body.latitude,req.body.longitude)));
export const updateDeliveryLocation = asyncHandler(async (req,res) =>
  ok(res,await service.updateDeliveryLocation(req.user,req.params.orderId,req.body.latitude,req.body.longitude)));
export const maintenance = asyncHandler(async (req,res) => ok(res,await service.maintenanceDashboard(req.user)));
export const setMaintenanceRule = asyncHandler(async (req,res) => ok(res,await service.setMaintenanceRule(req.user,req.body)));
export const reminderSettings = asyncHandler(async (req,res) => ok(res,await service.setReminderSettings(req.user,req.body)));
export const insuranceProducts = asyncHandler(async (req,res) => ok(res,await service.insuranceProducts()));
export const applyInsurance = asyncHandler(async (req,res) => created(res,await service.applyInsurance(req.user,req.body)));
export const myInsurance = asyncHandler(async (req,res) => ok(res,await service.myInsuranceRequests(req.user)));
export const requestInterview = asyncHandler(async (req,res) => created(res,await service.requestInterview(req.user,req.body)));
export const listInterviews = asyncHandler(async (req,res) => ok(res,await service.listInterviewRequests(req.user)));
export const adminPartsShops = asyncHandler(async (req,res) => {
  const result = await service.adminListPartsShops(
    req.query.status,Number(req.query.page ?? 1),Number(req.query.pageSize ?? 20));
  ok(res,result.data,result.meta);
});
export const adminPartsShopDecision = (action) => asyncHandler(async (req,res) =>
  ok(res,await service.adminDecidePartsShop(action,req.params.id,req.user.id,req.body.note)));
export const interviewQueue = asyncHandler(async (req,res) => ok(res,await service.interviewQueue()));
export const scheduleInterview = asyncHandler(async (req,res) =>
  ok(res,await service.scheduleInterview(req.user,req.params.id,req.body.scheduledAt)));
export const updateInterviewStatus = asyncHandler(async (req,res) =>
  ok(res,await service.updateInterviewStatus(req.user,req.params.id,req.body.status)));
export const createCall = asyncHandler(async (req,res) => created(res,await service.createCall(req.user,req.body)));
export const incomingCalls = asyncHandler(async (req,res) => ok(res,await service.incomingCalls(req.user)));
export const updateCall = asyncHandler(async (req,res) => ok(res,await service.updateCall(req.user,req.params.callId,req.body.status)));
export const getCall = asyncHandler(async (req,res) => ok(res,await service.getCall(req.user,req.params.callId)));
export const addCallSignal = asyncHandler(async (req,res) => created(res,await service.addCallSignal(req.user,req.params.callId,req.body.kind,req.body.payload)));
export const callSignals = asyncHandler(async (req,res) => ok(res,await service.callSignals(req.user,req.params.callId,req.query.after)));
