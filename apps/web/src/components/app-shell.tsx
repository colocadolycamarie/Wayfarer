import { type ReactNode, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Bell, BookOpen, ClipboardCheck, Clock3, FileBarChart, Hotel, LayoutDashboard,
  LogOut, Menu, Search, Settings2, Tag, Wrench,
} from 'lucide-react';
import { getGetPropertySummaryQueryKey, useGetPropertySummary, useHealthCheck } from '@workspace/api-client-react';
import { PROPERTY_SLUG } from '@/lib/constants';
import { longDateLabel } from '@/lib/format';

export function IconMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${compact ? 'justify-center' : ''}`}>
      <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground shadow-sm">
        <Hotel className="size-4" aria-hidden="true" />
      </span>
      {!compact && <span className="font-serif text-[21px] tracking-tight text-sidebar-foreground">wayfarer</span>}
    </div>
  );
}

const NAV = [
  { href: '/', label: 'Front desk', icon: LayoutDashboard },
  { href: '/reservations', label: 'Reservations', icon: BookOpen },
  { href: '/housekeeping', label: 'Housekeeping', icon: ClipboardCheck },
  { href: '/maintenance', label: 'Maintenance', icon: Wrench },
  { href: '/rates', label: 'Rates & inventory', icon: Tag },
  { href: '/night-audit', label: 'Night audit', icon: Clock3 },
  { href: '/reports', label: 'Reports', icon: FileBarChart },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const health = useHealthCheck();
  const summary = useGetPropertySummary(PROPERTY_SLUG, {
    query: { queryKey: getGetPropertySummaryQueryKey(PROPERTY_SLUG) },
  });

  const publicPage = location.startsWith('/book/');
  if (publicPage) return <>{children}</>;

  const property = summary.data?.property;
  const businessDateLong = longDateLabel(property?.businessDate);

  return (
    <div className="min-h-[100dvh] bg-background lg:flex">
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[246px] -translate-x-full flex-col bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform lg:relative lg:translate-x-0 ${open ? 'translate-x-0' : ''}`}
      >
        <div className="mb-9 px-2">
          <IconMark />
        </div>
        <div className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[.2em] text-sidebar-foreground/45">Operations</div>
        <nav className="space-y-1" aria-label="Primary">
          {NAV.map(({ href, label, icon: NavIcon }) => (
            <Link
              key={href}
              href={href}
              data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}
              aria-current={location === href ? 'page' : undefined}
              className={`group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                location === href
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
              onClick={() => setOpen(false)}
            >
              <NavIcon className="size-[17px] opacity-80" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-1">
          <div className="mb-4 rounded-lg border border-sidebar-border bg-sidebar-accent/45 p-3">
            <div className="mb-1 flex items-center gap-2 text-[11px] text-sidebar-foreground/55">
              <span className={`size-1.5 rounded-full ${health.isError ? 'bg-destructive' : 'bg-emerald-400'}`} aria-hidden="true" />
              System status
            </div>
            <p className="font-mono text-[11px] text-sidebar-foreground/80">
              {health.isError ? 'Connection issue' : 'All services operational'}
            </p>
          </div>
          <button
            type="button"
            data-testid="button-settings"
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Settings2 className="size-[17px]" aria-hidden="true" />
            Property settings
          </button>
          <div className="mt-3 flex items-center gap-3 border-t border-sidebar-border px-3 pt-4">
            <span className="grid size-8 place-items-center rounded-full bg-sidebar-primary/20 text-xs font-bold text-sidebar-primary">
              AR
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold">Alex Rivera</p>
              <p className="text-[10px] text-sidebar-foreground/50">Front desk · On shift</p>
            </div>
            <button type="button" aria-label="Sign out" data-testid="button-sign-out" className="grid min-h-9 min-w-9 place-items-center rounded-md text-sidebar-foreground/45 hover:bg-sidebar-accent hover:text-sidebar-foreground">
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          data-testid="button-close-nav"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 bg-foreground/30 lg:hidden"
        />
      )}
      <main className="min-w-0 flex-1">
        <header className="flex h-[68px] items-center justify-between border-b border-border bg-card/70 px-4 backdrop-blur-sm sm:px-7">
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="button-open-nav"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
              className="rounded p-1 lg:hidden"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
            <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <span className="font-mono text-[11px]">{(property?.name ?? 'GRAND HARBOR').toUpperCase()}</span>
              <span className="text-border">/</span>
              <span>{property?.city ?? 'Loading…'}</span>
            </div>
            <div className="sm:hidden">
              <IconMark compact />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring md:flex">
              <Search className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <input
                aria-label="Quick search"
                data-testid="input-quick-search"
                placeholder="Jump to reservation..."
                className="w-44 bg-transparent text-xs outline-none placeholder:text-muted-foreground/65"
              />
            </div>
            <button
              type="button"
              aria-label="Notifications"
              data-testid="button-notifications"
              className="relative min-h-9 min-w-9 rounded-md p-2 text-muted-foreground hover:bg-muted"
            >
              <Bell className="size-[17px]" aria-hidden="true" />
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-accent" aria-hidden="true" />
            </button>
            <div className="hidden border-l border-border pl-3 text-right sm:block">
              <p className="text-xs font-bold">{businessDateLong}</p>
              <p className="font-mono text-[10px] text-muted-foreground">BUSINESS DATE · {property?.businessDate ?? '—'}</p>
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
