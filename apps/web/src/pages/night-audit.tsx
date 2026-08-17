import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardCheck } from 'lucide-react';
import { getListNightAuditRunsQueryKey, useListNightAuditRuns, useRunNightAudit } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, Loading, Page, StatusPill } from '@/components/data-states';
import { PROPERTY_SLUG } from '@/lib/constants';
import { dateLabel, money, timeLabel } from '@/lib/format';

const CHECKLIST = [
  ['Charges', 'All room and tax charges are posted'],
  ['Reconciliation', 'Payments and folios balance to the desk'],
  ['No-shows', 'No-show candidates have been reviewed'],
];

export default function NightAudit() {
  const runs = useListNightAuditRuns(PROPERTY_SLUG, { query: { queryKey: getListNightAuditRunsQueryKey(PROPERTY_SLUG) } });
  const run = useRunNightAudit();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);

  return (
    <Page
      eyebrow="Night audit"
      title="Close the day cleanly"
      description="A guided close for charges, payments, and no-shows. Run only when the desk is ready."
      action={
        <Button
          disabled={!confirm || run.isPending}
          onClick={() =>
            run.mutate(
              { propertySlug: PROPERTY_SLUG, data: { confirmCharges: true, confirmReconciliation: true } },
              { onSuccess: () => { setConfirm(false); qc.invalidateQueries({ queryKey: getListNightAuditRunsQueryKey(PROPERTY_SLUG) }); } },
            )
          }
          data-testid="button-run-night-audit"
        >
          <ClipboardCheck className="size-4" aria-hidden="true" /> {run.isPending ? 'Running audit…' : 'Run night audit'}
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
        <Card>
          <CardHeader className="border-b border-border px-5 py-4">
            <CardTitle className="text-base">Preflight checklist</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Confirm each handoff before posting the business date.</p>
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            {CHECKLIST.map(([label, detail], index) => (
              <div key={label} className="flex items-start gap-3 rounded-lg border border-border p-3">
                <span className="grid size-6 place-items-center rounded-full bg-emerald-100 font-mono text-[10px] text-emerald-700">{index + 1}</span>
                <div>
                  <p className="text-xs font-bold">{label}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
                </div>
                <Check className="ml-auto size-4 text-emerald-600" aria-hidden="true" />
              </div>
            ))}
            <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-accent/10 p-3 text-xs font-semibold">
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="checkbox-confirm-audit" className="size-4 accent-primary" />
              I&rsquo;ve reviewed the above and am ready to close the day.
            </label>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="border-b border-border px-5 py-4">
            <CardTitle className="text-base">Audit history</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {runs.isLoading ? (
              <div className="p-5">
                <Loading rows={3} />
              </div>
            ) : (runs.data ?? []).length === 0 ? (
              <div className="p-5">
                <Empty title="No audit runs yet" detail="Completed audits will be retained here." />
              </div>
            ) : (
              <div>
                {(runs.data ?? []).map((item) => (
                  <div key={item.id} data-testid={`row-audit-${item.id}`} className="border-b border-border px-5 py-4 last:border-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold">{dateLabel(item.businessDate)}</p>
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground">{timeLabel(item.startedAt)} · {item.roomsCharged} rooms charged</p>
                      </div>
                      <StatusPill status={item.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                      <span>Taxes <b className="block text-foreground">{money(item.taxesPostedCents)}</b></span>
                      <span>Payments <b className="block text-foreground">{money(item.paymentsReconciledCents)}</b></span>
                      <span>No-shows <b className="block text-foreground">{item.noShowsFlagged}</b></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
