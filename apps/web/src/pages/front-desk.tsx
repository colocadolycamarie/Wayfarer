import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowRight, CircleDollarSign, Gauge, Plus, TrendingUp } from 'lucide-react';
import {
  getGetPropertyActivityQueryKey, getGetPropertySummaryQueryKey, getListReservationsQueryKey,
  getListRoomsQueryKey, useGetPropertyActivity, useGetPropertySummary, useListReservations,
  useListRooms, useUpdateRoomStatus,
} from '@workspace/api-client-react';
import type { ActivityItem, Room } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, Loading, Metric, Page, QueryError } from '@/components/data-states';
import { PROPERTY_SLUG, today } from '@/lib/constants';
import { longDateLabel, money, timeLabel, titleCase } from '@/lib/format';

export default function FrontDesk() {
  const summary = useGetPropertySummary(PROPERTY_SLUG, { query: { queryKey: getGetPropertySummaryQueryKey(PROPERTY_SLUG) } });
  const activity = useGetPropertyActivity(PROPERTY_SLUG, { query: { queryKey: getGetPropertyActivityQueryKey(PROPERTY_SLUG) } });
  const rooms = useListRooms(PROPERTY_SLUG, {}, { query: { queryKey: getListRoomsQueryKey(PROPERTY_SLUG, {}) } });
  const reservations = useListReservations(
    PROPERTY_SLUG,
    { date: today },
    { query: { queryKey: getListReservationsQueryKey(PROPERTY_SLUG, { date: today }) } },
  );
  const updateRoom = useUpdateRoomStatus();
  const qc = useQueryClient();

  const property = summary.data;
  const roomList = rooms.data ?? [];
  const reservationList = reservations.data ?? [];
  const arrivals = reservationList.filter((r) => r.checkInDate === today);
  const departures = reservationList.filter((r) => r.checkOutDate === today);
  const businessDateLong = longDateLabel(property?.property.businessDate);

  const setRoomStatus = (room: Room, status: string) =>
    updateRoom.mutate(
      { propertySlug: PROPERTY_SLUG, roomId: room.id, data: { status: status as never } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getListRoomsQueryKey(PROPERTY_SLUG, {}) }) },
    );

  return (
    <Page
      eyebrow={`${businessDateLong} · business date`}
      title="Good morning, Alex."
      description={`${property?.property.name ?? 'Loading property…'} · Front desk pulse for the business date.`}
      action={
        <Link
          href="/reservations/new"
          data-testid="link-new-reservation"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <Plus className="size-4" aria-hidden="true" /> New reservation
        </Link>
      }
    >
      {summary.isLoading ? (
        <Loading rows={1} />
      ) : summary.isError ? (
        <QueryError onRetry={() => summary.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Metric label="Occupancy" value={`${property?.occupancyPercent ?? 0}%`} detail="Today's rooms sold" icon={Gauge} accent />
          <Metric label="ADR" value={money(property?.adrCents)} detail="Average daily rate" icon={CircleDollarSign} />
          <Metric label="RevPAR" value={money(property?.revparCents)} detail="Revenue per room" icon={TrendingUp} />
          <Metric label="Arrivals" value={property?.arrivals ?? arrivals.length} detail="Expected today" icon={ArrowDownToLine} />
          <Metric label="Departures" value={property?.departures ?? departures.length} detail={`${property?.roomsToClean ?? 0} rooms to turn`} icon={ArrowRight} />
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between border-b border-border px-5 py-4">
            <div>
              <CardTitle className="text-base">Room rack</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Live inventory · {roomList.length || '—'} rooms in property</p>
            </div>
            <div className="flex gap-1.5" aria-hidden="true">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="size-2 rounded-full bg-amber-400" />
              <span className="size-2 rounded-full bg-slate-400" />
            </div>
          </CardHeader>
          <CardContent className="p-5">
            {rooms.isLoading ? (
              <Loading rows={3} />
            ) : rooms.isError ? (
              <QueryError onRetry={() => rooms.refetch()} />
            ) : roomList.length === 0 ? (
              <Empty title="No rooms yet" detail="Room inventory will appear here once rooms are added to the property." />
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {roomList.map((room) => (
                  <button
                    type="button"
                    key={room.id}
                    data-testid={`button-room-${room.id}`}
                    onClick={() =>
                      setRoomStatus(room, room.status === 'vacant_dirty' ? 'vacant_clean' : room.status === 'vacant_clean' ? 'vacant_dirty' : room.status)
                    }
                    disabled={room.status === 'occupied' || room.status === 'out_of_order'}
                    aria-label={`Room ${room.number}, ${titleCase(room.status)}${room.guestName ? `, ${room.guestName}` : ''}`}
                    className={`group min-h-[76px] rounded-lg border p-3 text-left transition-transform hover:-translate-y-0.5 disabled:cursor-default disabled:hover:translate-y-0 ${
                      room.status === 'vacant_clean' || room.status === 'inspected'
                        ? 'border-emerald-200 bg-emerald-50/65'
                        : room.status === 'vacant_dirty'
                          ? 'border-amber-200 bg-amber-50/65'
                          : room.status === 'out_of_order'
                            ? 'border-red-200 bg-red-50/60'
                            : 'border-border bg-card'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="font-mono text-sm font-medium">{room.number}</span>
                      <span className="mt-1 size-2 rounded-full bg-current opacity-50" aria-hidden="true" />
                    </div>
                    <p className="mt-2 truncate text-[10px] text-muted-foreground">{room.roomType}</p>
                    <p className="mt-2 truncate text-[10px] font-semibold text-foreground/70">{room.guestName ?? titleCase(room.status)}</p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Today&apos;s movement</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Arrivals & departures needing attention</p>
              </div>
              <Link href="/reservations" data-testid="link-view-reservations" className="text-xs font-bold text-primary hover:underline">
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {reservations.isLoading ? (
              <div className="p-5">
                <Loading rows={3} />
              </div>
            ) : reservationList.length === 0 ? (
              <Empty title="Nothing moving today" detail="Reservations arriving or departing on the business date will appear here." />
            ) : (
              <div>
                {[...arrivals, ...departures].slice(0, 6).map((r) => (
                  <Link
                    key={`${r.id}-${r.checkInDate}`}
                    href={`/reservations/${r.id}`}
                    data-testid={`link-movement-${r.id}`}
                    className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-0 hover:bg-muted/45"
                  >
                    <span className={`grid size-8 place-items-center rounded-md ${r.checkInDate === today ? 'bg-primary/10 text-primary' : 'bg-accent/15 text-accent-foreground'}`}>
                      {r.checkInDate === today ? <ArrowDownToLine className="size-4" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{r.guest.name}</p>
                      <p className="text-[10px] text-muted-foreground">{r.checkInDate === today ? 'Arriving' : 'Departing'} · {r.roomType}</p>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">{r.assignedRoom ?? 'Unassigned'}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.25fr]">
        <Card>
          <CardHeader className="border-b border-border px-5 py-4">
            <CardTitle className="text-base">Shift activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {activity.isLoading ? (
              <div className="p-5">
                <Loading rows={3} />
              </div>
            ) : activity.isError ? (
              <div className="p-5">
                <QueryError onRetry={() => activity.refetch()} />
              </div>
            ) : (activity.data ?? []).length === 0 ? (
              <div className="p-5">
                <Empty title="No activity yet" detail="Front-desk actions will show up here as they happen." />
              </div>
            ) : (
              <div>
                {(activity.data ?? []).slice(0, 5).map((item: ActivityItem) => (
                  <div key={item.id} data-testid={`activity-item-${item.id}`} className="flex gap-3 border-b border-border px-5 py-3 last:border-0">
                    <span
                      className={`mt-1 size-1.5 shrink-0 rounded-full ${
                        item.tone === 'positive' ? 'bg-emerald-500' : item.tone === 'warning' ? 'bg-amber-400' : item.tone === 'destructive' ? 'bg-destructive' : 'bg-primary'
                      }`}
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-xs">
                        <b>{item.action}</b> <span className="text-muted-foreground">{item.description}</span>
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">{item.actor} · {timeLabel(item.occurredAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="flex h-full flex-col justify-between p-6">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-accent">Desk note</p>
              <h2 className="mt-3 max-w-md font-serif text-2xl">Every room tells you what happens next.</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-primary-foreground/65">
                Stay ahead of the turn. Review arrivals, clear the rack, and keep the handoff clean.
              </p>
            </div>
            <Link href="/housekeeping" data-testid="link-housekeeping-cta" className="mt-7 inline-flex w-fit items-center gap-2 text-xs font-bold text-accent hover:underline">
              Open housekeeping board <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
