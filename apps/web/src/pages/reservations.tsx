import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Plus, Search } from 'lucide-react';
import { getListReservationsQueryKey, useListReservations } from '@workspace/api-client-react';
import type { Reservation } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Empty, Loading, Page, QueryError, StatusPill } from '@/components/data-states';
import { PROPERTY_SLUG } from '@/lib/constants';
import { dateLabel, money, titleCase } from '@/lib/format';

const STATUSES = ['confirmed', 'pre_checked_in', 'in_house', 'checked_out', 'cancelled', 'no_show'];

export default function Reservations() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const params = useMemo(() => ({ search: search || undefined, status: status === 'all' ? undefined : (status as never) }), [search, status]);
  const query = useListReservations(PROPERTY_SLUG, params, { query: { queryKey: getListReservationsQueryKey(PROPERTY_SLUG, params) } });
  const list = query.data ?? [];

  return (
    <Page
      eyebrow="Reservations"
      title="Reservation book"
      description="Find guests, review stay details, and keep the arrival flow moving."
      action={
        <Link href="/reservations/new" data-testid="link-reservation-create" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90">
          <Plus className="size-4" aria-hidden="true" /> New reservation
        </Link>
      }
    >
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-reservation-search"
              placeholder="Search guest, confirmation, or room…"
              aria-label="Search reservations"
              className="h-10 pl-9"
            />
          </div>
          <select
            aria-label="Filter reservations by status"
            data-testid="select-reservation-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:w-48"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <div className="hidden grid-cols-[1.3fr_.9fr_1fr_.75fr_.8fr] border-b border-border bg-muted/45 px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground md:grid">
          <span>Guest / confirmation</span>
          <span>Stay</span>
          <span>Room</span>
          <span>Status</span>
          <span className="text-right">Balance</span>
        </div>
        {query.isLoading ? (
          <div className="p-5">
            <Loading rows={6} />
          </div>
        ) : query.isError ? (
          <div className="p-5">
            <QueryError onRetry={() => query.refetch()} />
          </div>
        ) : list.length === 0 ? (
          <Empty title="No reservations found" detail="Try a different name, confirmation code, or status filter." />
        ) : (
          <div>
            {list.map((r: Reservation) => (
              <Link
                href={`/reservations/${r.id}`}
                key={r.id}
                data-testid={`row-reservation-${r.id}`}
                className="grid gap-2 border-b border-border px-5 py-4 transition-colors last:border-0 hover:bg-muted/35 md:grid-cols-[1.3fr_.9fr_1fr_.75fr_.8fr] md:items-center"
              >
                <div>
                  <p className="text-sm font-bold">
                    {r.guest.name}
                    {r.guest.vip && <span className="ml-2 rounded bg-accent/20 px-1.5 py-0.5 font-mono text-[9px] text-accent-foreground">VIP</span>}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">{r.confirmationCode} · {titleCase(r.source)}</p>
                </div>
                <div className="text-xs">
                  <span className="text-muted-foreground md:hidden">Stay · </span>
                  {dateLabel(r.checkInDate)} — {dateLabel(r.checkOutDate)}
                </div>
                <div className="text-xs">
                  <span className="text-muted-foreground md:hidden">Room · </span>
                  {r.assignedRoom ?? 'Unassigned'} <span className="text-muted-foreground">· {r.roomType}</span>
                </div>
                <div>
                  <StatusPill status={r.status} />
                </div>
                <div className="text-left text-sm font-semibold md:text-right">{money(r.balanceCents)}</div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </Page>
  );
}
