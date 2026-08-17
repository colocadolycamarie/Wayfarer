import { IconMark } from '@/components/app-shell';
import { ReservationForm } from '@/components/reservation-form';

export default function PublicBooking() {
  return (
    <div className="min-h-[100dvh] bg-[#f3efe6]">
      <header className="flex items-center justify-between border-b border-[#d9d1c2] px-5 py-5 sm:px-10">
        <IconMark />
        <span className="font-mono text-[10px] uppercase tracking-[.18em] text-[#6e726d]">Grand Harbor · Boston, MA</span>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-10 sm:py-16">
        <div className="mb-10 max-w-xl">
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#2e6b66]">Stay a little longer</p>
          <h1 className="mt-3 font-serif text-5xl leading-[1.02] tracking-tight text-[#1f2929] sm:text-6xl">A room with room to breathe.</h1>
          <p className="mt-5 max-w-md text-sm leading-6 text-[#6e726d]">
            Settle into the Grand Harbor, a quieter way to meet the city. Choose your dates and we&rsquo;ll take care of the rest.
          </p>
        </div>
        <ReservationForm publicMode />
      </main>
      <footer className="px-5 pb-8 text-center font-mono text-[10px] uppercase tracking-[.16em] text-[#9a968d]">
        Grand Harbor · The waterfront, considered
      </footer>
    </div>
  );
}
