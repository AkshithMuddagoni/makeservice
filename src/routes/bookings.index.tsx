import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { StatusPill } from "@/components/fieldly/bits";
import { authClient, authEnabled } from "@/lib/auth/client";
import { getCurrentAssignedOperatorBookings } from "@/lib/fieldly/account.functions";
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
  const { data: authSession, isPending: authSessionPending } = authClient.useSession();
  const [operatorBookings, setOperatorBookings] = useState<Awaited<ReturnType<typeof getCurrentAssignedOperatorBookings>>>([]);
  const [operatorBookingsLoading, setOperatorBookingsLoading] = useState(false);
  useEffect(() => {
    if (!authEnabled || !authSession?.user) {
      setOperatorBookings([]);
      return;
    }
    let cancelled = false;
    setOperatorBookingsLoading(true);
    void getCurrentAssignedOperatorBookings()
      .then((items) => {
        if (!cancelled) setOperatorBookings(items);
      })
      .catch(() => {
        if (!cancelled) setOperatorBookings([]);
      })
      .finally(() => {
        if (!cancelled) setOperatorBookingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authSession?.user.id]);
  const mine = session?.role === "customer"
    ? bookings.filter((b) => b.customerPhone === session.phone)
    : session?.role === "provider" && session.providerId
      ? bookings.filter((b) => b.providerId === session.providerId)
      : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-4xl font-bold tracking-tight">{t(lang, "bookings_title")}</h1>
      <p className="mt-2 text-sm text-muted">Confirmed, on the way, arrived, started, done, then paid. Nothing skips a step.</p>
      {authEnabled && authSession?.user && (
        <section className="mt-7">
          <h2 className="font-display text-2xl font-bold">Assigned operator jobs</h2>
          <p className="mt-1 text-sm text-muted">Bookings assigned to your approved operator profile.</p>
          <div className="mt-3 grid gap-3">
            {operatorBookingsLoading && (
              <div className="rounded-2xl border border-line bg-card p-4 text-sm text-muted">Loading assigned jobs…</div>
            )}
            {!operatorBookingsLoading && operatorBookings.length === 0 && (
              <div className="rounded-2xl border border-line bg-card p-4 text-sm text-muted">
                No bookings are assigned to your operator account yet. Once a provider accepts a customer quote and assigns you, the booking will appear here.
              </div>
            )}
            {operatorBookings.map((booking) => (
              <Link
                key={booking.bookingId}
                to="/bookings/$bookingId"
                params={{ bookingId: booking.bookingId }}
                className="rounded-2xl border border-line bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-muted">{booking.publicReference}</p>
                    <p className="font-display text-xl font-bold">{getService(booking.serviceId)?.name ?? booking.serviceId}</p>
                    <p className="mt-1 text-sm text-muted">{booking.businessName} · {booking.siteLabel}</p>
                    <p className="mt-1 text-xs text-muted">
                      {booking.assignedAssetLabel ? `Machine: ${booking.assignedAssetLabel}` : "Machine not assigned"}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusPill status={booking.status} />
                    <p className="mt-2 font-semibold">{inr(booking.amountPaise / 100)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

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
