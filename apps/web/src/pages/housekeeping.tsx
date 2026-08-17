import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { getListHousekeepingTasksQueryKey, useAssignHousekeepingTask, useListHousekeepingTasks, useUpdateHousekeepingTaskStatus } from '@workspace/api-client-react';
import type { HousekeepingTask } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Empty, Loading, Page, QueryError, StatusPill } from '@/components/data-states';
import { PROPERTY_SLUG } from '@/lib/constants';
import { titleCase } from '@/lib/format';

const COLUMNS = ['dirty', 'in_progress', 'inspected', 'ready'];

export default function Housekeeping() {
  const [status, setStatus] = useState('all');
  const params = { status: status === 'all' ? undefined : (status as never) };
  const query = useListHousekeepingTasks(PROPERTY_SLUG, params, { query: { queryKey: getListHousekeepingTasksQueryKey(PROPERTY_SLUG, params) } });
  const update = useUpdateHousekeepingTaskStatus();
  const assign = useAssignHousekeepingTask();
  const qc = useQueryClient();
  const tasks = query.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: getListHousekeepingTasksQueryKey(PROPERTY_SLUG, params) });

  return (
    <Page
      eyebrow="Housekeeping"
      title="Room turn board"
      description="A clean handoff between the desk, rooms, and the people making them ready."
      action={
        <div className="flex gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-housekeeping-status" aria-label="Filter tasks by status" className="h-10 rounded-md border border-input bg-card px-3 text-xs font-bold">
            <option value="all">All tasks</option>
            {COLUMNS.map((s) => (
              <option key={s} value={s}>{titleCase(s)}</option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => query.refetch()} data-testid="button-refresh-housekeeping">
            <RefreshCw className="size-4" aria-hidden="true" /> Refresh
          </Button>
        </div>
      }
    >
      {query.isLoading ? (
        <Loading rows={5} />
      ) : query.isError ? (
        <QueryError onRetry={() => query.refetch()} />
      ) : tasks.length === 0 ? (
        <Empty title="No housekeeping tasks" detail="The board is clear for this filter." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-4">
          {COLUMNS.map((column) => (
            <div key={column} className="min-h-[300px] rounded-xl bg-muted/50 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${column === 'ready' ? 'bg-emerald-500' : column === 'dirty' ? 'bg-amber-400' : 'bg-primary'}`} aria-hidden="true" />
                  <h2 className="text-xs font-bold">{titleCase(column)}</h2>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">{tasks.filter((t) => t.status === column).length}</span>
              </div>
              <div className="space-y-2">
                {tasks.filter((t) => t.status === column).map((task: HousekeepingTask) => (
                  <div key={task.id} data-testid={`card-housekeeping-${task.id}`} className="rounded-lg border border-border bg-card p-3 shadow-sm">
                    <div className="flex items-start justify-between">
                      <span className="font-mono text-sm font-medium">{task.roomNumber}</span>
                      <StatusPill status={task.priority} />
                    </div>
                    <p className="mt-2 text-xs font-semibold">{task.roomType}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{task.estimatedMinutes} min · {task.assignedTo ?? 'Unassigned'}</p>
                    {task.guestNote && <p className="mt-3 rounded bg-muted px-2 py-1.5 text-[10px] italic text-muted-foreground">{task.guestNote}</p>}
                    <div className="mt-3 flex gap-1.5">
                      <select
                        aria-label={`Update room ${task.roomNumber}`}
                        value={task.status}
                        onChange={(e) => update.mutate({ propertySlug: PROPERTY_SLUG, taskId: task.id, data: { status: e.target.value as never } }, { onSuccess: invalidate })}
                        data-testid={`select-task-status-${task.id}`}
                        className="h-8 min-w-0 flex-1 rounded border border-input bg-background px-1.5 text-[10px]"
                      >
                        <option value="dirty">Dirty</option>
                        <option value="in_progress">In progress</option>
                        <option value="inspected">Inspected</option>
                        <option value="ready">Ready</option>
                      </select>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 px-2 text-[10px]"
                        onClick={() => assign.mutate({ propertySlug: PROPERTY_SLUG, taskId: task.id, data: { userId: 'alex-rivera' } }, { onSuccess: invalidate })}
                        data-testid={`button-assign-task-${task.id}`}
                      >
                        Assign me
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
