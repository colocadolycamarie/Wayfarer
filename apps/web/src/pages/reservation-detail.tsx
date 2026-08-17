import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import {
  getGetFolioQueryKey, getGetReservationQueryKey, useAssignReservationRoom, useCancelReservation,
  useCheckInReservation, useCheckOutReservation, useGetFolio, useGetReservation,
  usePostFolioCharge, usePostFolioPayment, useUpdateReservation,
} from '@workspace/api-client-react';
import type { ReservationDetail } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Info, Loading, Page, QueryError, StatusPill } from '@/components/data-states';
import { PROPERTY_SLUG } from '@/lib/constants';
import { dateLabel, money, titleCase } from '@/lib/format';

export default function ReservationRecord() {
  const { id = '' } = useParams<{ id: string }>();
  const detail = useGetReservation(PROPERTY_SLUG, id, { query: { enabled: !!id, queryKey: getGetReservationQueryKey(PROPERTY_SLUG, id) } });
  const folio = useGetFolio(PROPERTY_SLUG, detail.data?.folioId ?? '', {
    query: { enabled: !!detail.data?.folioId, queryKey: getGetFolioQueryKey(PROPERTY_SLUG, detail.data?.folioId ?? '') },
  });
  const cancel = useCancelReservation();
  const checkIn = useCheckInReservation();
  const checkOut = useCheckOutReservation();
  const assign = useAssignReservationRoom();
  const update = useUpdateReservation();
  const charge = usePostFolioCharge();
  const payment = usePostFolioPayment();
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editRequests, setEditRequests] = useState('');
  const [roomId, setRoomId] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeDesc, setChargeDesc] = useState('');

  const r: ReservationDetail | undefined = detail.data;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetReservationQueryKey(PROPERTY_SLUG, id) });
    if (r?.folioId) qc.invalidateQueries({ queryKey: getGetFolioQueryKey(PROPERTY_SLUG, r.folioId) });
  };

  const startEditing = () => {
    setEditName(r?.guest.name ?? '');
    setEditRequests(r?.specialRequests ?? '');
    setEditing(true);
  };

  const saveEdits = () => {
    update.mutate(
      { propertySlug: PROPERTY_SLUG, reservationId: id, data: { guestName: editName, specialRequests: editRequests } },
      { onSuccess: () => { setEditing(false); invalidate(); } },
    );
  };

  if (detail.isLoading) {
    return (
      <Page eyebrow="Reservation" title="Loading record…">
        <Loading rows={5} />
      </Page>
    );
  }
  if (detail.isError || !r) {
    return (
      <Page eyebrow="Reservation" title="Record unavailable">
        <QueryError onRetry={() => detail.refetch()} />
      </Page>
    );
  }

  return (
    <Page
      eyebrow={`Reservation / ${r.confirmationCode}`}
      title={r.guest.name}
      description={`${r.guest.vip ? 'VIP guest · ' : ''}${r.guest.email}`}
      action={
        <div className="flex gap-2">
          <Link href="/reservations" data-testid="link-record-back" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-bold hover:bg-muted">
            <ArrowLeft className="size-4" aria-hidden="true" /> Back
          </Link>
          {r.status === 'confirmed' && (
            <Button
              onClick={() =>
                checkIn.mutate(
                  { propertySlug: PROPERTY_SLUG, reservationId: id, data: { roomId: roomId || r.assignedRoom || '', paymentMethod: 'authorization', idVerified: true } },
                  { onSuccess: invalidate },
                )
              }
              disabled={checkIn.isPending || (!roomId && !r.assignedRoom)}
              data-testid="button-check-in"
            >
              {checkIn.isPending ? 'Checking in…' : 'Check in'}
            </Button>
          )}
          {r.status === 'in_house' && (
            <Button
              onClick={() => checkOut.mutate({ propertySlug: PROPERTY_SLUG, reservationId: id, data: { paymentMethod: 'card', settleBalance: true } }, { onSuccess: invalidate })}
              disabled={checkOut.isPending}
              data-testid="button-check-out"
            >
              {checkOut.isPending ? 'Checking out…' : 'Check out'}
            </Button>
          )}
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-start justify-between border-b border-border px-5 py-4">
              <div>
                <CardTitle className="text-base">Stay overview</CardTitle>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{r.confirmationCode} · created {dateLabel(r.createdAt)}</p>
              </div>
              <StatusPill status={r.status} />
            </CardHeader>
            <CardContent className="grid gap-5 p-5 sm:grid-cols-2">
              <Info label="Dates" value={`${dateLabel(r.checkInDate)} — ${dateLabel(r.checkOutDate)}`} />
              <Info label="Room" value={`${r.assignedRoom ?? 'Unassigned'} · ${r.roomType}`} />
              <Info label="Rate plan" value={`${r.ratePlan} · ${money(r.nightlyRateCents)}/night`} />
              <Info label="Guests" value={`${r.adults} adults · ${r.children} children`} />
              <Info label="Source" value={titleCase(r.source)} />
              <Info label="Special requests" value={r.specialRequests ?? 'None noted'} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between border-b border-border px-5 py-4">
              <CardTitle className="text-base">Guest profile</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => (editing ? setEditing(false) : startEditing())} data-testid="button-edit-guest">
                {editing ? 'Close' : 'Edit details'}
              </Button>
            </CardHeader>
            <CardContent className="p-5">
              {editing ? (
                <div className="space-y-3">
                  <label className="block text-xs font-bold">
                    Guest name
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} data-testid="input-edit-guest-name" className="mt-1.5" />
                  </label>
                  <label className="block text-xs font-bold">
                    Special requests
                    <Textarea value={editRequests} onChange={(e) => setEditRequests(e.target.value)} data-testid="textarea-edit-request" className="mt-1.5" />
                  </label>
                  <Button onClick={saveEdits} disabled={update.isPending} data-testid="button-save-guest">
                    {update.isPending ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <span className="grid size-11 place-items-center rounded-full bg-primary/10 font-bold text-primary" aria-hidden="true">
                    {r.guest.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </span>
                  <div>
                    <p className="text-sm font-bold">{r.guest.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{r.guest.phone ?? 'No phone'} · {r.guest.stays} previous stays</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.guest.preferences.map((p) => (
                        <Badge key={p} variant="secondary">{p}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b border-border px-5 py-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Folio</CardTitle>
                <span className="font-mono text-[10px] text-muted-foreground">{folio.data?.status ?? 'open'}</span>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              {folio.isLoading ? (
                <Loading rows={3} />
              ) : (
                <>
                  <div className="mb-4 flex items-end justify-between">
                    <span className="text-xs text-muted-foreground">Open balance</span>
                    <span className="font-serif text-3xl">{money(folio.data?.balanceCents ?? r.balanceCents)}</span>
                  </div>
                  <div className="mb-4 divide-y divide-border rounded-lg border border-border">
                    {(folio.data?.items ?? []).length === 0 ? (
                      <p className="px-3 py-3 text-xs text-muted-foreground">No charges posted yet.</p>
                    ) : (
                      (folio.data?.items ?? []).map((item) => (
                        <div key={item.id} className="flex justify-between gap-3 px-3 py-2.5 text-xs">
                          <span>
                            <span className="mr-2 font-mono text-[9px] uppercase text-muted-foreground">{item.type}</span>
                            {item.description}
                          </span>
                          <span className={item.amountCents < 0 ? 'text-emerald-700' : 'font-semibold'}>{money(item.amountCents)}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input type="number" min="1" value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} data-testid="input-folio-amount" placeholder="Amount in cents" aria-label="Charge amount in cents" />
                    <Input value={chargeDesc} onChange={(e) => setChargeDesc(e.target.value)} data-testid="input-folio-description" placeholder="Charge description" aria-label="Charge description" />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      disabled={!chargeAmount || charge.isPending}
                      onClick={() =>
                        charge.mutate(
                          { propertySlug: PROPERTY_SLUG, folioId: r.folioId!, data: { type: 'pos_charge', description: chargeDesc || 'Front desk charge', amountCents: Number(chargeAmount) } },
                          { onSuccess: () => { setChargeAmount(''); setChargeDesc(''); invalidate(); } },
                        )
                      }
                      data-testid="button-add-charge"
                    >
                      Add charge
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!chargeAmount || payment.isPending}
                      onClick={() =>
                        payment.mutate(
                          { propertySlug: PROPERTY_SLUG, folioId: r.folioId!, data: { amountCents: Number(chargeAmount), method: 'card' } },
                          { onSuccess: () => { setChargeAmount(''); invalidate(); } },
                        )
                      }
                      data-testid="button-post-payment"
                    >
                      Post payment
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-bold">Room assignment</p>
                <span className="font-mono text-xs">{r.assignedRoom ?? '—'}</span>
              </div>
              <div className="flex gap-2">
                <Input value={roomId} onChange={(e) => setRoomId(e.target.value)} data-testid="input-room-assignment" placeholder="Room ID" aria-label="Room ID to assign" />
                <Button
                  size="sm"
                  onClick={() => assign.mutate({ propertySlug: PROPERTY_SLUG, reservationId: id, data: { roomId } }, { onSuccess: () => { setRoomId(''); invalidate(); } })}
                  disabled={!roomId || assign.isPending}
                  data-testid="button-assign-room"
                >
                  Assign
                </Button>
              </div>
              {r.status !== 'cancelled' && r.status !== 'checked_out' && (
                <Button
                  variant="ghost"
                  className="mt-3 w-full text-destructive hover:text-destructive"
                  onClick={() => {
                    if (window.confirm('Cancel this reservation?')) {
                      cancel.mutate({ propertySlug: PROPERTY_SLUG, reservationId: id, data: { reason: 'Guest request' } }, { onSuccess: invalidate });
                    }
                  }}
                  data-testid="button-cancel-reservation"
                >
                  Cancel reservation
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  );
}
