# Wayfarer — Hotel Property Management System (PMS)
## Master System Specification / Build Prompt

**Purpose of this document:** a complete, implementation-ready specification for a real, fully working application — not a prototype. Every screen, table, endpoint, and workflow below is expected to be functional end-to-end: checking in a guest actually assigns a real room and opens a real folio, posting a restaurant charge actually adds a real line item to that folio, closing out the night actually runs a real audit that rolls the business date forward, and a rate change actually pushes to connected OTAs through a real channel-manager sync. It deploys with no placeholder steps.

Product name used throughout: **Wayfarer**. Rename freely.

---

## 1. Product Vision

Wayfarer is the system of record a hotel (independent property or small multi-property group) runs on day to day: reservations, front-desk operations, housekeeping, rates/inventory distribution to booking channels, guest billing, and the reporting a general manager needs to run the business. It replaces the common failure mode of running a property off a spreadsheet-plus-whiteboard-plus-three-disconnected-OTA-extranets, where a room can get double-booked because Booking.com and the front desk don't actually share real-time availability.

**Primary users:** front-desk agents (check-in/out, folio, walk-ins), reservations agents (bookings, group blocks, guest communication), housekeeping staff and supervisors (room status, task assignment), the night auditor (end-of-day close), revenue/GM staff (rates, inventory, reporting), and guests (booking engine, pre-arrival check-in, optional guest portal).

**Non-goals:** Wayfarer is not itself an OTA or a payment processor — it connects to booking channels (Booking.com, Expedia, Airbnb) via a channel-manager integration and to a payment processor (Stripe) for card handling, rather than replacing either. It is not a full point-of-sale system for an on-site restaurant/spa (it receives charges *from* one via integration, posted to the guest folio) and not a revenue-management/pricing-optimization AI product in v1 — rate-setting is manual/rule-based, with an optimization layer as a plausible later phase.

**Design mandate:** this must read as hospitality software built by people who understand a real front desk under real pressure (a line of guests, a phone ringing, a room that isn't actually clean yet) — calm, precise, and fast to act on, not a generic admin template and not an over-designed "boutique hotel brand" marketing site wearing a dashboard's clothes. The guest-facing booking engine can carry warmth and brand personality; the operational screens (front desk, housekeeping board, night audit) are dense, fast, and unambiguous — legibility and speed of action win over decoration every time on those screens.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14 (App Router)**, TypeScript strict | Server components for dense operational views (room grid, folio, housekeeping board), route handlers double as the API |
| UI primitives | **shadcn/ui** (Radix-based, copied in) + Tailwind | Full control to build an operations-grade interface rather than a generic admin theme |
| Styling | Tailwind with a custom token config (§4) | |
| Booking/room grid | **Custom timeline component** (React + CSS grid, virtualized for large room counts/date ranges) — the room × date availability grid is the single most important UI surface in the product and is purpose-built, not a repurposed generic calendar library | Off-the-shelf calendar libraries don't natively support the room-row/date-column drag-to-book interaction pattern a PMS needs |
| Charts | **Recharts** for trend lines (occupancy/ADR/RevPAR), **custom SVG heatmap** for the housekeeping/occupancy calendar view, bullet/gauge for KPI-vs-target | Matches per-chart-type guidance in §4.4 |
| Database | **PostgreSQL** via **Neon** (serverless, branch-per-env) or self-hosted Postgres for larger multi-property groups with specific hosting requirements | Strong relational integrity is non-negotiable for reservations/inventory — double-booking a room is the cardinal sin of this product category, and that's a consistency problem, not an eventual-consistency-tolerant one |
| ORM | **Drizzle ORM** | Typed SQL, explicit reviewable migrations, and critically: transactional guarantees around reservation creation and inventory decrement |
| Concurrency control | **Postgres row-level locking / serializable transactions** on room-night inventory writes, wrapped in a dedicated `lib/inventory/hold-and-book.ts` module | Two simultaneous booking attempts (direct + OTA webhook arriving at once) for the last room of a type must never both succeed — this is the product's most important correctness guarantee |
| Auth | **Auth.js (NextAuth v5)**, JWT session, optional SSO for larger groups | |
| Payments | **Stripe** (card authorization at booking, capture/incremental charges at check-in/during stay, refunds at checkout) | PCI scope minimized by using Stripe's hosted card capture rather than handling raw card data directly |
| Channel management | Adapter layer for a **channel-manager API** (e.g., SiteMinder, or a direct OTA-connect provider) syncing rates/availability out and reservations in, with webhook ingestion for OTA-originated bookings | Wayfarer is the operational hub, not a reimplementation of every OTA's own extranet — a channel-manager layer is the realistic integration point most properties already rely on |
| Background/scheduled jobs | **Inngest** | Night audit run, pre-arrival guest messaging, housekeeping task generation on checkout, channel-sync retries, no-show processing |
| Real-time | **Pusher** (or Supabase Realtime) for the housekeeping board and front-desk room-status grid, so a room marked clean shows up instantly for the next agent without a manual refresh | |
| Caching / rate limiting | **Upstash Redis** | Availability-check caching, idempotency keys on reservation/payment-creating actions, channel-webhook dedupe |
| Email/SMS | **Resend** (confirmations, pre-arrival, receipts) + **Twilio** (optional SMS for arrival day) | |
| Document generation | Server-rendered PDF for folios/invoices and registration cards | |
| Validation | **Zod**, shared client/server | |
| Testing | **Vitest**, **Playwright** (including concurrency/race-condition tests on booking), Testing Library | |
| Observability | **Sentry**, **Axiom**, Vercel Observability | |
| Deployment | **Vercel** | |

---

## 3. User Roles & Property Model

Wayfarer is multi-tenant at the **Organization** (hotel company, one property or a small group) level, with **Properties** nested inside. Most roles are property-scoped; a small group's owner/GM role can span properties.

| Role | Scope | Can do |
|---|---|---|
| **Front Desk Agent** | Assigned property | Search/create reservations, check guests in/out, assign/change rooms, view and post charges to folios, take payments, handle walk-ins |
| **Reservations Agent** | Assigned property (or org-wide for a group with a central reservations team) | Create/modify/cancel reservations, manage group blocks, send guest communications, view availability/rates (not edit rates unless also Revenue role) |
| **Housekeeping Staff** | Assigned property | View assigned room tasks, update room status (dirty/clean/inspected/out-of-order), log maintenance issues |
| **Housekeeping Supervisor** | Assigned property | Everything Housekeeping Staff can, plus: assign tasks to staff, inspect/approve rooms, manage out-of-order rooms |
| **Night Auditor** | Assigned property | Run the night-audit close process, post room/tax charges, reconcile daily totals, everything a Front Desk Agent can do (night audit is typically a front-desk-adjacent role on a real property) |
| **Revenue Manager** | Assigned property (or org-wide) | Manage rate plans, pricing calendars, inventory allocation, channel-manager configuration, view revenue reporting |
| **General Manager / Owner** | One or more properties | Everything above at their assigned properties, plus staff/role management, full reporting, billing |
| **Corporate Admin** | Org (all properties, multi-property groups) | Cross-property reporting and configuration, property management, org-level billing |
| **Guest** | Own reservation(s) | Book, view/modify their own reservation within policy, complete online pre-arrival check-in, view their own folio during/after stay |
| **Platform Admin** | Cross-org (internal only) | Support tooling, system health, plan management — not exposed to customers |

---

## 4. UI/UX Design System

Generated and validated against a UI pattern database for "hotel property management system, front desk booking reservation hospitality, elegant refined," tuned at variance 5/10 (balanced), motion 4/10 (standard), density 7/10 (dense — this is an operations tool for most of its surface area, with one genuinely guest-facing exception).

### 4.1 Visual identity direction
Base color/brand direction: **luxury navy + gold service** register (from the pattern database's hospitality-appropriate palette), applied with restraint — gold is a precision accent, never a background or a decorative fill. Typography deliberately blends two database recommendations rather than taking either wholesale: a warm display serif for brand/guest-facing moments (booking engine, confirmation emails, guest portal) paired with a highly legible, dense-friendly sans for every operational screen — because a hotel's *brand* should feel elegant, but a front-desk agent checking in a guest with a line forming needs speed and clarity, not small-caps serif labels on a room-status grid.

**What to deliberately avoid** (per the pattern database's explicit anti-patterns for this category, plus the operational-tool risk list): poor/generic stock photography standing in for the property's actual rooms, an overly complex booking flow (the database flags this explicitly — every unnecessary step in the guest booking engine costs conversions), applying the guest-facing decorative register to operational screens (a small-caps serif room-status board would be a real usability failure, not just an aesthetic one), and — as with the rest of this product family — generic card-grid dashboards standing in for genuinely different workflows (a reservation calendar, a folio, and a housekeeping board are not the same kind of screen and shouldn't share one template).

### 4.2 Color tokens

| Role | Token | Hex |
|---|---|---|
| Primary | `--color-primary` | `#1E3A8A` (deep navy) |
| On Primary | `--color-on-primary` | `#FFFFFF` |
| Secondary | `--color-secondary` | `#3B82F6` |
| Accent / CTA (gold, precision use only) | `--color-accent` | `#A16207` |
| Background (light default) | `--color-background` | `#F8FAFC` |
| Foreground | `--color-foreground` | `#1E293B` |
| Muted surface | `--color-muted` | `#E9EEF5` |
| Border | `--color-border` | `#E2E8F0` |
| Destructive / out-of-order / overdue | `--color-destructive` | `#DC2626` |
| Focus ring | `--color-ring` | `#1E3A8A` |

Dark mode (useful for night-audit/overnight shifts specifically): background `#0B1220`, surface `#141B2B`, border `#26314A`, foreground `#E2E8F0` — same primary/accent/destructive hues, contrast-checked 4.5:1 minimum. Light mode is the default everywhere else.

**Room/task status color vocabulary (fixed, used identically on the front-desk grid and housekeeping board — this consistency is what lets an agent and a housekeeper communicate through the system instead of over radio):**
| Status | Color |
|---|---|
| Vacant / Clean / Ready | green `#16A34A` |
| Occupied | blue `#1E3A8A` |
| Dirty / Needs Cleaning | amber `#D97706` |
| Inspected | teal `#0D9488` |
| Out of Order / Maintenance | red `#DC2626` |
| Reserved / Arriving Today | gold `#A16207` accent border on an otherwise neutral cell |

Never repurpose these colors decoratively elsewhere in the operational UI — they are a shared operational vocabulary, not a palette.

### 4.3 Typography

- **Guest-facing brand moments (booking engine hero/headings, confirmation emails, guest portal headers):** **Calistoga** — a warm display serif that carries hospitality character without the lower legibility of a small-caps treatment; used sparingly, at headline sizes only.
- **All operational UI (front desk, reservations, housekeeping, night audit, reporting) and all guest-facing body/form text:** **Inter** — chosen deliberately over the more decorative options for this category specifically because operational screens are used under time pressure; legibility at small sizes and density wins here.
- **Data labels (folio line items, room numbers, rate codes):** Inter with tabular-figure numerals for column alignment in dense tables (folio, reservation list, rate grid).

```css
@import url('https://fonts.googleapis.com/css2?family=Calistoga&family=Inter:wght@400;500;600;700&display=swap');
```

Scale: guest-facing hero 36–42px (Calistoga); operational screen headers 20–24px (Inter Semibold); dense table rows 14px, never below 12px for any value; body 16px at 1.5 line-height.

### 4.4 Data visualization rules

| Use case | Chart | Library | Notes |
|---|---|---|---|
| Room × date availability/occupancy grid | Custom timeline/heatmap grid (the product's core surface, not a generic chart) | Custom React/CSS grid, virtualized | Each cell shows a numeric/status value directly, never relies on hover alone; color per the status vocabulary in §4.2 |
| Occupancy % by day-of-week × week (pattern analysis) | Calendar/grid heatmap | Custom SVG / D3 | Per accessibility guidance: numeric value on hover, downloadable grid table with row/column labels as the fallback; fewer than ~20 cells falls back to a simple bar view instead |
| ADR / RevPAR / occupancy trend over time | Line/area chart | Recharts | Multiple metrics as separate toggleable series, distinguished by line style as well as color, capped at a readable number of series (avoid plotting ADR, RevPAR, and occupancy % together on one axis — split by metric type or use small multiples) |
| Occupancy or budget attainment vs. target | Gauge or bullet chart | Custom SVG | Numeric value + % of target always shown as visible text, never color-position-only, per accessibility guidance |
| Revenue by segment (OTA channel, direct, group, corporate) | Horizontal bar or 100% stacked bar | Recharts | Value labels visible; segment count kept small (channel count is naturally limited, so this stays legible without a "top N" rollup in most cases) |

Every chart: visible legend, "view as table" toggle, fixed-height skeleton-loading container, respects `prefers-reduced-motion`. The core room-grid/timeline component additionally gets its own dedicated accessibility treatment (see §4.7) since it is the product's primary interactive surface, not a supplementary visualization.

### 4.5 Motion

Standard tier, 300–450ms, `back.out(1.4)` stagger reserved **only** for the guest-facing booking engine's room/rate-card reveal (where a touch of polish suits a conversion-focused, marketing-adjacent surface) — explicitly **not** used on the room grid, folio, or housekeeping board, where the pattern database's own guidance against overshoot on dense/informational UI applies directly; those surfaces use quick `power2.out`, 150–250ms transitions for status changes (a room flipping from dirty to clean, a folio line item posting) so state changes register clearly without feeling sluggish or overly decorative. All motion respects `prefers-reduced-motion`.

### 4.6 Layout — every page has its own structure

- **Front Desk Home (Room Grid/Rack):** the room × date timeline as the dominant, full-width surface, with a compact arrivals/departures rail alongside it — this is the screen an agent lives in all shift, so it prioritizes at-a-glance status over anything else.
- **Reservation Detail:** a structured document-like layout (guest info, stay dates, rate, folio summary, notes) rather than a card grid — the reservation is a record being reviewed/edited, not a dashboard widget.
- **Check-In / Check-Out flow:** a short, guided, step-indicated sequence (verify details → payment/ID → room assignment/key → confirm) — front-desk speed matters, so this is optimized for minimal clicks under real guest-facing time pressure, distinct from the reservation-editing layout.
- **Folio:** a ledger-style itemized table (date, description, charge, credit, running balance) — deliberately spreadsheet/statement-like, since a folio is fundamentally a financial document a guest may review line by line at checkout.
- **Housekeeping Board:** a Kanban-style board (Dirty / In Progress / Inspected / Clean) with room cards, touch-friendly for tablet use by housekeeping staff walking the property — distinct from the front-desk's grid view of the same underlying room-status data, because the two roles think about rooms differently (front desk thinks in dates, housekeeping thinks in task state).
- **Night Audit:** a guided, checklist-driven flow (verify charges → post room/tax → reconcile payments → run reports → roll date) with an explicit step indicator, since this is a once-daily, high-stakes, must-not-be-skipped process.
- **Rate & Inventory Management (Revenue):** a workspace layout — rate-plan list on the left, a calendar-grid rate/availability editor on the right (bulk-edit by date range) — a planning tool, not a dashboard.
- **Reporting (GM/Corporate):** the one screen in the product with a traditional KPI-strip-plus-charts dashboard layout, reserved specifically for the audience that actually wants an overview rather than a workflow.
- **Guest Booking Engine (public):** a warm, conversion-focused, guest-facing flow — search → room/rate selection → guest details → payment → confirmation — kept deliberately simple per the pattern database's explicit "avoid complex booking" guidance, in visual contrast to every operational screen in the product.

### 4.7 Accessibility & interaction baseline (non-negotiable)
Contrast ≥4.5:1; interactive targets ≥44×44px with ≥8px spacing (housekeeping board specifically designed for tablet/touch use, so this is enforced there as a floor, not an aspiration); every icon-only action (room-status quick-toggle icons, especially) has an `aria-label`; visible focus states across every operational screen, with the room-grid/timeline component specifically supporting keyboard navigation (arrow-key cell movement, Enter to open a reservation) since it's the product's primary surface and must not be mouse/touch-only; loading feedback within 100ms; skeletons not blank space; responsive with no horizontal page scroll at 375/768/1024/1440 (the room grid's own horizontal date-scrolling is an intentional, contained exception, clearly affordanced with visible scroll controls, not a page-level scroll).

---

## 5. Information Architecture / Sitemap

```
/                                      → marketing/landing (public)
/pricing                               → public
/login, /forgot-password
/onboarding                            → org + first property setup → room types/rooms → rate plans → channel connections → invite staff

/book/[propertySlug]                   → public guest booking engine
/book/[propertySlug]/rooms
/book/[propertySlug]/checkout
/book/[propertySlug]/confirmation/[reservationId]
/guest/[reservationToken]              → guest portal: pre-arrival check-in, view/modify reservation, view folio

/app/[propertySlug]/                   → front desk home (room grid/rack)
/app/[propertySlug]/reservations
/app/[propertySlug]/reservations/new
/app/[propertySlug]/reservations/[id]
/app/[propertySlug]/reservations/[id]/check-in
/app/[propertySlug]/reservations/[id]/check-out
/app/[propertySlug]/folios/[id]
/app/[propertySlug]/guests
/app/[propertySlug]/guests/[id]
/app/[propertySlug]/housekeeping
/app/[propertySlug]/maintenance
/app/[propertySlug]/night-audit
/app/[propertySlug]/rates                  → rate plans + calendar editor
/app/[propertySlug]/inventory              → room-type allocation
/app/[propertySlug]/channels               → OTA/channel-manager connections & mappings
/app/[propertySlug]/reports
/app/[propertySlug]/reports/occupancy
/app/[propertySlug]/reports/revenue
/app/[propertySlug]/reports/housekeeping
/app/[propertySlug]/settings/general
/app/[propertySlug]/settings/room-types-rooms
/app/[propertySlug]/settings/members
/app/[propertySlug]/settings/integrations
/app/[propertySlug]/settings/billing
/app/[propertySlug]/settings/audit-log

/corporate/[orgSlug]/                  → cross-property dashboard (multi-property groups)
/corporate/[orgSlug]/properties
/corporate/[orgSlug]/reports

/admin/*                               → internal platform-admin tooling
```

---

## 6. Core Features by Module

### 6.1 Onboarding
- Org + first property setup (name, address, timezone, currency, tax configuration).
- Room types and individual rooms setup (room number, floor, room-type assignment, max occupancy, amenities), CSV import supported.
- Rate plans (base rates by room type, cancellation policy, inclusions) and initial availability calendar.
- Channel-manager connection (OTA credentials) with an initial rate/availability push, and a clear "test booking" verification step before going live to avoid accidental overbooking on day one.
- Staff invite with role + property assignment.

### 6.2 Reservations
- Search availability by date range/room type/guest count across the room grid.
- Create a reservation (direct, phone, walk-in) with guest details, rate plan, room-type (or specific room) assignment, deposit/payment collection per the rate plan's policy.
- Group/block bookings: reserve a block of rooms under one group record with individual guest assignment as details firm up.
- Modify/cancel with policy-aware fee calculation (per the rate plan's cancellation terms).
- OTA-originated reservations ingested via channel-manager webhook, appearing identically to direct bookings in the room grid (single source of truth — this is the core value proposition).

### 6.3 Front Desk / Check-In / Check-Out
- Arrivals/departures list for the day, with quick-access check-in/check-out actions.
- Check-in: verify guest details/ID, confirm or reassign room, authorize/capture payment per policy, generate a digital or printable registration card and room key data (integration point for a key-card system, out of scope for core PMS logic but the room-assignment event is the trigger point).
- Walk-in booking (create-and-check-in in one flow) for guests without an existing reservation.
- Check-out: review folio, settle balance (charge remaining balance, process refund/adjustment if needed), close the folio, trigger a housekeeping "dirty" task for the vacated room automatically.
- Room moves/upgrades mid-stay, with rate adjustment and folio impact handled explicitly (never silently).

### 6.4 Folio & Billing
- Itemized ledger per reservation (room charges posted nightly by the audit process, plus manual charges: minibar, restaurant POS integration, parking, incidentals).
- Split billing support (e.g., room charged to a company account, incidentals to the guest's personal card).
- Payment capture via Stripe (card-present or card-not-present depending on front-desk hardware), refunds, and folio PDF export/print for the guest.

### 6.5 Housekeeping
- Kanban board (§4.6) per property, auto-populated with "needs cleaning" tasks on checkout and departure-day rooms.
- Supervisor task assignment to specific staff, staff-side simple status updates (start/complete/flag issue).
- Inspection step (supervisor marks a cleaned room "Inspected" before it returns to bookable "Ready" status) — a real quality-control step many properties require.
- Out-of-order room marking (removes a room from bookable inventory with a reason and expected return date), which correctly reduces available inventory in both the room grid and the channel-manager sync.

### 6.6 Maintenance
- Lightweight work-order log (room or property-area, issue description, priority, assigned staff, status), linked to the out-of-order room-status flow where relevant.

### 6.7 Rates & Inventory (Revenue Management)
- Rate-plan authoring (base rate by room type, day-of-week/seasonal overrides, minimum-stay rules, cancellation policy).
- Calendar-grid bulk rate/availability editor (select a date range × room type, apply a rate or close/open availability).
- Inventory allocation across channels (e.g., reserve a certain number of rooms for direct booking vs. released to OTAs) where a property wants that control.

### 6.8 Channel Management
- OTA connection setup and health monitoring (sync status, last successful push, error alerts on failed syncs — a silent channel-sync failure is a serious overbooking risk, so this is surfaced prominently, not buried in settings).
- Rate/availability changes made in Wayfarer push out automatically; OTA-originated bookings ingest automatically via webhook with idempotent processing (a webhook retry must never create a duplicate reservation).
- Room-type mapping between Wayfarer's internal room types and each channel's own room-type identifiers.

### 6.9 Guest Profiles / Light CRM
- Guest history across stays (for repeat-guest recognition), preferences/notes, communication log, marketing-opt-in status.
- Guest portal: pre-arrival online check-in (reduces front-desk friction on arrival day), reservation self-service within policy, folio view during/after stay.

### 6.10 Night Audit
- Guided end-of-day process (§4.6): verify all charges for the business day are posted, post room + tax charges for all occupied rooms, reconcile payment totals against expected, flag no-shows for processing (charge per policy, release the room), generate the day's key reports, and roll the business date forward.
- Once run, the prior business date's core financial records are locked from further direct edit (adjustments after audit close go through an explicit, logged correction process, not a silent edit) — a standard and important hotel-accounting control.

### 6.11 Reporting
- Occupancy %, ADR, RevPAR trends; revenue by channel/segment; housekeeping turnover time; arrivals/departures forecasting — all per §4.4 chart guidance, all exportable.
- Cross-property comparison for multi-property groups via the corporate dashboard.

### 6.12 Settings & Administration
- Room types/rooms, rate plans, staff/roles, channel connections, billing, audit log (every rate change, reservation modification/cancellation, folio adjustment, and night-audit run logged immutably).

### 6.13 Platform Admin (internal)
- Org/property list, plan management, channel-integration health across all customers, support tooling.

---

## 7. Key Workflows

**Booking a reservation (direct or OTA) — the core correctness-critical loop**
1. A booking attempt (guest via the booking engine, agent via the front desk, or an OTA webhook) requests specific room-type/date-range availability.
2. The system acquires a row-level lock (or runs within a serializable transaction) on the relevant room-night inventory records, checks remaining availability, and only on success creates the reservation and decrements availability — all as one atomic operation. A second simultaneous request for the same last-available room-night correctly fails with a clear "no longer available" response rather than both succeeding.
3. Confirmation is sent to the guest (Resend/Twilio); if OTA-originated, an acknowledgment is sent back through the channel-manager webhook contract.
4. Updated availability propagates to all connected OTAs via the channel-manager sync (near-real-time, with retry/backoff and an alert on repeated failure).

**Check-in → stay → check-out**
1. On arrival day, the front-desk agent (or the guest via pre-arrival online check-in) confirms details and completes check-in; a specific room is assigned (or confirmed if pre-assigned), reservation status becomes `In House`, and the room's status becomes `Occupied`.
2. Charges accrue on the folio through the stay (nightly room charge posted by the audit process, plus any manual/POS-integrated charges).
3. At check-out, the agent reviews and settles the folio; reservation status becomes `Checked Out`; the room's status becomes `Dirty`, automatically generating a housekeeping task.
4. Housekeeping cleans and a supervisor inspects, moving the room through `Dirty → In Progress → Inspected → Ready`, at which point it's bookable again for a same-day arrival if the schedule allows.

**Night audit**
1. At the property's configured audit time (or manually triggered by the night auditor), the guided flow in §6.10 runs.
2. Room and tax charges are posted for every currently-occupied reservation; no-show reservations (never checked in, past their arrival date) are flagged for the auditor to process per the property's no-show policy (charge a fee, release the room).
3. Once reconciliation is confirmed, the business date rolls forward; the prior date's financial records lock, with any needed correction going through an explicit, audit-logged adjustment path rather than a silent edit.

**Channel-manager rate/availability sync failure**
1. A scheduled or event-triggered push to a connected OTA fails (network error, credential expiry, mapping mismatch).
2. Inngest retries with backoff; on repeated failure, the channel connection's status flips to `Error` and a prominent alert surfaces to Revenue/GM roles in the app (and via email) — because an unnoticed sync failure is a direct overbooking risk, this alert path is treated as high-priority, not a routine background-job failure notice.

**Guest pre-arrival online check-in**
1. Guest receives a pre-arrival email/SMS with a link to `/guest/[reservationToken]`.
2. Guest confirms/updates details, may pre-authorize payment, and completes any required forms.
3. On arrival, the front-desk agent sees the reservation flagged as pre-checked-in, reducing the in-person check-in flow to a quick room-assignment/key-issuance step.

---

## 8. Database Schema

Relational, Postgres via Drizzle. Core tables below (add `created_at`/`updated_at` to every table as standard).

```
organizations
  id (pk, uuid)
  name
  slug (unique)
  plan (enum: single_property, multi_property)

properties
  id (pk)
  organization_id (fk, indexed)
  name
  slug (unique)
  address
  timezone
  currency
  business_date              -- the property's current operational date, advanced by night audit

users
  id (pk)
  organization_id (fk, indexed)
  email (unique)
  name
  password_hash (nullable)
  role (enum: front_desk, reservations, housekeeping_staff, housekeeping_supervisor, night_auditor, revenue_manager, general_manager, corporate_admin)

user_property_assignments
  id (pk)
  user_id (fk)
  property_id (fk)
  UNIQUE(user_id, property_id)

room_types
  id (pk)
  property_id (fk, indexed)
  name
  max_occupancy
  base_amenities (jsonb array)

rooms
  id (pk)
  property_id (fk, indexed)
  room_type_id (fk)
  room_number
  floor
  status (enum: vacant_clean, vacant_dirty, occupied, inspected, out_of_order)
  UNIQUE(property_id, room_number)

rate_plans
  id (pk)
  property_id (fk, indexed)
  room_type_id (fk)
  name
  cancellation_policy_json
  min_stay_nights (nullable)
  is_active (bool)

rate_calendar_entries               -- per room_type/rate_plan/date pricing + availability control
  id (pk)
  rate_plan_id (fk, indexed)
  date (indexed)
  price_cents
  is_closed (bool)                  -- manually closed to sale regardless of inventory
  UNIQUE(rate_plan_id, date)

room_type_inventory                 -- per room_type/date available-count tracking, source of truth for the hold-and-book lock
  id (pk)
  room_type_id (fk, indexed)
  date (indexed)
  total_rooms
  rooms_held                        -- pending, unconfirmed holds (e.g. during a multi-step booking flow)
  rooms_booked
  UNIQUE(room_type_id, date)

guests
  id (pk)
  organization_id (fk)
  name, email, phone
  preferences_json
  marketing_opt_in (bool)

reservations
  id (pk)
  property_id (fk, indexed)
  guest_id (fk guests)
  room_type_id (fk)
  rate_plan_id (fk)
  assigned_room_id (fk rooms, nullable)
  source (enum: direct, ota_booking_com, ota_expedia, ota_airbnb, phone, walk_in)
  external_reservation_id (nullable, unique per source — OTA dedupe key)
  status (enum: confirmed, pre_checked_in, in_house, checked_out, cancelled, no_show)
  check_in_date, check_out_date
  adults, children
  guest_token (unique — for the /guest/ portal link)
  group_block_id (fk group_blocks, nullable)

group_blocks
  id (pk)
  property_id (fk)
  name
  organizer_guest_id (fk guests, nullable)
  starts_on, ends_on

folios
  id (pk)
  reservation_id (fk, unique, indexed)
  status (enum: open, closed)
  balance_cents

folio_line_items
  id (pk)
  folio_id (fk, indexed)
  type (enum: room_charge, tax, pos_charge, adjustment, payment, refund)
  description
  amount_cents                      -- positive = charge, negative = payment/credit
  posted_at
  posted_by (fk users, nullable)    -- nullable for system-posted room charges

payments
  id (pk)
  folio_id (fk, indexed)
  stripe_payment_intent_id (nullable)
  amount_cents
  status (enum: authorized, captured, refunded, failed)

housekeeping_tasks
  id (pk)
  property_id (fk, indexed)
  room_id (fk)
  status (enum: dirty, in_progress, inspected, ready)
  assigned_to (fk users, nullable)
  triggered_by (enum: checkout, manual, scheduled)
  completed_at (nullable)
  inspected_by (fk users, nullable)

maintenance_requests
  id (pk)
  property_id (fk, indexed)
  room_id (fk, nullable)
  description
  priority (enum: low, medium, high)
  status (enum: open, in_progress, resolved)
  assigned_to (fk users, nullable)

channel_connections
  id (pk)
  property_id (fk)
  provider (enum: booking_com, expedia, airbnb, channel_manager_aggregator)
  credentials_encrypted
  status (enum: active, error, disconnected)
  last_synced_at

channel_room_type_mappings
  id (pk)
  channel_connection_id (fk)
  room_type_id (fk)
  external_room_type_id

night_audit_runs
  id (pk)
  property_id (fk, indexed)
  business_date
  run_by (fk users)
  status (enum: in_progress, completed)
  started_at, completed_at

audit_logs
  id (pk)
  organization_id (fk, indexed)
  actor_user_id (fk users, nullable)
  action
  target_type, target_id
  metadata_json
  created_at

subscriptions
  id (pk)
  organization_id (fk, unique)
  stripe_customer_id, stripe_subscription_id
  plan, status
  current_period_end
```

**Access isolation:** every query scoped by `organization_id`/`property_id` from the session, with property-scoped roles filtered by `user_property_assignments`. **Inventory correctness:** all writes to `room_type_inventory` and reservation creation happen inside a single serializable transaction per booking attempt — this is the one place in the schema where transactional discipline is treated as a hard product requirement, not an implementation detail.

---

## 9. API Architecture

Next.js Route Handlers under `app/api/`, REST-shaped, Zod-validated. Booking-path routes are transactional and idempotent (channel webhooks especially).

```
POST   /api/auth/[...nextauth]
POST   /api/organizations
GET    /api/organizations/:id

GET    /api/orgs/:orgId/properties
POST   /api/orgs/:orgId/properties
GET    /api/orgs/:orgId/properties/:id

GET    /api/properties/:propId/room-types
POST   /api/properties/:propId/room-types
GET    /api/properties/:propId/rooms
POST   /api/properties/:propId/rooms
PATCH  /api/properties/:propId/rooms/:id/status

GET    /api/properties/:propId/rate-plans
POST   /api/properties/:propId/rate-plans
GET    /api/properties/:propId/rate-calendar
POST   /api/properties/:propId/rate-calendar/bulk-update

GET    /api/properties/:propId/availability?checkIn=&checkOut=&roomTypeId=
POST   /api/properties/:propId/reservations                 -- transactional hold-and-book, idempotent by client key
GET    /api/properties/:propId/reservations
GET    /api/properties/:propId/reservations/:id
PATCH  /api/properties/:propId/reservations/:id
POST   /api/properties/:propId/reservations/:id/cancel
POST   /api/properties/:propId/reservations/:id/check-in
POST   /api/properties/:propId/reservations/:id/check-out
POST   /api/properties/:propId/reservations/:id/assign-room

GET    /api/properties/:propId/folios/:id
POST   /api/properties/:propId/folios/:id/charges
POST   /api/properties/:propId/folios/:id/payments
POST   /api/properties/:propId/folios/:id/refunds

GET    /api/properties/:propId/housekeeping/tasks
POST   /api/properties/:propId/housekeeping/tasks/:id/status
POST   /api/properties/:propId/housekeeping/tasks/:id/assign

GET    /api/properties/:propId/maintenance
POST   /api/properties/:propId/maintenance

POST   /api/properties/:propId/night-audit/run
GET    /api/properties/:propId/night-audit/history

GET    /api/properties/:propId/channels
POST   /api/properties/:propId/channels/:provider/connect
POST   /api/properties/:propId/channels/:id/room-type-mapping

GET    /api/properties/:propId/reports/occupancy
GET    /api/properties/:propId/reports/revenue
GET    /api/properties/:propId/reports/housekeeping

GET    /api/orgs/:orgId/audit-log
GET    /api/corporate/:orgId/reports

GET    /api/book/:propertySlug/availability          -- public booking-engine read
POST   /api/book/:propertySlug/reservations           -- public booking-engine write (same transactional path as internal booking)
GET    /api/guest/:token/reservation
POST   /api/guest/:token/pre-checkin

POST   /api/webhooks/channel-manager                  -- OTA-originated reservations, idempotent by external_reservation_id
POST   /api/webhooks/stripe

POST   /api/cron/pre-arrival-messaging
POST   /api/cron/channel-sync-retry
POST   /api/cron/no-show-flagging
```

Cross-cutting middleware: session validation → org/property resolution → role/property-assignment check → scoped Drizzle client. The reservation-creation path (`POST /reservations`, internal and public alike, and the channel webhook) always routes through the same single `hold-and-book` transactional function — there is deliberately no second code path that could bypass the concurrency-safe booking logic.

---

## 10. File / Folder Structure

```
wayfarer/
├── app/
│   ├── (marketing)/{page.tsx, pricing/page.tsx}
│   ├── (auth)/{login,forgot-password}/page.tsx
│   ├── onboarding/page.tsx
│   ├── book/
│   │   └── [propertySlug]/
│   │       ├── page.tsx
│   │       ├── rooms/page.tsx
│   │       ├── checkout/page.tsx
│   │       └── confirmation/[reservationId]/page.tsx
│   ├── guest/[token]/page.tsx
│   ├── app/
│   │   └── [propertySlug]/
│   │       ├── layout.tsx                     # role-aware nav
│   │       ├── page.tsx                        # front desk / room grid
│   │       ├── reservations/{page.tsx, new/page.tsx, [id]/page.tsx, [id]/check-in/page.tsx, [id]/check-out/page.tsx}
│   │       ├── folios/[id]/page.tsx
│   │       ├── guests/{page.tsx, [id]/page.tsx}
│   │       ├── housekeeping/page.tsx
│   │       ├── maintenance/page.tsx
│   │       ├── night-audit/page.tsx
│   │       ├── rates/page.tsx
│   │       ├── inventory/page.tsx
│   │       ├── channels/page.tsx
│   │       ├── reports/{page.tsx, occupancy/page.tsx, revenue/page.tsx, housekeeping/page.tsx}
│   │       └── settings/{general,room-types-rooms,members,integrations,billing,audit-log}/page.tsx
│   ├── corporate/[orgSlug]/{page.tsx, properties/page.tsx, reports/page.tsx}
│   ├── admin/...
│   └── api/                                    # mirrors §9
├── components/
│   ├── ui/                                     # shadcn primitives at §4 tokens
│   ├── room-grid/                              # RoomTimelineGrid, ReservationBar, DragToBook
│   ├── folio/                                  # FolioLedgerTable, ChargeForm
│   ├── housekeeping/                           # KanbanBoard, RoomTaskCard
│   ├── night-audit/                            # AuditStepFlow
│   ├── booking-engine/                         # guest-facing components, warmer visual register
│   └── charts/                                 # OccupancyTrend, RevPARTrend, ChannelRevenueBar, OccupancyHeatmap
├── lib/
│   ├── db/{schema.ts, client.ts, queries/}     # Drizzle schema (§8), org/property-scoped queries
│   ├── inventory/
│   │   ├── hold-and-book.ts                    # THE transactional booking function, single code path
│   │   └── availability.ts
│   ├── night-audit/{run-audit.ts}
│   ├── auth/{config.ts, rbac.ts}
│   ├── integrations/{stripe.ts, channel-manager.ts, twilio.ts}
│   ├── inngest/{client.ts, functions/}         # pre-arrival messaging, channel-sync retry, no-show flagging
│   ├── realtime/                               # Pusher helpers for room-status/housekeeping live updates
│   ├── validation/
│   └── utils/
├── drizzle/
├── emails/
├── tests/
│   ├── unit
│   ├── integration
│   └── e2e                                     # includes explicit concurrent-booking race-condition tests
├── middleware.ts
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts                          # tokens from §4
├── vercel.json
├── .env.example
└── package.json
```

---

## 11. Authentication & Security

- **Auth:** Auth.js (NextAuth v5), JWT session carrying `userId` only — role/property-assignment resolved server-side per-request, never trusted from a stale token.
- **Authorization:** role-based (§3) plus property-assignment-scoped, enforced in middleware and at the query layer.
- **Booking integrity:** the hold-and-book transactional path (§9/§10) is the single most security/correctness-critical piece of logic in the product — it is the one module with mandatory code review sign-off from a second engineer and dedicated concurrency test coverage before any change ships.
- **Payment security:** card data captured via Stripe directly (Stripe.js/Elements or Stripe Terminal for card-present front-desk hardware) — Wayfarer never handles raw card data, minimizing PCI scope.
- **Data protection:** guest PII (contact info, ID details captured at check-in if applicable) encrypted at rest where sensitive; channel-manager credentials encrypted; TLS-only traffic.
- **Idempotency:** channel-manager webhook ingestion deduped by `external_reservation_id`; public/internal reservation creation deduped by a client-generated idempotency key — a webhook or client retry must never create a duplicate reservation or double-decrement inventory.
- **Night-audit lock integrity:** once a business date is closed by the audit process, direct edits to that date's financial records are blocked at the data-access layer; corrections require an explicit, audit-logged adjustment entry rather than a silent update — enforced in code, not just by UI convention.
- **Rate limiting:** Upstash on auth, public booking-engine endpoints, and all webhooks.
- **Audit trail:** rate changes, reservation modifications/cancellations, folio adjustments, room-status overrides, and night-audit runs all logged immutably.
- **Secrets:** Vercel Environment Variables; `.env.example` documents required keys.

---

## 12. Responsive Design

Breakpoints: 375/768/1024/1440.

- **Front desk / room grid / folio (desktop-first, ≥1024px primary target):** these are back-office-counter workstation screens; the room-grid timeline specifically is designed for a wide viewport and degrades to a simplified, single-room-at-a-time list view below 1024px rather than attempting a cramped miniature grid.
- **Housekeeping board (tablet-first, ≥768px primary target):** designed natively for tablet use by staff walking the property, with large touch targets per §4.7; also usable on a desktop browser at the supervisor's desk.
- **Guest booking engine (mobile-first):** the majority of guest booking traffic is mobile; single-column, large tap targets, minimal steps per the pattern database's explicit "avoid complex booking" guidance.
- **Guest portal / pre-arrival check-in (mobile-first):** same reasoning as the booking engine.
- **Reporting (desktop-first, tablet-usable):** charts and tables degrade to a stacked single-column view below 1024px for a GM checking numbers on the go, with full detail preserved at desktop width.
- All charts container-responsive; no page requires viewport horizontal scroll; the room-grid's own contained horizontal date-scroll is the one intentional, clearly-affordanced exception (§4.7).

---

## 13. Deployment Configuration (Vercel)

**vercel.json**
```json
{
  "framework": "nextjs",
  "buildCommand": "pnpm build",
  "installCommand": "pnpm install",
  "crons": [
    { "path": "/api/cron/pre-arrival-messaging", "schedule": "0 9 * * *" },
    { "path": "/api/cron/channel-sync-retry", "schedule": "*/10 * * * *" },
    { "path": "/api/cron/no-show-flagging", "schedule": "0 3 * * *" }
  ]
}
```

**Environments:** Development, Preview (per-PR, Neon DB branch with a seeded demo property), Production. Migrations applied automatically via a guarded `drizzle-kit migrate` build step.

**Required environment variables:**
```
DATABASE_URL=
AUTH_SECRET=
STRIPE_SECRET_KEY= / STRIPE_WEBHOOK_SECRET=
CHANNEL_MANAGER_API_KEY= / CHANNEL_MANAGER_WEBHOOK_SECRET=
TWILIO_ACCOUNT_SID= / TWILIO_AUTH_TOKEN=
RESEND_API_KEY=
PUSHER_APP_ID= / PUSHER_KEY= / PUSHER_SECRET=
UPSTASH_REDIS_REST_URL= / UPSTASH_REDIS_REST_TOKEN=
BLOB_READ_WRITE_TOKEN=
INNGEST_EVENT_KEY= / INNGEST_SIGNING_KEY=
ENCRYPTION_KEY=
CRON_SECRET=
SENTRY_DSN=
```

**Runtime split:** booking/reservation/folio route handlers on Node.js runtime (transactional Postgres access required); public marketing/booking-engine pages static/Edge where possible for latency, since booking-engine load speed directly affects conversion.

**CI/CD:** GitHub → Vercel auto-deploy on PR (preview seeded with demo property data); GitHub Actions runs `tsc --noEmit`, `vitest run`, `playwright test` — including a dedicated concurrent-booking test that fires simultaneous requests at the last available room-night and asserts exactly one succeeds — before merge is allowed.

---

## 14. Non-Functional Requirements

- **Booking correctness is the top-priority NFR:** no double-booking, ever, under any concurrency scenario (simultaneous direct bookings, direct + OTA webhook race, retried webhook). This is tested explicitly with concurrency/race-condition test scenarios, not assumed correct because a transaction wrapper exists.
- **Performance:** the room-grid timeline must stay responsive at realistic property sizes (hundreds of rooms × 90+ day view) via virtualization rather than rendering every cell; folio/reservation list views use server-side pagination at scale.
- **Accessibility:** WCAG AA baseline; the room-grid, folio, and housekeeping board specifically audited (axe + manual keyboard-navigation check) given their status as the product's primary daily-use surfaces.
- **Testing:** unit tests on the hold-and-book transactional logic (the highest-risk code in the product), rate-calendar bulk-update logic, and night-audit posting logic; integration tests on all reservation/folio/channel-webhook routes; Playwright e2e covering search→book→check-in→charge→check-out→night-audit as one continuous flow, plus the explicit concurrency test above and a channel-webhook-retry-doesn't-duplicate test.
- **Observability:** channel-sync failures, night-audit run outcomes, and any hold-and-book transaction rollback/failure are logged with enough structured detail to reconstruct exactly what happened — these are the events a GM or support engineer will need to explain after the fact.

---

## 15. Build Phases

1. **Foundation:** auth, org/property/role model, design tokens (operational + guest-facing typographic registers), empty-state shells for front desk / housekeeping / booking engine.
2. **Inventory & booking core:** room types/rooms, rate plans/calendar, the hold-and-book transactional engine, direct reservation creation, availability search — get this exactly right before anything else depends on it.
3. **Front desk operations:** room grid, check-in/check-out flow, folio and payment capture (Stripe).
4. **Housekeeping & maintenance:** Kanban board, checkout-triggered task generation, inspection flow, work orders.
5. **Night audit:** guided close process, room/tax posting, no-show handling, business-date roll and record-locking.
6. **Channel management:** OTA connection, rate/availability push, webhook ingestion for OTA bookings, sync-health monitoring.
7. **Guest-facing surfaces:** public booking engine, guest portal/pre-arrival check-in, guest communications.
8. **Reporting, multi-property, hardening:** occupancy/revenue reporting, corporate cross-property dashboard, accessibility pass, load/concurrency testing at realistic property scale, security review, production deploy.

---

*End of specification. This document is the binding source of truth for design tokens (§4), schema (§8), and API surface (§9) — implementation should update this file alongside code changes rather than letting them drift apart.*