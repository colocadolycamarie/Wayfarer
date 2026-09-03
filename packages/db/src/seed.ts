/**
 * Populates a fresh database with one demo property so the app has
 * something to show on first run. Safe to re-run: it upserts the property
 * and skips seeding rooms/reservations if the property already has any.
 *
 * Usage: pnpm --filter @workspace/db run seed
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "./index.js";
import {
  folioLineItems,
  folios,
  guests,
  properties,
  ratePlans,
  reservations,
  roomTypes,
  rooms,
} from "./schema/hotel";

const PROPERTY_ID = "prop-grand-harbor";

async function seed() {
  const [property] = await db
    .insert(properties)
    .values({
      id: PROPERTY_ID,
      name: "Grand Harbor Hotel",
      slug: "grand-harbor",
      city: "Boston, MA",
      timezone: "America/New_York",
      currency: "USD",
      taxRateBps: 1200,
      businessDate: new Date().toISOString().slice(0, 10),
    })
    .onConflictDoNothing({ target: properties.slug })
    .returning();

  const existingRoomCount = await db.$count(rooms, eq(rooms.propertyId, PROPERTY_ID));
  if (!property || existingRoomCount > 0) {
    console.log("Seed skipped: property already has rooms.");
    await pool.end();
    return;
  }

  const roomTypeSeeds = [
    {
      id: "king",
      name: "Harbor King",
      description: "A quiet king room with harbor-side light and a generous work desk.",
      amenities: ["King bed", "Harbor view", "Rain shower"],
      maxOccupancy: 2,
      baseRateCents: 31200,
      sortOrder: 0,
    },
    {
      id: "queen",
      name: "City Queen",
      description: "A bright, efficient room designed for easy city stays.",
      amenities: ["Queen bed", "Walk-in shower", "Fast Wi-Fi"],
      maxOccupancy: 2,
      baseRateCents: 27000,
      sortOrder: 1,
    },
    {
      id: "suite",
      name: "Harbor Suite",
      description: "A separate living room, a deep soaking tub, and a view across the water.",
      amenities: ["King bed", "Living room", "Soaking tub"],
      maxOccupancy: 4,
      baseRateCents: 62000,
      sortOrder: 2,
    },
  ];
  await db.insert(roomTypes).values(roomTypeSeeds.map((type) => ({ ...type, propertyId: PROPERTY_ID })));

  const ratePlanSeeds = [
    { id: "king-best", roomTypeId: "king", name: "Best Available", refundable: true },
    { id: "queen-best", roomTypeId: "queen", name: "Best Available", refundable: true },
    { id: "suite-flex", roomTypeId: "suite", name: "Harbor Suite Flexible", refundable: true },
  ];
  await db.insert(ratePlans).values(ratePlanSeeds.map((plan) => ({ ...plan, propertyId: PROPERTY_ID })));

  const roomSeeds = [
    { number: "101", floor: 1, roomTypeId: "king", status: "occupied" },
    { number: "102", floor: 1, roomTypeId: "king", status: "vacant_clean" },
    { number: "103", floor: 1, roomTypeId: "king", status: "vacant_dirty", notes: "Checkout at 11:00" },
    { number: "104", floor: 1, roomTypeId: "queen", status: "inspected" },
    { number: "201", floor: 2, roomTypeId: "king", status: "occupied" },
    { number: "202", floor: 2, roomTypeId: "queen", status: "vacant_clean" },
    { number: "203", floor: 2, roomTypeId: "queen", status: "out_of_order", notes: "HVAC repair \u00b7 return in 4 days" },
    { number: "204", floor: 2, roomTypeId: "queen", status: "vacant_clean" },
    { number: "301", floor: 3, roomTypeId: "suite", status: "occupied", notes: "Anniversary" },
    { number: "302", floor: 3, roomTypeId: "suite", status: "vacant_clean" },
    { number: "303", floor: 3, roomTypeId: "king", status: "vacant_dirty", notes: "Early checkout" },
    { number: "304", floor: 3, roomTypeId: "king", status: "vacant_clean" },
  ] as const;
  const insertedRooms = await db
    .insert(rooms)
    .values(roomSeeds.map((room) => ({ id: randomUUID(), propertyId: PROPERTY_ID, ...room })))
    .returning();
  const roomByNumber = new Map(insertedRooms.map((room) => [room.number, room]));

  const guestSeeds = [
    { id: randomUUID(), name: "Sofia Alvarez", email: "sofia.alvarez@example.com", phone: "+1 617 555 0184", vip: true, stays: 6, preferences: ["High floor", "Still water"] },
    { id: randomUUID(), name: "Marcus Chen", email: "marcus.chen@example.com", phone: "+1 617 555 0132", vip: false, stays: 2, preferences: ["Late arrival"] },
    { id: randomUUID(), name: "Elena Rossi", email: "elena.rossi@example.com", phone: "+39 02 555 0129", vip: false, stays: 1, preferences: ["Quiet room"] },
  ];
  await db.insert(guests).values(guestSeeds);

  const today = new Date();
  const isoDaysFromNow = (offset: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    return date.toISOString().slice(0, 10);
  };

  const reservationSeeds = [
    { guest: guestSeeds[0]!, roomTypeId: "king", ratePlanId: "king-best", room: "101", checkIn: -2, checkOut: 2, status: "in_house", nightlyRateCents: 31200, specialRequests: "High floor if possible" },
    { guest: guestSeeds[1]!, roomTypeId: "king", ratePlanId: "king-best", room: "201", checkIn: -1, checkOut: 1, status: "in_house", nightlyRateCents: 31200, specialRequests: "Late arrival after 22:00" },
    { guest: guestSeeds[2]!, roomTypeId: "suite", ratePlanId: "suite-flex", room: "301", checkIn: 0, checkOut: 3, status: "confirmed", nightlyRateCents: 62000, specialRequests: "Anniversary setup" },
  ];

  for (const seedReservation of reservationSeeds) {
    const nights = seedReservation.checkOut - seedReservation.checkIn;
    const totalCents = seedReservation.nightlyRateCents * nights;
    const taxCents = Math.round(totalCents * 0.12);
    const room = roomByNumber.get(seedReservation.room);
    const reservationId = randomUUID();
    const balanceCents = seedReservation.status === "in_house" ? 0 : totalCents + taxCents;

    await db.insert(reservations).values({
      id: reservationId,
      propertyId: PROPERTY_ID,
      guestId: seedReservation.guest.id,
      confirmationCode: `GH${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      roomTypeId: seedReservation.roomTypeId,
      ratePlanId: seedReservation.ratePlanId,
      assignedRoomId: seedReservation.status === "in_house" ? room?.id : null,
      checkInDate: isoDaysFromNow(seedReservation.checkIn),
      checkOutDate: isoDaysFromNow(seedReservation.checkOut),
      adults: 2,
      children: 0,
      source: "direct",
      status: seedReservation.status,
      nightlyRateCents: seedReservation.nightlyRateCents,
      totalCents,
      taxCents,
      balanceCents,
      specialRequests: seedReservation.specialRequests,
    });

    const folioId = randomUUID();
    await db.insert(folios).values({
      id: folioId,
      reservationId,
      status: "open",
      balanceCents,
    });

    if (seedReservation.status === "in_house") {
      await db.insert(folioLineItems).values([
        { id: randomUUID(), folioId, type: "room_charge", description: "Room charge", amountCents: totalCents },
        { id: randomUUID(), folioId, type: "tax", description: "Occupancy tax", amountCents: taxCents },
        { id: randomUUID(), folioId, type: "payment", description: "Card settlement", amountCents: -(totalCents + taxCents) },
      ]);
    }
  }

  console.log("Seed complete: Grand Harbor Hotel with 12 rooms and 3 reservations.");
  await pool.end();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
