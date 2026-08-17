import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { Page } from '@/components/data-states';
import { ReservationForm } from '@/components/reservation-form';

export default function NewReservation() {
  return (
    <Page
      eyebrow="Reservations / New"
      title="Make a reservation"
      description="Hold the room, capture the guest, and send a clear confirmation."
      action={
        <Link href="/reservations" data-testid="link-back-reservations" className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> Reservation book
        </Link>
      }
    >
      <ReservationForm />
    </Page>
  );
}
