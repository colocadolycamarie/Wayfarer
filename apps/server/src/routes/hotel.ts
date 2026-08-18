import { Router, type Request, type Response, type NextFunction } from "express";
import type { z } from "zod";
import {
  AssignHousekeepingTaskBody,
  AssignReservationRoomBody,
  BulkUpdateRatesBody,
  CancelReservationBody,
  CheckInReservationBody,
  CheckOutReservationBody,
  CreateMaintenanceRequestBody,
  CreatePublicReservationBody,
  CreateReservationBody,
  GetPublicAvailabilityQueryParams,
  GetRateCalendarQueryParams,
  ListHousekeepingTasksQueryParams,
  ListReservationsQueryParams,
  PostFolioChargeBody,
  PostFolioPaymentBody,
  RunNightAuditBody,
  UpdateHousekeepingTaskStatusBody,
  UpdateReservationBody,
  UpdateRoomStatusBody,
} from "@workspace/api-zod";
import * as hotel from "../services/hotel-service.js";
import { ConflictError, NotFoundError, ValidationError } from "../services/hotel-service.js";

const router = Router();

// ---------------------------------------------------------------------------
// Request parsing helpers
// ---------------------------------------------------------------------------

function parseBody<S extends z.ZodTypeAny>(schema: S, req: Request): z.infer<S> {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Request validation failed");
  }
  return parsed.data;
}

function parseQuery<S extends z.ZodTypeAny>(schema: S, req: Request): z.infer<S> {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    throw new ValidationError("Query validation failed");
  }
  return parsed.data;
}

function asDateString(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string") throw new ValidationError(`Missing route parameter "${name}"`);
  return value;
}

function wrap(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

router.get(
  "/properties/:propertySlug/summary",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    res.json(await hotel.getSummary(property));
  }),
);

router.get(
  "/properties/:propertySlug/activity",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    res.json(await hotel.listActivity(property.id));
  }),
);

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

router.get(
  "/properties/:propertySlug/rooms",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    res.json(await hotel.listRooms(property.id));
  }),
);

router.patch(
  "/properties/:propertySlug/rooms/:roomId/status",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    const body = parseBody(UpdateRoomStatusBody, req);
    res.json(await hotel.updateRoomStatus(property.id, param(req, "roomId"), body.status, body.note));
  }),
);

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------

router.get(
  "/properties/:propertySlug/reservations",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    const query = parseQuery(ListReservationsQueryParams, req);
    res.json(
      await hotel.listReservations(property.id, {
        search: query.search,
        status: query.status,
        date: query.date ? asDateString(query.date) : undefined,
      }),
    );
  }),
);

router.post(
  "/properties/:propertySlug/reservations",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    const body = parseBody(CreateReservationBody, req);
    const { reservation, created } = await hotel.createReservation(
      property,
      {
        guestName: body.guestName,
        guestEmail: body.guestEmail,
        guestPhone: body.guestPhone,
        roomTypeId: body.roomTypeId,
        ratePlanId: body.ratePlanId,
        assignedRoomId: body.assignedRoomId,
        checkInDate: asDateString(body.checkInDate),
        checkOutDate: asDateString(body.checkOutDate),
        adults: body.adults,
        children: body.children,
        source: body.source,
        specialRequests: body.specialRequests,
        idempotencyKey: body.idempotencyKey,
      },
      false,
    );
    res.status(created ? 201 : 200).json(reservation);
  }),
);

router.get(
  "/properties/:propertySlug/reservations/:reservationId",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    res.json(await hotel.getReservationDetail(property.id, param(req, "reservationId")));
  }),
);

router.patch(
  "/properties/:propertySlug/reservations/:reservationId",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    const body = parseBody(UpdateReservationBody, req);
    res.json(
      await hotel.updateReservation(property.id, param(req, "reservationId"), {
        ...body,
        checkInDate: body.checkInDate ? asDateString(body.checkInDate) : undefined,
        checkOutDate: body.checkOutDate ? asDateString(body.checkOutDate) : undefined,
      }),
    );
  }),
);

router.post(
  "/properties/:propertySlug/reservations/:reservationId/cancel",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    const body = parseBody(CancelReservationBody, req);
    res.json(await hotel.cancelReservation(property.id, param(req, "reservationId"), body.reason));
  }),
);

router.post(
  "/properties/:propertySlug/reservations/:reservationId/check-in",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    const body = parseBody(CheckInReservationBody, req);
    res.json(await hotel.checkInReservation(property.id, param(req, "reservationId"), body.roomId, body.paymentMethod));
  }),
);

router.post(
  "/properties/:propertySlug/reservations/:reservationId/check-out",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    const body = parseBody(CheckOutReservationBody, req);
    res.json(await hotel.checkOutReservation(property.id, param(req, "reservationId"), body.paymentMethod, body.settleBalance));
  }),
);

router.post(
  "/properties/:propertySlug/reservations/:reservationId/assign-room",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    const body = parseBody(AssignReservationRoomBody, req);
    res.json(await hotel.assignReservationRoom(property.id, param(req, "reservationId"), body.roomId));
  }),
);

// ---------------------------------------------------------------------------
// Folios
// ---------------------------------------------------------------------------

router.get(
  "/properties/:propertySlug/folios/:folioId",
  wrap(async (req, res) => {
    res.json(await hotel.getFolio(param(req, "folioId")));
  }),
);

router.post(
  "/properties/:propertySlug/folios/:folioId/charges",
  wrap(async (req, res) => {
    const body = parseBody(PostFolioChargeBody, req);
    res.status(201).json(await hotel.postFolioCharge(param(req, "folioId"), body.type, body.description, body.amountCents));
  }),
);

router.post(
  "/properties/:propertySlug/folios/:folioId/payments",
  wrap(async (req, res) => {
    const body = parseBody(PostFolioPaymentBody, req);
    res.status(201).json(await hotel.postFolioPayment(param(req, "folioId"), body.method, body.amountCents));
  }),
);

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

router.get(
  "/properties/:propertySlug/housekeeping/tasks",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    const query = parseQuery(ListHousekeepingTasksQueryParams, req);
    res.json(await hotel.listHousekeepingTasks(property.id, query.status));
  }),
);

router.post(
  "/properties/:propertySlug/housekeeping/tasks/:taskId/status",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    const body = parseBody(UpdateHousekeepingTaskStatusBody, req);
    res.json(await hotel.updateHousekeepingTaskStatus(property.id, param(req, "taskId"), body.status, body.issue));
  }),
);

router.post(
  "/properties/:propertySlug/housekeeping/tasks/:taskId/assign",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    const body = parseBody(AssignHousekeepingTaskBody, req);
    res.json(await hotel.assignHousekeepingTask(property.id, param(req, "taskId"), body.userId));
  }),
);

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

router.get(
  "/properties/:propertySlug/maintenance",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    res.json(await hotel.listMaintenanceRequests(property.id));
  }),
);

router.post(
  "/properties/:propertySlug/maintenance",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    const body = parseBody(CreateMaintenanceRequestBody, req);
    res.status(201).json(await hotel.createMaintenanceRequest(property.id, body.roomId, body.description, body.priority));
  }),
);

// ---------------------------------------------------------------------------
// Rates & inventory
// ---------------------------------------------------------------------------

router.get(
  "/properties/:propertySlug/rates/calendar",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    const query = parseQuery(GetRateCalendarQueryParams, req);
    res.json(await hotel.getRateCalendar(property, asDateString(query.startDate), query.days));
  }),
);

router.post(
  "/properties/:propertySlug/rates/calendar",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    const body = parseBody(BulkUpdateRatesBody, req);
    res.json(
      await hotel.bulkUpdateRates(property, {
        roomTypeId: body.roomTypeId,
        ratePlanId: body.ratePlanId,
        startDate: asDateString(body.startDate),
        endDate: asDateString(body.endDate),
        priceCents: body.priceCents,
        isClosed: body.isClosed,
      }),
    );
  }),
);

// ---------------------------------------------------------------------------
// Night audit
// ---------------------------------------------------------------------------

router.get(
  "/properties/:propertySlug/night-audit/history",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    res.json(await hotel.listNightAuditRuns(property.id));
  }),
);

router.post(
  "/properties/:propertySlug/night-audit/run",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    const body = parseBody(RunNightAuditBody, req);
    if (!body.confirmCharges || !body.confirmReconciliation) {
      throw new ValidationError("Confirm both audit checkpoints before closing");
    }
    res.json(await hotel.runNightAudit(property));
  }),
);

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

router.get(
  "/properties/:propertySlug/reports/occupancy",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    const range = typeof req.query.range === "string" ? req.query.range : "30d";
    res.json(await hotel.getOccupancyReport(property, range));
  }),
);

router.get(
  "/properties/:propertySlug/reports/revenue",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    res.json(await hotel.getRevenueReport(property));
  }),
);

// ---------------------------------------------------------------------------
// Public booking
// ---------------------------------------------------------------------------

router.get(
  "/book/:propertySlug/availability",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    const query = parseQuery(GetPublicAvailabilityQueryParams, req);
    res.json(
      await hotel.getPublicAvailability(property, asDateString(query.checkIn), asDateString(query.checkOut), query.guests),
    );
  }),
);

router.post(
  "/book/:propertySlug/reservations",
  wrap(async (req, res) => {
    const property = await hotel.getPropertyBySlug(param(req, "propertySlug"));
    const body = parseBody(CreatePublicReservationBody, req);
    const { reservation, created, guestAccessToken } = await hotel.createReservation(
      property,
      {
        guestName: body.guestName,
        guestEmail: body.guestEmail,
        roomTypeId: body.roomTypeId,
        ratePlanId: body.ratePlanId,
        checkInDate: asDateString(body.checkInDate),
        checkOutDate: asDateString(body.checkOutDate),
        adults: body.adults,
        children: body.children,
        source: "direct",
        idempotencyKey: body.idempotencyKey,
      },
      true,
    );
    res.status(created ? 201 : 200).json({
      reservationId: reservation.id,
      confirmationCode: reservation.confirmationCode,
      guestToken: guestAccessToken,
      totalCents: reservation.totalCents,
      property: {
        id: property.id,
        name: property.name,
        slug: property.slug,
        city: property.city,
        timezone: property.timezone,
        currency: property.currency,
        businessDate: property.businessDate,
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// Error handling â€” translate domain errors to HTTP status codes
// ---------------------------------------------------------------------------

router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(error);
  if (error instanceof NotFoundError) return res.status(404).json({ error: error.message || "Not found" });
  if (error instanceof ConflictError) return res.status(409).json({ error: error.message || "Conflict" });
  if (error instanceof ValidationError) return res.status(400).json({ error: error.message || "Validation failed" });
  next(error);
});

export default router;
