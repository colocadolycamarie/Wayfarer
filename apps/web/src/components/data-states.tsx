import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Sparkles, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { titleCase } from '@/lib/format';

export function Page({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="animate-rise mx-auto max-w-[1440px] p-4 sm:p-7">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[.2em] text-primary">{eyebrow}</p>
          <h1 className="font-serif text-3xl tracking-tight text-foreground sm:text-[36px]">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" data-testid="state-loading" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-14 rounded-lg" />
      ))}
    </div>
  );
}

export function QueryError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div
      className="rounded-xl border border-destructive/25 bg-destructive/5 p-7 text-center"
      data-testid="state-error"
      role="alert"
    >
      <AlertTriangle className="mx-auto mb-2 size-6 text-destructive" aria-hidden="true" />
      <p className="text-sm font-semibold">We couldn&apos;t load this operational view.</p>
      <p className="mt-1 text-xs text-muted-foreground">Check the connection and try again.</p>
      <button
        type="button"
        onClick={onRetry}
        data-testid="button-retry"
        className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-md px-2 text-xs font-bold text-primary hover:underline"
      >
        <RefreshCw className="size-3.5" aria-hidden="true" /> Retry
      </button>
    </div>
  );
}

export function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center" data-testid="state-empty">
      <Sparkles className="mx-auto mb-3 size-6 text-accent" aria-hidden="true" />
      <p className="text-sm font-bold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

const STATUS_TONE = {
  positive: ['ready', 'inspected', 'confirmed', 'in_house', 'completed', 'vacant_clean'],
  warning: ['dirty', 'in_progress', 'pre_checked_in', 'vacant_dirty', 'checkout_today'],
  danger: ['cancelled', 'no_show', 'out_of_order', 'high'],
};

export function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONE.positive.includes(status)
    ? 'bg-emerald-100 text-emerald-800'
    : STATUS_TONE.warning.includes(status)
      ? 'bg-amber-100 text-amber-800'
      : STATUS_TONE.danger.includes(status)
        ? 'bg-red-100 text-red-800'
        : 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wide ${tone}`}>
      {titleCase(status)}
    </span>
  );
}

export function Metric({
  label,
  value,
  detail,
  icon: MetricIcon,
  accent = false,
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <Card className={`overflow-hidden ${accent ? 'border-primary/25 bg-primary text-primary-foreground' : ''}`}>
      <CardContent className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <span className={`font-mono text-[10px] uppercase tracking-[.16em] ${accent ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
            {label}
          </span>
          <MetricIcon className={`size-4 ${accent ? 'text-accent' : 'text-primary'}`} aria-hidden="true" />
        </div>
        <p className="font-serif text-3xl">{value}</p>
        {detail && <p className={`mt-1 text-[11px] ${accent ? 'text-primary-foreground/65' : 'text-muted-foreground'}`}>{detail}</p>}
      </CardContent>
    </Card>
  );
}

export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
