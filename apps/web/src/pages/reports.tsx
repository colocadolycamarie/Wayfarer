import { CircleDollarSign, FileBarChart, Gauge, RefreshCw, TrendingUp } from 'lucide-react';
import { getGetOccupancyReportQueryKey, getGetRevenueReportQueryKey, useGetOccupancyReport, useGetRevenueReport } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, Loading, Metric, Page, QueryError } from '@/components/data-states';
import { PROPERTY_SLUG } from '@/lib/constants';
import { dateLabel, money } from '@/lib/format';

export default function Reports() {
  const occupancyParams = { range: '30d' as const };
  const occupancy = useGetOccupancyReport(PROPERTY_SLUG, occupancyParams, { query: { queryKey: getGetOccupancyReportQueryKey(PROPERTY_SLUG, occupancyParams) } });
  const revenue = useGetRevenueReport(PROPERTY_SLUG, { query: { queryKey: getGetRevenueReportQueryKey(PROPERTY_SLUG) } });
  const o = occupancy.data;
  const rev = revenue.data;
  const series = o?.series ?? [];
  const max = Math.max(...series.map((point) => point.occupancyPercent), 1);
  const refreshAll = () => { occupancy.refetch(); revenue.refetch(); };

  return (
    <Page
      eyebrow="Reports"
      title="Property pulse"
      description="A compact read on occupancy, rate, and the revenue mix behind tonight's decisions."
      action={
        <Button variant="secondary" onClick={refreshAll} data-testid="button-refresh-reports">
          <RefreshCw className="size-4" aria-hidden="true" /> Refresh data
        </Button>
      }
    >
      {occupancy.isLoading || revenue.isLoading ? (
        <Loading rows={4} />
      ) : occupancy.isError || revenue.isError ? (
        <QueryError onRetry={refreshAll} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Occupancy" value={`${o?.currentPercent ?? 0}%`} detail={`Target ${o?.targetPercent ?? 0}%`} icon={Gauge} accent />
            <Metric label="ADR" value={money(o?.adrCents)} detail="Current average" icon={CircleDollarSign} />
            <Metric label="RevPAR" value={money(o?.revparCents)} detail="Revenue / available room" icon={TrendingUp} />
            <Metric label="Total revenue" value={money(rev?.totalCents)} detail="Last 30 days" icon={FileBarChart} />
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
            <Card>
              <CardHeader className="border-b border-border px-5 py-4">
                <CardTitle className="text-base">Occupancy trend</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{o?.range ?? '30d'} · from completed night audits</p>
              </CardHeader>
              <CardContent className="p-5">
                {series.length === 0 ? (
                  <Empty title="No audit history yet" detail="The occupancy trend fills in once night audits have been run for a few days." />
                ) : (
                  <div className="flex h-56 items-end gap-1.5">
                    {series.map((point, index) => (
                      <div key={point.date} className="group flex h-full flex-1 flex-col justify-end gap-2">
                        <div
                          className="relative min-h-[4px] rounded-t bg-primary/75 transition-all group-hover:bg-accent"
                          style={{ height: `${(point.occupancyPercent / max) * 100}%` }}
                          title={`${dateLabel(point.date)} · ${point.occupancyPercent}%`}
                        />
                        <span className="hidden -rotate-45 origin-top-left whitespace-nowrap pt-1 font-mono text-[9px] text-muted-foreground sm:block">
                          {index % 5 === 0 ? dateLabel(point.date) : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="border-b border-border px-5 py-4">
                <CardTitle className="text-base">Revenue by channel</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 p-5">
                {(rev?.channels ?? []).length === 0 ? (
                  <Empty title="No revenue posted yet" detail="Channel splits will appear once room charges are posted." />
                ) : (
                  (rev?.channels ?? []).map((channel) => (
                    <div key={channel.channel}>
                      <div className="mb-1.5 flex justify-between text-xs">
                        <span className="font-semibold">{channel.channel}</span>
                        <span className="font-mono text-muted-foreground">{money(channel.amountCents)} · {channel.percent}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${channel.percent}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </Page>
  );
}
