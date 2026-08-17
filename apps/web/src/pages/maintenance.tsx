import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { getListMaintenanceRequestsQueryKey, useCreateMaintenanceRequest, useListMaintenanceRequests } from '@workspace/api-client-react';
import type { MaintenanceRequest } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Empty, Loading, Page, QueryError, StatusPill } from '@/components/data-states';
import { PROPERTY_SLUG } from '@/lib/constants';
import { dateLabel } from '@/lib/format';

export default function Maintenance() {
  const query = useListMaintenanceRequests(PROPERTY_SLUG, { query: { queryKey: getListMaintenanceRequestsQueryKey(PROPERTY_SLUG) } });
  const create = useCreateMaintenanceRequest();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ roomId: '', description: '', priority: 'medium' });
  const requests = query.data ?? [];
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Page
      eyebrow="Maintenance"
      title="Work orders"
      description="Keep the property quiet, safe, and ready for the next arrival."
      action={
        <Button onClick={() => setShowForm(!showForm)} data-testid="button-new-maintenance">
          <Plus className="size-4" aria-hidden="true" /> New work order
        </Button>
      }
    >
      {showForm && (
        <Card className="mb-5 border-primary/25">
          <CardContent className="grid gap-3 p-5 md:grid-cols-[180px_1fr_140px_auto]">
            <Input value={form.roomId} onChange={(e) => set('roomId', e.target.value)} data-testid="input-maintenance-room" placeholder="Room ID (optional)" aria-label="Room ID" />
            <Input value={form.description} onChange={(e) => set('description', e.target.value)} data-testid="input-maintenance-description" placeholder="What needs attention?" aria-label="Description" />
            <select value={form.priority} onChange={(e) => set('priority', e.target.value)} data-testid="select-maintenance-priority" aria-label="Priority" className="h-9 rounded-md border border-input bg-background px-3 text-xs">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <Button
              disabled={!form.description || create.isPending}
              onClick={() =>
                create.mutate(
                  { propertySlug: PROPERTY_SLUG, data: { ...form, roomId: form.roomId || null, priority: form.priority as never } },
                  {
                    onSuccess: () => {
                      setShowForm(false);
                      setForm({ roomId: '', description: '', priority: 'medium' });
                      qc.invalidateQueries({ queryKey: getListMaintenanceRequestsQueryKey(PROPERTY_SLUG) });
                    },
                  },
                )
              }
              data-testid="button-submit-maintenance"
            >
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </CardContent>
        </Card>
      )}
      <Card className="overflow-hidden">
        {query.isLoading ? (
          <div className="p-5">
            <Loading rows={5} />
          </div>
        ) : query.isError ? (
          <div className="p-5">
            <QueryError onRetry={() => query.refetch()} />
          </div>
        ) : requests.length === 0 ? (
          <Empty title="No open work orders" detail="A quiet property is a good property. New requests will land here." />
        ) : (
          <div>
            {requests.map((item: MaintenanceRequest) => (
              <div key={item.id} data-testid={`row-maintenance-${item.id}`} className="grid gap-3 border-b border-border px-5 py-4 last:border-0 md:grid-cols-[100px_1fr_110px_120px] md:items-center">
                <span className="font-mono text-sm">{item.roomNumber ?? 'Property'}</span>
                <div>
                  <p className="text-sm font-semibold">{item.description}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">Opened {dateLabel(item.createdAt)} · {item.assignedTo ?? 'Unassigned'}</p>
                </div>
                <StatusPill status={item.priority} />
                <StatusPill status={item.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </Page>
  );
}
