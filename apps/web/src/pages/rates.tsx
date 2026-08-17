import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { getGetRateCalendarQueryKey, useBulkUpdateRates, useGetRateCalendar } from '@workspace/api-client-react';
import type { RateCalendarRow } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, Loading, Page, QueryError } from '@/components/data-states';
import { PROPERTY_SLUG, today } from '@/lib/constants';
import { dateLabel, money } from '@/lib/format';

export default function Rates() {
  const params = { startDate: today, days: 7 };
  const query = useGetRateCalendar(PROPERTY_SLUG, params, { query: { queryKey: getGetRateCalendarQueryKey(PROPERTY_SLUG, params) } });
  const update = useBulkUpdateRates();
  const qc = useQueryClient();
  const rows: RateCalendarRow[] = query.data ?? [];
  const dates = rows[0]?.dates ?? [];

  return (
    <Page
      eyebrow="Rates & inventory"
      title="Rate calendar"
      description="Make pricing decisions with the week in front of you."
      action={
        <Button variant="secondary" onClick={() => query.refetch()} data-testid="button-refresh-rates">
          <RefreshCw className="size-4" aria-hidden="true" /> Refresh
        </Button>
      }
    >
      <Card className="overflow-hidden">
        {query.isLoading ? (
          <div className="p-5">
            <Loading rows={4} />
          </div>
        ) : query.isError ? (
          <div className="p-5">
            <QueryError onRetry={() => query.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <Empty title="No rate plans yet" detail="The calendar will populate once room types and rate plans are configured." />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[850px] text-left">
              <thead>
                <tr className="border-b border-border bg-muted/45">
                  <th className="w-56 px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Room / plan</th>
                  {dates.map((d) => (
                    <th key={d.date} className="px-3 py-3 text-center">
                      <p className="font-mono text-[10px] uppercase text-muted-foreground">{dateLabel(d.date)}</p>
                      <p className="mt-1 text-[10px] text-foreground/60">{new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(`${d.date}T12:00:00`))}</p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.roomTypeId}-${row.ratePlanId}`} className="border-b border-border last:border-0">
                    <td className="px-5 py-4">
                      <p className="text-xs font-bold">{row.roomType}</p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">{row.ratePlan}</p>
                    </td>
                    {row.dates.map((cell) => (
                      <td key={cell.date} className="px-2 py-3 text-center">
                        <button
                          type="button"
                          data-testid={`button-rate-${row.roomTypeId}-${cell.date}`}
                          aria-label={`Increase ${row.roomType} rate for ${dateLabel(cell.date)}, currently ${money(cell.priceCents)}`}
                          onClick={() =>
                            update.mutate(
                              { propertySlug: PROPERTY_SLUG, data: { roomTypeId: row.roomTypeId, ratePlanId: row.ratePlanId, startDate: cell.date, endDate: cell.date, priceCents: cell.priceCents + 1000 } },
                              { onSuccess: () => qc.invalidateQueries({ queryKey: getGetRateCalendarQueryKey(PROPERTY_SLUG, params) }) },
                            )
                          }
                          className={`min-h-11 w-full rounded-md px-2 py-2 transition-colors hover:bg-primary/10 ${cell.isClosed ? 'bg-red-50 text-red-700' : 'bg-emerald-50/70'}`}
                        >
                          <p className="font-mono text-xs font-medium">{money(cell.priceCents)}</p>
                          <p className="mt-1 text-[9px] text-muted-foreground">{cell.isClosed ? 'Closed' : `${cell.available} avail.`}</p>
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="size-2 rounded-full bg-accent" aria-hidden="true" /> Click a cell to increase the rate by $10 and sync the calendar.
      </p>
    </Page>
  );
}
