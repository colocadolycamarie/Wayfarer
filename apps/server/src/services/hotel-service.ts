import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import {
  activityLog,
  db,
  folioLineItems,
  folios,
  guests,
  housekeepingTasks,
  maintenanceRequests,
  nightAuditRuns,
  properties,
  rateCalendar,
  ratePlans,
  reservations,
  roomTypes,
  rooms,
  type ActivityLogEntry,
  type Property,
} from "@workspace/db";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}
export class ValidationError extends Error {}

const ACTIVE_RESERVATION_STATUSES = ["confirmed", "pre_checked_in", "in_house"] as const;
const OCCUPYING_STATUSES = ["pre_checked_in", "in_house"] as const;
const DEFAULT_TAX_RATE_BPS_FALLBACK = 1200;

// ---------------------------------------------------------------------------
// Shared lookups & formatting
// ---------------------------------------------------------------------------

export async function getPropertyBySlug(slug: string): Promise<Property> {
  const [property] = await db.select().from(properties).where(eq(properties.slug, slug)).limit(1);
  if (!property) throw new NotFoundError(`Property "${slug}" not found`);
  return property;
}

function isoDate(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString().slice(0, 10);
}

function formatDateRange(checkIn: string, checkOut: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return `${formatter.format(new Date(checkIn))} \u2013 ${formatter.format(new Date(checkOut))}`;
}

function nightsBetween(checkIn: string | Date, checkOut: string | Date): number {
  const start = new Date(isoDate(checkIn)).getTime();
  const end = new Date(isoDate(checkOut)).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

function addDays(date: string, days: number): string {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

async function logActivity(
  propertyId: string,
  entry: Pick<ActivityLogEntry, "action" | "description" | "actor" | "tone">,
) {
  await db.insert(activityLog).values({ id: randomUUID(), propertyId, ...entry });
}

function toApiProperty(property: Property) {
  return {
    id: property.id,
    name: property.name,
    slug: property.slug,
    city: property.city,
    timezone: property.timezone,
    currency: property.currency,
    businessDate: property.businessDate,
  };
}

// ---------------------------------------------------------------------------
// Dashboard summary & activity
// ---------------------------------------------------------------------------

export async function getSummary(property: Property) {
  const [statusCounts] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      vacantClean: sql<number>`count(*) filter (where ${rooms.status} = 'vacant_clean')`.mapWith(Number),
      vacantDirty: sql<number>`count(*) filter (where ${rooms.status} = 'vacant_dirty')`.mapWith(Number),
      occupied: sql<number>`count(*) filter (where ${rooms.status} = 'occupied')`.mapWith(Number),
      inspected: sql<number>`count(*) filter (where ${rooms.status} = 'inspected')`.mapWith(Number),
      outOfOrder: sql<number>`count(*) filter (where ${rooms.status} = 'out_of_order')`.mapWith(Number),
    })
    .from(rooms)
    .where(eq(rooms.propertyId, property.id));

  const [inHouseRates] = await db
    .select({ avgNightlyRateCents: sql<number>`coalesce(avg(${reservations.nightlyRateCents}), 0)`.mapWith(Number) })
    .from(reservations)
    .where(and(eq(reservations.propertyId, property.id), eq(reservations.status, "in_house")));

  const [arrivalsRow] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(reservations)
    .where(
      and(
        eq(reservations.propertyId, property.id),
        eq(reservations.checkInDate, property.businessDate),
        eq(reservations.status, "confirmed"),
      ),
    );

  const [departuresRow] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(reservations)
    .where(
      and(
        eq(reservations.propertyId, property.id),
        eq(reservations.checkOutDate, property.businessDate),
        eq(reservations.status, "in_house"),
      ),
    );

  const [openBalanceRow] = await db
    .select({ total: sql<number>`coalesce(sum(${folios.balanceCents}), 0)`.mapWith(Number) })
    .from(folios)
    .innerJoin(reservations, eq(folios.reservationId, reservations.id))
    .where(and(eq(reservations.propertyId, property.id), eq(folios.status, "open")));

  const total = statusCounts?.total ?? 0;
  const occupied = statusCounts?.occupied ?? 0;
  const occupancyPercent = total > 0 ? Math.round((occupied / total) * 100) : 0;
  const adrCents = Math.round(inHouseRates?.avgNightlyRateCents ?? 0);
  const revparCents = Math.round(adrCents * (occupancyPercent / 100));

  return {
    property: toApiProperty(property),
    occupancyPercent,
    adrCents,
    revparCents,
    arrivals: arrivalsRow?.count ?? 0,
    departures: departuresRow?.count ?? 0,
    roomsToClean: statusCounts?.vacantDirty ?? 0,
    openBalanceCents: openBalanceRow?.total ?? 0,
    roomStatusCounts: {
      vacant_clean: statusCounts?.vacantClean ?? 0,
      vacant_dirty: statusCounts?.vacantDirty ?? 0,
      occupied,
      inspected: statusCounts?.inspected ?? 0,
      out_of_order: statusCounts?.outOfOrder ?? 0,
    },
  };
}

export async function listActivity(propertyId: string, limit = 20) {
  return db
    .select()
    .from(activityLog)
    .where(eq(activityLog.propertyId, propertyId))
    .orderBy(desc(activityLog.occurredAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

async function listRoomsQuery(propertyId: string) {
  const rows = await db
    .select({
      room: rooms,
      roomTypeName: roomTypes.name,
      reservationId: reservations.id,
      guestName: guests.name,
      checkInDate: reservations.checkInDate,
      checkOutDate: reservations.checkOutDate,
    })
    .from(rooms)
    .innerJoin(roomTypes, eq(rooms.roomTypeId, roomTypes.id))
    .leftJoin(
      reservations,
      and(eq(reservations.assignedRoomId, rooms.id), inArray(reservations.status, OCCUPYING_STATUSES)),
    )
    .leftJoin(guests, eq(reservations.guestId, guests.id))
    .where(eq(rooms.propertyId, propertyId))
    .orderBy(asc(rooms.floor), asc(rooms.number));

  return rows.map((row) => ({
    id: row.room.id,
    number: row.room.number,
    floor: row.room.floor,
    roomType: row.roomTypeName,
    roomTypeId: row.room.roomTypeId,
    status: row.room.status,
    reservationId: row.reservationId,
    guestName: row.guestName,
    stayDates: row.checkInDate && row.checkOutDate ? formatDateRange(row.checkInDate, row.checkOutDate) : null,
    notes: row.room.notes,
  }));
}

export async function listRooms(propertyId: string) {
  return listRoomsQuery(propertyId);
}

export async function updateRoomStatus(propertyId: string, roomId: string, status: string, note?: string) {
  const [room] = await db.select().from(rooms).where(and(eq(rooms.id, roomId), eq(rooms.propertyId, propertyId)));
  if (!room) throw new NotFoundError("Room not found");

  await db.update(rooms).set({ status, notes: note ?? null }).where(eq(rooms.id, roomId));

  await logActivity(propertyId, {
    action: "Room status updated",
    description: `Room ${room.number} marked ${status.replaceAll("_", " ")}`,
    actor: "Front desk",
    tone: "positive",
  });

  const rows = await listRoomsQuery(propertyId);
  const updated = rows.find((r) => r.id === roomId);
  if (!updated) throw new NotFoundError("Room not found");
  return updated;
}

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------

type ReservationRow = {
  reservation: typeof reservations.$inferSelect;
  guest: typeof guests.$inferSelect;
  roomTypeName: string;
  ratePlanName: string;
  assignedRoomNumber: string | null;
  folioId: string | null;
};async function queryReservations(where: ReturnType<typeof and>): Promise<ReservationRow[]> {
  return db
    .select({
      reservation: reservations,
      guest: guests,
      roomTypeName: roomTypes.name,
      ratePlanName: ratePlans.name,
      assignedRoomNumber: rooms.number,
      folioId: folios.id,
    })
    .from(reservations)
    .innerJoin(guests, eq(reservations.guestId, guests.id))
    .innerJoin(roomTypes, eq(reservations.roomTypeId, roomTypes.id))
    .innerJoin(ratePlans, eq(reservations.ratePlanId, ratePlans.id))
    .leftJoin(rooms, eq(reservations.assignedRoomId, rooms.id))
    .leftJoin(folios, eq(folios.reservationId, reservations.id))
    .where(where)
    .orderBy(desc(reservations.createdAt));
}

function toApiReservation(row: ReservationRow) {
  const { reservation, guest } = row;
  return {
    id: reservation.id,
    confirmationCode: reservation.confirmationCode,
    guest: {
      id: guest.id,
      name: guest.name,
      email: guest.email,
      phone: guest.phone,
      vip: guest.vip,
      stays: guest.stays,
      preferences: guest.preferences,
    },
    roomType: row.roomTypeName,
    roomTypeId: reservation.roomTypeId,
    assignedRoom: row.assignedRoomNumber,
    checkInDate: reservation.checkInDate,
    checkOutDate: reservation.checkOutDate,
    adults: reservation.adults,
    children: reservation.children,
    source: reservation.source,
    status: reservation.status,
    totalCents: reservation.totalCents,
    balanceCents: reservation.balanceCents,
    folioId: row.folioId,
    specialRequests: reservation.specialRequests,
  };
}

function toApiReservationDetail(row: ReservationRow) {
  return {
    ...toApiReservation(row),
    ratePlan: row.ratePlanName,
    nightlyRateCents: row.reservation.nightlyRateCents,
    taxCents: row.reservation.taxCents,
    createdAt: row.reservation.createdAt,
    notes: row.reservation.notes,
  };
}

export async function listReservations(
  propertyId: string,
  filters: { search?: string; status?: string; date?: string },
) {
  const conditions = [eq(reservations.propertyId, propertyId)];
  if (filters.status && filters.status !== "all") {
    conditions.push(eq(reservations.status, filters.status));
  }
  if (filters.date) {
    conditions.push(
      sql`(${reservations.checkInDate} = ${filters.date} or ${reservations.checkOutDate} = ${filters.date})`,
    );
  }
  if (filters.search) {
    const term = `%${filters.search.toLowerCase()}%`;
    conditions.push(
      sql`(lower(${guests.name}) like ${term} or lower(${reservations.confirmationCode}) like ${term} or lower(${rooms.number}) like ${term})`,
    );
  }

  const rows = await queryReservations(and(...conditions)!);
  return rows.map(toApiReservation);
}

async function getReservationRow(propertyId: string, reservationId: string): Promise<ReservationRow | undefined> {
  const [row] = await queryReservations(and(eq(reservations.propertyId, propertyId), eq(reservations.id, reservationId))!);
  return row;
}

export async function getReservationDetail(propertyId: string, reservationId: string) {
  const row = await getReservationRow(propertyId, reservationId);
  if (!row) throw new NotFoundError("Reservation not found");
  return toApiReservationDetail(row);
}

async function findOrCreateGuest(name: string, email: string, phone?: string) {
  const [existing] = await db.select().from(guests).where(sql`lower(${guests.email}) = lower(${email})`).limit(1);
  if (existing) {
    if (phone && phone !== existing.phone) {
      await db.update(guests).set({ phone }).where(eq(guests.id, existing.id));
    }
    return existing.id;
  }
  const id = randomUUID();
  await db.insert(guests).values({ id, name, email, phone: phone ?? null, vip: false, stays: 0, preferences: [] });
  return id;
}

async function countAvailableRooms(
  propertyId: string,
  roomTypeId: string,
  checkInDate: string,
  checkOutDate: string,
) {
  const [roomCount] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(rooms)
    .where(and(eq(rooms.propertyId, propertyId), eq(rooms.roomTypeId, roomTypeId), sql`${rooms.status} != 'out_of_order'`));

  const [overlapCount] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(reservations)
    .where(
      and(
        eq(reservations.propertyId, propertyId),
        eq(reservations.roomTypeId, roomTypeId),
        inArray(reservations.status, ACTIVE_RESERVATION_STATUSES),
        sql`${reservations.checkInDate} < ${checkOutDate}`,
        sql`${reservations.checkOutDate} > ${checkInDate}`,
      ),
    );

  return (roomCount?.count ?? 0) - (overlapCount?.count ?? 0);
}

async function resolveNightlyRateCents(
  roomType: typeof roomTypes.$inferSelect,
  ratePlanId: string,
  checkInDate: string,
  checkOutDate: string,
) {
  const [priced] = await db
    .select({ avgPriceCents: sql<number>`avg(${rateCalendar.priceCents})`.mapWith(Number) })
    .from(rateCalendar)
    .where(
      and(
        eq(rateCalendar.ratePlanId, ratePlanId),
        gte(rateCalendar.stayDate, checkInDate),
        lt(rateCalendar.stayDate, checkOutDate),
      ),
    );
  return priced?.avgPriceCents ? Math.round(priced.avgPriceCents) : roomType.baseRateCents;
}

interface ReservationInput {
  guestName: string;
  guestEmail: string;
  guestPhone?: string | undefined;
  roomTypeId: string;
  ratePlanId: string;
  assignedRoomId?: string | null | undefined;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  source: string;
  specialRequests?: string | undefined;
  idempotencyKey: string;
}

export async function createReservation(property: Property, input: ReservationInput, isPublic: boolean) {
  const [existing] = await db.select().from(reservations).where(eq(reservations.idempotencyKey, input.idempotencyKey));
  if (existing) {
    return {
      reservation: await getReservationDetail(property.id, existing.id),
      created: false,
      guestAccessToken: existing.guestAccessToken,
    };
  }

  const [roomType] = await db.select().from(roomTypes).where(eq(roomTypes.id, input.roomTypeId));
  if (!roomType) throw new ValidationError("Unknown room type");

  const { id: reservationId, guestAccessToken } = await db.transaction(async (tx) => {
    // Serializes concurrent booking attempts for the same room type so two
    // simultaneous requests (e.g. direct + an OTA webhook) can't both
    // succeed for the last available room.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${property.id + ":" + input.roomTypeId}))`);

    const available = await countAvailableRooms(property.id, input.roomTypeId, input.checkInDate, input.checkOutDate);
    if (available <= 0) {
      throw new ConflictError(`No ${roomType.name} rooms available for the selected dates`);
    }

    const guestId = await findOrCreateGuest(input.guestName, input.guestEmail, input.guestPhone);
    const nights = nightsBetween(input.checkInDate, input.checkOutDate);
    const nightlyRateCents = await resolveNightlyRateCents(roomType, input.ratePlanId, input.checkInDate, input.checkOutDate);
    const totalCents = nightlyRateCents * nights;
    const taxCents = Math.round(totalCents * (property.taxRateBps / 10_000));
    const balanceCents = totalCents + taxCents;
    const id = randomUUID();
    const guestAccessToken = isPublic ? randomUUID() : null;

    await tx.insert(reservations).values({
      id,
      propertyId: property.id,
      guestId,
      confirmationCode: `GH${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      roomTypeId: input.roomTypeId,
      ratePlanId: input.ratePlanId,
      assignedRoomId: input.assignedRoomId ?? null,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      adults: input.adults,
      children: input.children,
      source: input.source,
      status: "confirmed",
      nightlyRateCents,
      totalCents,
      taxCents,
      balanceCents,
      specialRequests: input.specialRequests ?? null,
      guestAccessToken,
      idempotencyKey: input.idempotencyKey,
    });

    await tx.insert(folios).values({ id: randomUUID(), reservationId: id, status: "open", balanceCents });

    return { id, guestAccessToken };
  });

  await logActivity(property.id, {
    action: "Reservation received",
    description: `${input.source === "direct" ? "Direct" : input.source.replace("ota_", "").replace("_", ".")} reservation for ${input.guestName}`,
    actor: isPublic ? "Booking engine" : "Front desk",
    tone: "neutral",
  });

  return { reservation: await getReservationDetail(property.id, reservationId), created: true, guestAccessToken };
}

export async function updateReservation(
  propertyId: string,
  reservationId: string,
  patch: {
    guestName?: string;
    guestEmail?: string;
    guestPhone?: string;
    checkInDate?: string;
    checkOutDate?: string;
    adults?: number;
    children?: number;
    specialRequests?: string;
  },
) {
  const row = await getReservationRow(propertyId, reservationId);
  if (!row) throw new NotFoundError("Reservation not found");

  if (patch.guestName || patch.guestEmail || patch.guestPhone) {
    await db
      .update(guests)
      .set({
        ...(patch.guestName ? { name: patch.guestName } : {}),
        ...(patch.guestEmail ? { email: patch.guestEmail } : {}),
        ...(patch.guestPhone ? { phone: patch.guestPhone } : {}),
      })
      .where(eq(guests.id, row.guest.id));
  }

  const checkInDate = patch.checkInDate ?? row.reservation.checkInDate;
  const checkOutDate = patch.checkOutDate ?? row.reservation.checkOutDate;
  const datesChanged = patch.checkInDate !== undefined || patch.checkOutDate !== undefined;

  const reservationUpdate: Partial<typeof reservations.$inferInsert> = {
    checkInDate,
    checkOutDate,
    ...(patch.adults !== undefined ? { adults: patch.adults } : {}),
    ...(patch.children !== undefined ? { children: patch.children } : {}),
    ...(patch.specialRequests !== undefined ? { specialRequests: patch.specialRequests } : {}),
  };

  if (datesChanged) {
    const nights = nightsBetween(checkInDate, checkOutDate);
    const totalCents = row.reservation.nightlyRateCents * nights;
    const taxCents = Math.round(totalCents * (DEFAULT_TAX_RATE_BPS_FALLBACK / 10_000));
    const balanceDelta = totalCents + taxCents - (row.reservation.totalCents + row.reservation.taxCents);
    reservationUpdate.totalCents = totalCents;
    reservationUpdate.taxCents = taxCents;
    reservationUpdate.balanceCents = row.reservation.balanceCents + balanceDelta;
    if (row.folioId) {
      await db
        .update(folios)
        .set({ balanceCents: sql`${folios.balanceCents} + ${balanceDelta}` })
        .where(eq(folios.id, row.folioId));
    }
  }

  await db.update(reservations).set(reservationUpdate).where(eq(reservations.id, reservationId));

  return getReservationDetail(propertyId, reservationId);
}

export async function cancelReservation(propertyId: string, reservationId: string, reason?: string) {
  const row = await getReservationRow(propertyId, reservationId);
  if (!row) throw new NotFoundError("Reservation not found");

  await db.update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, reservationId));
  await logActivity(propertyId, {
    action: "Reservation cancelled",
    description: `${row.guest.name}'s reservation ${row.reservation.confirmationCode} cancelled${reason ? `: ${reason}` : ""}`,
    actor: "Front desk",
    tone: "warning",
  });

  return getReservationDetail(propertyId, reservationId);
}

export async function checkInReservation(propertyId: string, reservationId: string, roomId: string, paymentMethod: string) {
  const row = await getReservationRow(propertyId, reservationId);
  if (!row) throw new NotFoundError("Reservation not found");
  if (row.reservation.status !== "confirmed" && row.reservation.status !== "pre_checked_in") {
    throw new ConflictError(`Cannot check in a reservation with status "${row.reservation.status}"`);
  }

  const [room] = await db.select().from(rooms).where(and(eq(rooms.id, roomId), eq(rooms.propertyId, propertyId)));
  if (!room) throw new NotFoundError("Room not found");
  if (room.status !== "vacant_clean" && room.status !== "inspected") {
    throw new ConflictError(`Room ${room.number} is not ready for check-in (status: ${room.status})`);
  }

  await db.update(reservations).set({ status: "in_house", assignedRoomId: roomId }).where(eq(reservations.id, reservationId));
  await db.update(rooms).set({ status: "occupied" }).where(eq(rooms.id, roomId));

  await logActivity(propertyId, {
    action: "Guest checked in",
    description: `${row.guest.name} checked into room ${room.number} (${paymentMethod.replaceAll("_", " ")} on file)`,
    actor: "Front desk",
    tone: "positive",
  });

  return getReservationDetail(propertyId, reservationId);
}

export async function checkOutReservation(
  propertyId: string,
  reservationId: string,
  paymentMethod: string,
  settleBalance: boolean,
) {
  const row = await getReservationRow(propertyId, reservationId);
  if (!row) throw new NotFoundError("Reservation not found");
  if (row.reservation.status !== "in_house") {
    throw new ConflictError(`Cannot check out a reservation with status "${row.reservation.status}"`);
  }

  await db.update(reservations).set({ status: "checked_out" }).where(eq(reservations.id, reservationId));

  if (row.reservation.assignedRoomId) {
    await db.update(rooms).set({ status: "vacant_dirty" }).where(eq(rooms.id, row.reservation.assignedRoomId));
    // Checkout always generates a cleaning task for the vacated room.
    await db.insert(housekeepingTasks).values({
      id: randomUUID(),
      propertyId,
      roomId: row.reservation.assignedRoomId,
      status: "dirty",
      priority: "checkout_today",
      estimatedMinutes: 30,
      guestNote: `Checked out ${new Date().toISOString().slice(0, 10)}`,
    });
  }

  let outstandingBalanceCents = row.reservation.balanceCents;
  if (settleBalance && row.folioId && outstandingBalanceCents > 0) {
    await db.insert(folioLineItems).values({
      id: randomUUID(),
      folioId: row.folioId,
      type: "payment",
      description: `${paymentMethod.replaceAll("_", " ")} settlement`,
      amountCents: -outstandingBalanceCents,
    });
    await db.update(folios).set({ balanceCents: 0, status: "closed" }).where(eq(folios.id, row.folioId));
    await db.update(reservations).set({ balanceCents: 0 }).where(eq(reservations.id, reservationId));
    outstandingBalanceCents = 0;
  }

  await db.update(guests).set({ stays: sql`${guests.stays} + 1` }).where(eq(guests.id, row.guest.id));

  await logActivity(propertyId, {
    action: "Guest checked out",
    description:
      outstandingBalanceCents === 0
        ? `${row.guest.name} checked out, balance settled`
        : `${row.guest.name} checked out with $${(outstandingBalanceCents / 100).toFixed(2)} outstanding`,
    actor: "Front desk",
    tone: outstandingBalanceCents === 0 ? "positive" : "warning",
  });

  return getReservationDetail(propertyId, reservationId);
}

export async function assignReservationRoom(propertyId: string, reservationId: string, roomId: string) {
  const row = await getReservationRow(propertyId, reservationId);
  if (!row) throw new NotFoundError("Reservation not found");
  const [room] = await db.select().from(rooms).where(and(eq(rooms.id, roomId), eq(rooms.propertyId, propertyId)));
  if (!room) throw new NotFoundError("Room not found");
  if (room.roomTypeId !== row.reservation.roomTypeId) {
    throw new ValidationError(`Room ${room.number} is not a ${row.roomTypeName} room`);
  }

  await db.update(reservations).set({ assignedRoomId: roomId }).where(eq(reservations.id, reservationId));
  return getReservationDetail(propertyId, reservationId);
}

// ---------------------------------------------------------------------------
// Folios
// ---------------------------------------------------------------------------

async function getFolioWithItems(folioId: string) {
  const [folio] = await db.select().from(folios).where(eq(folios.id, folioId));
  if (!folio) throw new NotFoundError("Folio not found");
  const items = await db.select().from(folioLineItems).where(eq(folioLineItems.folioId, folioId)).orderBy(asc(folioLineItems.postedAt));
  return { ...folio, items };
}

export async function getFolio(folioId: string) {
  return getFolioWithItems(folioId);
}

export async function postFolioCharge(folioId: string, type: string, description: string, amountCents: number) {
  const [folio] = await db.select().from(folios).where(eq(folios.id, folioId));
  if (!folio) throw new NotFoundError("Folio not found");

  await db.insert(folioLineItems).values({ id: randomUUID(), folioId, type, description, amountCents });
  await db.update(folios).set({ balanceCents: sql`${folios.balanceCents} + ${amountCents}` }).where(eq(folios.id, folioId));
  await db.update(reservations).set({ balanceCents: sql`${reservations.balanceCents} + ${amountCents}` }).where(eq(reservations.id, folio.reservationId));

  return getFolioWithItems(folioId);
}

export async function postFolioPayment(folioId: string, method: string, amountCents: number) {
  const [folio] = await db.select().from(folios).where(eq(folios.id, folioId));
  if (!folio) throw new NotFoundError("Folio not found");

  await db.insert(folioLineItems).values({
    id: randomUUID(),
    folioId,
    type: "payment",
    description: `${method.replaceAll("_", " ")} payment`,
    amountCents: -amountCents,
  });
  const nextBalance = Math.max(0, folio.balanceCents - amountCents);
  await db.update(folios).set({ balanceCents: nextBalance }).where(eq(folios.id, folioId));
  await db.update(reservations).set({ balanceCents: nextBalance }).where(eq(reservations.id, folio.reservationId));

  return getFolioWithItems(folioId);
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

async function listHousekeepingTasksQuery(propertyId: string, status?: string) {
  const conditions = [eq(housekeepingTasks.propertyId, propertyId)];
  if (status && status !== "all") conditions.push(eq(housekeepingTasks.status, status));

  const rows = await db
    .select({ task: housekeepingTasks, roomNumber: rooms.number, roomTypeName: roomTypes.name })
    .from(housekeepingTasks)
    .innerJoin(rooms, eq(housekeepingTasks.roomId, rooms.id))
    .innerJoin(roomTypes, eq(rooms.roomTypeId, roomTypes.id))
    .where(and(...conditions))
    .orderBy(desc(housekeepingTasks.updatedAt));

  return rows.map((row) => ({
    id: row.task.id,
    roomId: row.task.roomId,
    roomNumber: row.roomNumber,
    roomType: row.roomTypeName,
    status: row.task.status,
    priority: row.task.priority,
    assignedTo: row.task.assignedTo,
    estimatedMinutes: row.task.estimatedMinutes,
    guestNote: row.task.guestNote,
    updatedAt: row.task.updatedAt,
  }));
}

export async function listHousekeepingTasks(propertyId: string, status?: string) {
  return listHousekeepingTasksQuery(propertyId, status);
}

export async function updateHousekeepingTaskStatus(propertyId: string, taskId: string, status: string, issue?: string) {
  const [task] = await db.select().from(housekeepingTasks).where(and(eq(housekeepingTasks.id, taskId), eq(housekeepingTasks.propertyId, propertyId)));
  if (!task) throw new NotFoundError("Task not found");

  await db.update(housekeepingTasks).set({ status, updatedAt: new Date() }).where(eq(housekeepingTasks.id, taskId));

  const roomStatusByTaskStatus: Record<string, string | undefined> = {
    ready: "vacant_clean",
    dirty: "vacant_dirty",
    inspected: "inspected",
  };
  const nextRoomStatus = roomStatusByTaskStatus[status];
  if (nextRoomStatus) {
    await db.update(rooms).set({ status: nextRoomStatus }).where(eq(rooms.id, task.roomId));
  }

  if (issue) {
    await db.insert(maintenanceRequests).values({
      id: randomUUID(),
      propertyId,
      roomId: task.roomId,
      description: issue,
      priority: "medium",
      status: "open",
    });
  }

  const rows = await listHousekeepingTasksQuery(propertyId);
  const updated = rows.find((t) => t.id === taskId);
  if (!updated) throw new NotFoundError("Task not found");
  return updated;
}

export async function assignHousekeepingTask(propertyId: string, taskId: string, userId: string) {
  const [task] = await db.select().from(housekeepingTasks).where(and(eq(housekeepingTasks.id, taskId), eq(housekeepingTasks.propertyId, propertyId)));
  if (!task) throw new NotFoundError("Task not found");

  await db.update(housekeepingTasks).set({ assignedTo: userId, updatedAt: new Date() }).where(eq(housekeepingTasks.id, taskId));
  const rows = await listHousekeepingTasksQuery(propertyId);
  const updated = rows.find((t) => t.id === taskId);
  if (!updated) throw new NotFoundError("Task not found");
  return updated;
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

function toApiMaintenanceRequest(row: { request: typeof maintenanceRequests.$inferSelect; roomNumber: string | null }) {
  return {
    id: row.request.id,
    roomNumber: row.roomNumber,
    description: row.request.description,
    priority: row.request.priority,
    status: row.request.status,
    assignedTo: row.request.assignedTo,
    createdAt: row.request.createdAt,
  };
}

export async function listMaintenanceRequests(propertyId: string) {
  const rows = await db
    .select({ request: maintenanceRequests, roomNumber: rooms.number })
    .from(maintenanceRequests)
    .leftJoin(rooms, eq(maintenanceRequests.roomId, rooms.id))
    .where(eq(maintenanceRequests.propertyId, propertyId))
    .orderBy(desc(maintenanceRequests.createdAt));

  return rows.map(toApiMaintenanceRequest);
}

export async function createMaintenanceRequest(
  propertyId: string,
  roomId: string | null | undefined,
  description: string,
  priority: string,
) {
  const id = randomUUID();
  await db.insert(maintenanceRequests).values({ id, propertyId, roomId: roomId ?? null, description, priority, status: "open" });

  const [row] = await db
    .select({ request: maintenanceRequests, roomNumber: rooms.number })
    .from(maintenanceRequests)
    .leftJoin(rooms, eq(maintenanceRequests.roomId, rooms.id))
    .where(eq(maintenanceRequests.id, id));
  if (!row) throw new NotFoundError("Maintenance request not found");

  return toApiMaintenanceRequest(row);
}

// ---------------------------------------------------------------------------
// Rates & inventory
// ---------------------------------------------------------------------------

export async function getRateCalendar(property: Property, startDate: string, days: number) {
  const plans = await db
    .select({ plan: ratePlans, roomType: roomTypes })
    .from(ratePlans)
    .innerJoin(roomTypes, eq(ratePlans.roomTypeId, roomTypes.id))
    .where(eq(ratePlans.propertyId, property.id))
    .orderBy(asc(roomTypes.sortOrder));

  const endDate = addDays(startDate, days);
  const overrides = await db
    .select()
    .from(rateCalendar)
    .where(and(eq(rateCalendar.propertyId, property.id), gte(rateCalendar.stayDate, startDate), lt(rateCalendar.stayDate, endDate)));

  const dates = Array.from({ length: days }, (_, index) => addDays(startDate, index));

  return Promise.all(
    plans.map(async ({ plan, roomType }) => {
      const availableByDate = new Map<string, number>();
      await Promise.all(
        dates.map(async (date) => {
          const available = await countAvailableRooms(property.id, roomType.id, date, addDays(date, 1));
          availableByDate.set(date, Math.max(0, available));
        }),
      );

      return {
        roomTypeId: roomType.id,
        roomType: roomType.name,
        ratePlanId: plan.id,
        ratePlan: plan.name,
        dates: dates.map((date) => {
          const override = overrides.find((row) => row.ratePlanId === plan.id && row.stayDate === date);
          return {
            date,
            priceCents: override?.priceCents ?? roomType.baseRateCents,
            available: availableByDate.get(date) ?? 0,
            isClosed: override?.isClosed ?? false,
          };
        }),
      };
    }),
  );
}

export async function bulkUpdateRates(
  property: Property,
  input: { roomTypeId: string; ratePlanId: string; startDate: string; endDate: string; priceCents?: number; isClosed?: boolean },
) {
  const [roomType] = await db.select().from(roomTypes).where(eq(roomTypes.id, input.roomTypeId));
  if (!roomType) throw new NotFoundError("Room type not found");

  let cursor = input.startDate;
  while (cursor < input.endDate) {
    await db
      .insert(rateCalendar)
      .values({
        id: randomUUID(),
        propertyId: property.id,
        roomTypeId: input.roomTypeId,
        ratePlanId: input.ratePlanId,
        stayDate: cursor,
        priceCents: input.priceCents ?? roomType.baseRateCents,
        availableRooms: 0,
        isClosed: input.isClosed ?? false,
      })
      .onConflictDoUpdate({
        target: [rateCalendar.ratePlanId, rateCalendar.stayDate],
        set: {
          ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
          ...(input.isClosed !== undefined ? { isClosed: input.isClosed } : {}),
        },
      });
    cursor = addDays(cursor, 1);
  }

  await logActivity(property.id, {
    action: "Rates updated",
    description: `${roomType.name} rates updated for ${input.startDate} \u2013 ${input.endDate}`,
    actor: "Revenue manager",
    tone: "neutral",
  });

  return getRateCalendar(property, property.businessDate, 14);
}

// ---------------------------------------------------------------------------
// Night audit
// ---------------------------------------------------------------------------

export async function listNightAuditRuns(propertyId: string) {
  return db.select().from(nightAuditRuns).where(eq(nightAuditRuns.propertyId, propertyId)).orderBy(desc(nightAuditRuns.businessDate));
}

export async function runNightAudit(property: Property) {
  const startedAt = new Date();

  const inHouse = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.propertyId, property.id), eq(reservations.status, "in_house")));

  let taxesPostedCents = 0;
  for (const reservation of inHouse) {
    const [folio] = await db.select().from(folios).where(eq(folios.reservationId, reservation.id));
    if (!folio) continue;
    const taxCents = Math.round(reservation.nightlyRateCents * (property.taxRateBps / 10_000));
    taxesPostedCents += taxCents;
    await db.insert(folioLineItems).values([
      { id: randomUUID(), folioId: folio.id, type: "room_charge", description: `Room charge \u00b7 ${property.businessDate}`, amountCents: reservation.nightlyRateCents },
      { id: randomUUID(), folioId: folio.id, type: "tax", description: "Occupancy tax", amountCents: taxCents },
    ]);
    const chargeTotal = reservation.nightlyRateCents + taxCents;
    await db.update(folios).set({ balanceCents: sql`${folios.balanceCents} + ${chargeTotal}` }).where(eq(folios.id, folio.id));
    await db.update(reservations).set({ balanceCents: sql`${reservations.balanceCents} + ${chargeTotal}` }).where(eq(reservations.id, reservation.id));
  }

  const noShows = await db
    .update(reservations)
    .set({ status: "no_show" })
    .where(and(eq(reservations.propertyId, property.id), eq(reservations.status, "confirmed"), eq(reservations.checkInDate, property.businessDate)))
    .returning({ id: reservations.id });

  const [paymentsRow] = await db
    .select({ total: sql<number>`coalesce(sum(-${folioLineItems.amountCents}), 0)`.mapWith(Number) })
    .from(folioLineItems)
    .innerJoin(folios, eq(folioLineItems.folioId, folios.id))
    .innerJoin(reservations, eq(folios.reservationId, reservations.id))
    .where(
      and(
        eq(reservations.propertyId, property.id),
        eq(folioLineItems.type, "payment"),
        gte(folioLineItems.postedAt, new Date(`${property.businessDate}T00:00:00.000Z`)),
      ),
    );

  const summary = await getSummary(property);
  const nextBusinessDate = addDays(property.businessDate, 1);
  await db.update(properties).set({ businessDate: nextBusinessDate }).where(eq(properties.id, property.id));

  const runId = randomUUID();
  const completedAt = new Date();
  await db.insert(nightAuditRuns).values({
    id: runId,
    propertyId: property.id,
    businessDate: property.businessDate,
    status: "completed",
    roomsCharged: inHouse.length,
    taxesPostedCents,
    paymentsReconciledCents: paymentsRow?.total ?? 0,
    noShowsFlagged: noShows.length,
    occupancyPercent: summary.occupancyPercent,
    adrCents: summary.adrCents,
    revparCents: summary.revparCents,
    startedAt,
    completedAt,
  });

  await logActivity(property.id, {
    action: "Night audit completed",
    description: `Business date rolled from ${property.businessDate} to ${nextBusinessDate}`,
    actor: "Night audit",
    tone: "positive",
  });

  const [run] = await db.select().from(nightAuditRuns).where(eq(nightAuditRuns.id, runId));
  return run!;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

export async function getOccupancyReport(property: Property, range: string) {
  const days = RANGE_DAYS[range] ?? 30;
  const since = addDays(property.businessDate, -days);

  const series = await db
    .select()
    .from(nightAuditRuns)
    .where(and(eq(nightAuditRuns.propertyId, property.id), gte(nightAuditRuns.businessDate, since)))
    .orderBy(asc(nightAuditRuns.businessDate));

  const summary = await getSummary(property);

  return {
    range,
    targetPercent: property.occupancyTargetPercent,
    currentPercent: summary.occupancyPercent,
    adrCents: summary.adrCents,
    revparCents: summary.revparCents,
    series: series.map((run) => ({
      date: run.businessDate,
      occupancyPercent: run.occupancyPercent,
      adrCents: run.adrCents,
      revparCents: run.revparCents,
    })),
  };
}

export async function getRevenueReport(property: Property) {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const channelRows = await db
    .select({
      channel: reservations.source,
      total: sql<number>`coalesce(sum(${folioLineItems.amountCents}), 0)`.mapWith(Number),
    })
    .from(folioLineItems)
    .innerJoin(folios, eq(folioLineItems.folioId, folios.id))
    .innerJoin(reservations, eq(folios.reservationId, reservations.id))
    .where(and(eq(reservations.propertyId, property.id), eq(folioLineItems.type, "room_charge"), gte(folioLineItems.postedAt, since)))
    .groupBy(reservations.source);

  const totalCents = channelRows.reduce((sum, row) => sum + row.total, 0);

  const dailyRows = await db
    .select({
      date: sql<string>`date(${folioLineItems.postedAt})`,
      total: sql<number>`coalesce(sum(${folioLineItems.amountCents}), 0)`.mapWith(Number),
    })
    .from(folioLineItems)
    .innerJoin(folios, eq(folioLineItems.folioId, folios.id))
    .innerJoin(reservations, eq(folios.reservationId, reservations.id))
    .where(and(eq(reservations.propertyId, property.id), eq(folioLineItems.type, "room_charge"), gte(folioLineItems.postedAt, since)))
    .groupBy(sql`date(${folioLineItems.postedAt})`)
    .orderBy(sql`date(${folioLineItems.postedAt})`);

  return {
    totalCents,
    channels: channelRows.map((row) => ({
      channel: row.channel,
      amountCents: row.total,
      percent: totalCents > 0 ? Math.round((row.total / totalCents) * 100) : 0,
    })),
    daily: dailyRows.map((row) => ({ date: row.date, amountCents: row.total })),
  };
}

// ---------------------------------------------------------------------------
// Public booking
// ---------------------------------------------------------------------------

export async function getPublicAvailability(property: Property, checkInDate: string, checkOutDate: string, guestCount: number) {
  const types = await db
    .select()
    .from(roomTypes)
    .where(and(eq(roomTypes.propertyId, property.id), gte(roomTypes.maxOccupancy, guestCount)))
    .orderBy(asc(roomTypes.sortOrder));

  const nights = nightsBetween(checkInDate, checkOutDate);
  const results = await Promise.all(
    types.map(async (roomType) => {
      const [plan] = await db.select().from(ratePlans).where(eq(ratePlans.roomTypeId, roomType.id)).limit(1);
      if (!plan) return null;

      const available = await countAvailableRooms(property.id, roomType.id, checkInDate, checkOutDate);
      if (available <= 0) return null;

      const nightlyRateCents = await resolveNightlyRateCents(roomType, plan.id, checkInDate, checkOutDate);
      return {
        roomTypeId: roomType.id,
        name: roomType.name,
        description: roomType.description,
        amenities: roomType.amenities,
        maxOccupancy: roomType.maxOccupancy,
        availableRooms: available,
        nightlyRateCents,
        totalCents: nightlyRateCents * nights,
        ratePlanId: plan.id,
        ratePlanName: plan.name,
      };
    }),
  );

  return results.filter((result): result is NonNullable<typeof result> => result !== null);
}
