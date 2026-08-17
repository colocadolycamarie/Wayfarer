import { type FormEvent, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, Check } from 'lucide-react';
import {
  getGetPublicAvailabilityQueryKey, useCreatePublicReservation, useCreateReservation,
  useGetPublicAvailability,
} from '@workspace/api-client-react';
import type { PublicReservationConfirmation, Reservation } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PROPERTY_SLUG, today } from '@/lib/constants';
import { dateLabel, money } from '@/lib/format';

const inTwoDays = new Date(Date.now() + 86_400_000 * 2).toISOString().slice(0, 10);

export function ReservationForm({ publicMode = false }: { publicMode?: boolean }) {
  const [, setLocation] = useLocation();
  const createStaffReservation = useCreateReservation();
  const createPublicReservation = useCreatePublicReservation();
  const create = publicMode ? createPublicReservation : createStaffReservation;

  const [form, setForm] = useState({
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    roomTypeId: '',
    ratePlanId: '',
    checkInDate: today,
    checkOutDate: inTwoDays,
    adults: '2',
    children: '0',
    specialRequests: '',
    source: 'direct',
  });
  const availability = useGetPublicAvailability(
    PROPERTY_SLUG,
    { checkIn: form.checkInDate, checkOut: form.checkOutDate, guests: Number(form.adults) + Number(form.children) },
    {
      query: {
        queryKey: getGetPublicAvailabilityQueryKey(PROPERTY_SLUG, {
          checkIn: form.checkInDate,
          checkOut: form.checkOutDate,
          guests: Number(form.adults) + Number(form.children),
        }),
      },
    },
  );
  const types = availability.data ?? [];
  const [confirmation, setConfirmation] = useState<PublicReservationConfirmation | null>(null);

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      ...form,
      adults: Number(form.adults),
      children: Number(form.children),
      idempotencyKey: `wayfarer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    if (publicMode) {
      createPublicReservation.mutate(
        { propertySlug: PROPERTY_SLUG, data: payload as never },
        { onSuccess: (result) => setConfirmation(result) },
      );
    } else {
      createStaffReservation.mutate(
        { propertySlug: PROPERTY_SLUG, data: payload as never },
        { onSuccess: (result) => setLocation(`/reservations/${(result as Reservation).id}`) },
      );
    }
  };

  if (confirmation) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-primary/20 bg-card p-8 text-center shadow-md sm:p-12" data-testid="booking-confirmation">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <Check className="size-7" aria-hidden="true" />
        </span>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[.2em] text-primary">Booking confirmed</p>
        <h1 className="mt-3 font-serif text-4xl">You&rsquo;re booked.</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your stay at {confirmation.property.name} is ready. Save this confirmation code for your arrival.
        </p>
        <div className="my-7 rounded-xl bg-muted p-5">
          <p className="font-mono text-2xl font-medium tracking-widest">{confirmation.confirmationCode}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {dateLabel(form.checkInDate)} — {dateLabel(form.checkOutDate)} · {money(confirmation.totalCents)}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">A confirmation will be sent to {form.guestEmail}.</p>
      </div>
    );
  }

  const selectedType = types.find((t) => t.roomTypeId === form.roomTypeId);

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
            <div>
              <CardTitle className="text-base">{publicMode ? 'Choose your stay' : 'Guest and stay details'}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {publicMode ? 'A quiet room on the waterfront.' : 'Create a direct, phone, or walk-in reservation.'}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold">
              Guest name
              <Input required value={form.guestName} onChange={(e) => set('guestName', e.target.value)} data-testid="input-guest-name" className="mt-1.5" placeholder="Full name" />
            </label>
            <label className="text-xs font-bold">
              Email
              <Input required type="email" value={form.guestEmail} onChange={(e) => set('guestEmail', e.target.value)} data-testid="input-guest-email" className="mt-1.5" placeholder="guest@example.com" />
            </label>
            <label className="text-xs font-bold">
              Phone <span className="font-normal text-muted-foreground">(optional)</span>
              <Input value={form.guestPhone} onChange={(e) => set('guestPhone', e.target.value)} data-testid="input-guest-phone" className="mt-1.5" placeholder="+1 415…" />
            </label>
            <label className="text-xs font-bold">
              Room type
              <select
                required
                value={form.roomTypeId}
                onChange={(e) => {
                  set('roomTypeId', e.target.value);
                  const t = types.find((item) => item.roomTypeId === e.target.value);
                  if (t) set('ratePlanId', t.ratePlanId);
                }}
                data-testid="select-room-type"
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">
                  {availability.isLoading
                    ? 'Checking availability…'
                    : availability.isError
                      ? 'Could not check availability — try again'
                      : types.length === 0
                        ? 'No rooms available for these dates'
                        : 'Select available room'}
                </option>
                {types.map((t) => (
                  <option key={t.roomTypeId} value={t.roomTypeId}>
                    {t.name} · {money(t.nightlyRateCents)}/night
                  </option>
                ))}
              </select>
              {availability.isError && (
                <button
                  type="button"
                  onClick={() => availability.refetch()}
                  data-testid="button-retry-availability"
                  className="mt-1.5 text-[11px] font-bold text-primary hover:underline"
                >
                  Retry availability check
                </button>
              )}
            </label>
            <label className="text-xs font-bold">
              Check-in
              <Input required type="date" value={form.checkInDate} onChange={(e) => set('checkInDate', e.target.value)} data-testid="input-check-in" className="mt-1.5" />
            </label>
            <label className="text-xs font-bold">
              Check-out
              <Input required type="date" value={form.checkOutDate} onChange={(e) => set('checkOutDate', e.target.value)} data-testid="input-check-out" className="mt-1.5" />
            </label>
            <label className="text-xs font-bold">
              Adults
              <Input required type="number" min="1" value={form.adults} onChange={(e) => set('adults', e.target.value)} data-testid="input-adults" className="mt-1.5" />
            </label>
            <label className="text-xs font-bold">
              Children
              <Input type="number" min="0" value={form.children} onChange={(e) => set('children', e.target.value)} data-testid="input-children" className="mt-1.5" />
            </label>
          </div>
          {!publicMode && (
            <label className="text-xs font-bold">
              Source
              <select value={form.source} onChange={(e) => set('source', e.target.value)} data-testid="select-source" className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="direct">Direct</option>
                <option value="phone">Phone</option>
                <option value="walk_in">Walk-in</option>
              </select>
            </label>
          )}
          <label className="text-xs font-bold">
            Special requests <span className="font-normal text-muted-foreground">(optional)</span>
            <Textarea value={form.specialRequests} onChange={(e) => set('specialRequests', e.target.value)} data-testid="textarea-special-requests" className="mt-1.5" placeholder="Arrival notes, accessibility needs, celebration…" />
          </label>
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="p-5">
            <p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Your selection</p>
            {selectedType ? (
              <>
                <h2 className="mt-3 font-serif text-2xl">{selectedType.name}</h2>
                <p className="mt-1 text-xs text-primary-foreground/65">
                  {dateLabel(form.checkInDate)} — {dateLabel(form.checkOutDate)}
                </p>
                <div className="mt-5 flex items-end justify-between border-t border-primary-foreground/15 pt-4">
                  <span className="text-xs text-primary-foreground/65">Estimated total</span>
                  <span className="font-serif text-2xl">{money(selectedType.totalCents)}</span>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-primary-foreground/65">Select a room type to see your stay summary.</p>
            )}
          </CardContent>
        </Card>
        <Button type="submit" disabled={create.isPending || !form.roomTypeId} data-testid="button-submit-reservation" className="w-full min-h-11 bg-accent text-accent-foreground hover:bg-accent/90">
          {create.isPending ? 'Saving…' : publicMode ? 'Complete booking' : 'Create reservation'}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
        {create.isError && <p className="text-xs text-destructive" role="alert">We couldn&rsquo;t complete that booking. Please review the details and try again.</p>}
      </div>
    </form>
  );
}
