import { Route, Switch } from 'wouter';
import FrontDesk from '@/pages/front-desk';
import Housekeeping from '@/pages/housekeeping';
import Maintenance from '@/pages/maintenance';
import NightAudit from '@/pages/night-audit';
import NotFound from '@/pages/not-found';
import PublicBooking from '@/pages/public-booking';
import Rates from '@/pages/rates';
import Reports from '@/pages/reports';
import ReservationRecord from '@/pages/reservation-detail';
import NewReservation from '@/pages/reservation-new';
import Reservations from '@/pages/reservations';

export function Router() {
  return (
    <Switch>
      <Route path="/" component={FrontDesk} />
      <Route path="/reservations" component={Reservations} />
      <Route path="/reservations/new" component={NewReservation} />
      <Route path="/reservations/:id" component={ReservationRecord} />
      <Route path="/housekeeping" component={Housekeeping} />
      <Route path="/maintenance" component={Maintenance} />
      <Route path="/rates" component={Rates} />
      <Route path="/night-audit" component={NightAudit} />
      <Route path="/reports" component={Reports} />
      <Route path="/book/grand-harbor" component={PublicBooking} />
      <Route component={NotFound} />
    </Switch>
  );
}
