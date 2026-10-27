import { Link, createFileRoute } from "@tanstack/react-router";
import { StatusPill } from "@/components/fieldly/bits";
import { getService } from "@/lib/fieldly/catalog";
import { inr } from "@/lib/fieldly/format";
import { t } from "@/lib/fieldly/i18n";
import { useFieldly, useProviders } from "@/lib/fieldly/store";

export const Route = createFileRoute("/bookings/")({ component: BookingsPage });

function BookingsPage() {
  const lang = useFieldly((s) => s.lang);
  const bookings = useFieldly((s) => s.bookings);
  const session = useFieldly((s) => s.session);
  const providers = useProviders();
  const mine = session?.role === "customer"
    ? bookings.filter((b) => b.customerPhone === session.phone)
    : session?.role === "provider" && session.providerId
      ? bookings.filter((b) => b.providerId === session.providerId)
      : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-4xl font-bold tracking-tight">{t(lang, "bookings_title")}</h1>
      <p className="mt-2 text-sm text-muted">Confirmed, on the way, arrived, started, done, then paid. Nothing skips a step.</p>
      <div className="mt-6 grid gap-3">
        {mine.length === 0 && (
          <div className="rounded-3xl border border-line bg-card p-6">
            {session ? (
              <>
                <p>{t(lang, "empty_bookings")}</p>
                <Link to="/" className="mt-3 inline-block font-semibold">Find a machine</Link>
              </>
            ) : (
              <>
                <p>Sign in to see bookings associated with your account.</p>
                <Link to="/account" className="mt-3 inline-block font-semibold">Sign in</Link>
              </>
            )}
          </div>
        )}
        {mine.map((booking) => {
          const provider = providers.find((p) => p.id === booking.providerId);
          const service = getService(booking.serviceId);
          return (
            <Link
              key={booking.id}
              to="/bookings/$bookingId"
              params={{ bookingId: booking.id }}
              className="rounded-2xl border border-line bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-muted">{booking.code}</div>
                  <div className="font-display text-xl font-bold">{service?.name}</div>
                  <div className="text-sm text-muted">
                    {provider?.name} · {booking.site.label}
                  </div>
                </div>
                <div className="text-right">
                  <StatusPill status={booking.status} />
                  <div className="mt-2 font-semibold">{inr(booking.amount)}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
