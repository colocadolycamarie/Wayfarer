import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const properties = pgTable("wayfarer_properties", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  city: text("city").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  currency: text("currency").notNull().default("USD"),
  /** Occupancy tax rate, in basis points (1200 = 12%). */
  taxRateBps: integer("tax_rate_bps").notNull().default(1200),
  /** Management's occupancy goal, shown as a benchmark on the occupancy report. */
  occupancyTargetPercent: integer("occupancy_target_percent").notNull().default(75),
  /** The property's current operating day; advanced by the night audit. */
  businessDate: date("business_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const guests = pgTable("wayfarer_guests", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  vip: boolean("vip").notNull().default(false),
  stays: integer("stays").notNull().default(0),
  preferences: jsonb("preferences").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A sellable room category for a property (e.g. "Harbor King"). */
export const roomTypes = pgTable("wayfarer_room_types", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull().references(() => properties.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  amenities: jsonb("amenities").$type<string[]>().notNull().default([]),
  maxOccupancy: integer("max_occupancy").notNull().default(2),
  baseRateCents: integer("base_rate_cents").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** A priced, bookable plan against a room type (e.g. "Best Available", "Flexible"). */
export const ratePlans = pgTable("wayfarer_rate_plans", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull().references(() => properties.id),
  roomTypeId: text("room_type_id").notNull().references(() => roomTypes.id),
  name: text("name").notNull(),
  refundable: boolean("refundable").notNull().default(true),
});

export const rooms = pgTable(
  "wayfarer_rooms",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull().references(() => properties.id),
    roomTypeId: text("room_type_id").notNull().references(() => roomTypes.id),
    number: text("number").notNull(),
    floor: integer("floor").notNull(),
    status: text("status").notNull().default("vacant_clean"),
    notes: text("notes"),
  },
  (table) => [unique().on(table.propertyId, table.number)],
);

export const reservations = pgTable("wayfarer_reservations", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull().references(() => properties.id),
  guestId: text("guest_id").notNull().references(() => guests.id),
  confirmationCode: text("confirmation_code").notNull().unique(),
  roomTypeId: text("room_type_id").notNull().references(() => roomTypes.id),
  ratePlanId: text("rate_plan_id").notNull().references(() => ratePlans.id),
  assignedRoomId: text("assigned_room_id").references(() => rooms.id),
  checkInDate: date("check_in_date").notNull(),
  checkOutDate: date("check_out_date").notNull(),
  adults: integer("adults").notNull().default(1),
  children: integer("children").notNull().default(0),
  source: text("source").notNull().default("direct"),
  status: text("status").notNull().default("confirmed"),
  nightlyRateCents: integer("nightly_rate_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  taxCents: integer("tax_cents").notNull().default(0),
  balanceCents: integer("balance_cents").notNull(),
  specialRequests: text("special_requests"),
  /** Front-of-house operational notes, distinct from the guest's own special requests. */
  notes: jsonb("notes").$type<string[]>().notNull().default([]),
  /** Set for reservations made through the public booking page; used for guest self-service. */
  guestAccessToken: text("guest_access_token").unique(),
  /** Client-supplied key so retried booking requests don't create duplicate reservations. */
  idempotencyKey: text("idempotency_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const folios = pgTable("wayfarer_folios", {
  id: text("id").primaryKey(),
  reservationId: text("reservation_id").notNull().unique().references(() => reservations.id),
  status: text("status").notNull().default("open"),
  balanceCents: integer("balance_cents").notNull().default(0),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
});

export const folioLineItems = pgTable("wayfarer_folio_line_items", {
  id: text("id").primaryKey(),
  folioId: text("folio_id").notNull().references(() => folios.id),
  postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
});

export const housekeepingTasks = pgTable("wayfarer_housekeeping_tasks", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull().references(() => properties.id),
  roomId: text("room_id").notNull().references(() => rooms.id),
  status: text("status").notNull().default("dirty"),
  priority: text("priority").notNull().default("standard"),
  assignedTo: text("assigned_to"),
  estimatedMinutes: integer("estimated_minutes").notNull().default(30),
  guestNote: text("guest_note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const maintenanceRequests = pgTable("wayfarer_maintenance_requests", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull().references(() => properties.id),
  roomId: text("room_id").references(() => rooms.id),
  description: text("description").notNull(),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  assignedTo: text("assigned_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rateCalendar = pgTable(
  "wayfarer_rate_calendar",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull().references(() => properties.id),
    roomTypeId: text("room_type_id").notNull().references(() => roomTypes.id),
    ratePlanId: text("rate_plan_id").notNull().references(() => ratePlans.id),
    stayDate: date("stay_date").notNull(),
    priceCents: integer("price_cents").notNull(),
    availableRooms: integer("available_rooms").notNull(),
    isClosed: boolean("is_closed").notNull().default(false),
  },
  (table) => [unique().on(table.ratePlanId, table.stayDate)],
);

export const nightAuditRuns = pgTable("wayfarer_night_audit_runs", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull().references(() => properties.id),
  businessDate: date("business_date").notNull(),
  status: text("status").notNull().default("completed"),
  roomsCharged: integer("rooms_charged").notNull().default(0),
  taxesPostedCents: integer("taxes_posted_cents").notNull().default(0),
  paymentsReconciledCents: integer("payments_reconciled_cents").notNull().default(0),
  noShowsFlagged: integer("no_shows_flagged").notNull().default(0),
  /** KPI snapshot taken at audit time, so the occupancy report can show real history. */
  occupancyPercent: integer("occupancy_percent").notNull().default(0),
  adrCents: integer("adr_cents").notNull().default(0),
  revparCents: integer("revpar_cents").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/** An append-only feed of notable operational events, shown on the front-desk dashboard. */
export const activityLog = pgTable("wayfarer_activity_log", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull().references(() => properties.id),
  action: text("action").notNull(),
  description: text("description").notNull(),
  actor: text("actor").notNull(),
  tone: text("tone").notNull().default("neutral"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPropertySchema = createInsertSchema(properties);
export const insertGuestSchema = createInsertSchema(guests);
export const insertRoomTypeSchema = createInsertSchema(roomTypes);
export const insertRatePlanSchema = createInsertSchema(ratePlans);
export const insertRoomSchema = createInsertSchema(rooms);
export const insertReservationSchema = createInsertSchema(reservations);
export const insertFolioSchema = createInsertSchema(folios);
export const insertFolioLineItemSchema = createInsertSchema(folioLineItems);
export const insertHousekeepingTaskSchema = createInsertSchema(housekeepingTasks);
export const insertMaintenanceRequestSchema = createInsertSchema(maintenanceRequests);
export const insertRateCalendarSchema = createInsertSchema(rateCalendar);
export const insertNightAuditRunSchema = createInsertSchema(nightAuditRuns);
export const insertActivityLogSchema = createInsertSchema(activityLog);

export type Property = typeof properties.$inferSelect;
export type Guest = typeof guests.$inferSelect;
export type RoomType = typeof roomTypes.$inferSelect;
export type RatePlan = typeof ratePlans.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type Folio = typeof folios.$inferSelect;
export type FolioLineItem = typeof folioLineItems.$inferSelect;
export type HousekeepingTask = typeof housekeepingTasks.$inferSelect;
export type MaintenanceRequest = typeof maintenanceRequests.$inferSelect;
export type RateCalendarEntry = typeof rateCalendar.$inferSelect;
export type NightAuditRun = typeof nightAuditRuns.$inferSelect;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
