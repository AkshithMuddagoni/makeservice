import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { BadgeCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChatBox, Stars, requirementLines } from "@/components/fieldly/bits";
import { MapCanvas } from "@/components/fieldly/map-canvas";
import { Button } from "@/components/ui/button";
import { getService } from "@/lib/fieldly/catalog";
import { inr, timeAgo } from "@/lib/fieldly/format";
import { formatKm, kmBetween } from "@/lib/fieldly/geo";
import { useFieldly, useProviders } from "@/lib/fieldly/store";

export const Route = createFileRoute("/requests/$requestId")({ component: RequestPage });

function RequestPage() {
  const { requestId } = Route.useParams();
  const navigate = useNavigate();
  const request = useFieldly((s) => s.requests.find((r) => r.id === requestId));
  const session = useFieldly((s) => s.session);
  const canViewRequest = Boolean(request && (
    (session?.role === "customer" && session.phone === request.customerPhone) ||
    (session?.role === "provider" && session.providerId && request.targetedProviderIds.includes(session.providerId))
  ));
  const allQuotes = useFieldly((s) => s.quotes);
  const quotes = useMemo(
    () => allQuotes.filter((q) => q.requestId === requestId),
    [allQuotes, requestId],
  );
  const acceptQuote = useFieldly((s) => s.acceptQuote);
  const cancelRequest = useFieldly((s) => s.cancelRequest);
  const sendMessage = useFieldly((s) => s.sendMessage);
  const providers = useProviders();
  const [shown, setShown] = useState(1);
  const [quoteConsent, setQuoteConsent] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!request) return;
    const age = Date.now() - request.createdAt;
    if (age > 4000) {
      setShown(quotes.length);
      return;
    }
    setShown(1);
    if (quotes.length <= 1) return;
    const timers = quotes.slice(1).map((_, i) => setTimeout(() => setShown(i + 2), 700 * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, [request, quotes.length, requestId]);

  if (!request || !canViewRequest) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <h1 className="font-display text-3xl font-bold">Request unavailable</h1>
        <p className="mt-2 text-sm text-muted">Sign in as the customer or an operator invited to quote on this request.</p>
        <Link to="/account" className="mt-3 inline-block font-semibold">Account sign in</Link>
      </div>
    );
  }

  const service = getService(request.serviceId);
  const visible = quotes.slice(0, shown);
  const pending = quotes.filter((q) => q.status === "pending");
  const selectedProvider = providers.find((p) => p.id === request.targetedProviderIds[0]);
  const providerDeclined = Boolean(
    selectedProvider && request.declinedProviderIds?.includes(selectedProvider.id),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-field">
        {request.status === "open" ? "Quotes" : request.status}
      </p>
      <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">{service?.name}</h1>
      <p className="mt-2 text-sm text-muted">
        {request.site.label}, {request.site.area} · {request.whenLabel} · opened {timeAgo(request.createdAt)}
      </p>
      <section className="mt-4 rounded-2xl border border-line bg-card p-4">
        <div className="text-xs font-extrabold uppercase tracking-wider text-muted">Selected provider</div>
        {selectedProvider ? (
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-bold">{selectedProvider.name}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                <Stars value={selectedProvider.rating} />
                {selectedProvider.rating.toFixed(1)} · {selectedProvider.reviewCount} reviews · {formatKm(kmBetween(request.site, selectedProvider))} away
              </div>
            </div>
            <span className={providerDeclined ? "rounded-lg bg-danger-soft px-2 py-1 text-xs font-semibold text-danger" : request.status === "booked" ? "rounded-lg bg-field-soft px-2 py-1 text-xs font-semibold text-field" : "rounded-lg bg-gold-soft px-2 py-1 text-xs font-semibold text-gold"}>
              {providerDeclined ? "Declined" : request.status === "booked" ? "Booking confirmed" : quotes.length ? "Responded" : "Awaiting response"}
            </span>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Provider details are unavailable.</p>
        )}
        <p className="mt-2 text-sm text-muted">{request.site.address || request.site.label}, {request.site.area}, {request.site.city}, {request.site.state}</p>
        {request.site.pincode && <p className="text-sm text-muted">PIN {request.site.pincode}</p>}
        {request.siteImages?.length ? (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {request.siteImages.map((image, index) => (
              <img key={image.slice(-36)} src={image} alt={`Work-site photo ${index + 1}`} className="h-24 w-full rounded-xl border border-line object-cover" />
            ))}
          </div>
        ) : null}
      </section>
      {selectedProvider && (
        <section className="mt-4">
          <div className="mb-2 font-display text-lg font-bold">Work site and selected provider</div>
          <div className="h-64">
            <MapCanvas
              center={request.site}
              markers={[
                { id: "site", lat: request.site.lat, lng: request.site.lng, label: "Your work site", kind: "site" },
                { id: selectedProvider.id, lat: selectedProvider.lat, lng: selectedProvider.lng, label: `${selectedProvider.name} · ${formatKm(kmBetween(request.site, selectedProvider))}`, kind: "vehicle" },
              ]}
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">
            Provider pin represents the listed base location, not a live vehicle. Live tracking becomes available only when a provider explicitly shares GPS during an accepted booking and the production backend supports it.
          </p>
        </section>
      )}
      <ul className="mt-3 flex flex-wrap gap-2 text-sm">
        {requirementLines(request.serviceId, request.requirements).map((row) => (
          <li key={row.label} className="rounded-full bg-card px-3 py-1">
            {row.label}: {row.value}
          </li>
        ))}
      </ul>
      {request.notes && <p className="mt-3 text-sm text-muted">Note: {request.notes}</p>}

      <div className="mt-6 grid gap-3">
        {visible.map((quote) => {
          const provider = providers.find((p) => p.id === quote.providerId);
          if (!provider) return null;
          const km = kmBetween(request.site, provider);
          return (
            <article key={quote.id} className="rounded-3xl border border-line bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    to="/providers/$providerId"
                    params={{ providerId: provider.id }}
                    search={{ service: request.serviceId }}
                    className="inline-flex items-center gap-1 font-display text-xl font-bold"
                  >
                    {provider.name}
                    <BadgeCheck className="size-4 text-field" />
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <Stars value={provider.rating} />
                    {provider.rating.toFixed(1)} · {formatKm(km)} · about {quote.etaMin} min to site
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display text-3xl font-bold">{inr(quote.amount)}</div>
                  <div className="text-xs text-muted">{quote.summary}</div>
                </div>
              </div>
              <ul className="mt-3 grid gap-1 text-sm">
                {quote.includes.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-muted">{quote.note}</p>
              {quote.status === "pending" && request.status === "open" && (
                <label className="mt-4 flex items-start gap-3 rounded-xl border border-line bg-white p-3 text-sm leading-5">
                  <input
                    type="checkbox"
                    checked={Boolean(quoteConsent[quote.id])}
                    onChange={(event) => setQuoteConsent((current) => ({ ...current, [quote.id]: event.target.checked }))}
                    className="mt-1 size-4 shrink-0 accent-emerald-600"
                  />
                  <span>
                    I have reviewed this provider's price, included work, note, arrival estimate and the details I submitted. I agree to proceed on these quoted terms. Any change in scope or price must be agreed before extra work starts.
                  </span>
                </label>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {quote.status === "pending" && request.status === "open" && (
                  <Button
                    disabled={!quoteConsent[quote.id]}
                    onClick={() => {
                      const result = acceptQuote(quote.id, Boolean(quoteConsent[quote.id]));
                      if (!result.ok || !result.id) {
                        toast.error(!result.ok ? result.error : "Could not book.");
                        return;
                      }
                      toast.success("Quote accepted. Booking confirmed.");
                      void navigate({ to: "/bookings/$bookingId", params: { bookingId: result.id } });
                    }}
                  >
                    Accept quote & confirm booking
                  </Button>
                )}
                {quote.status === "accepted" && <span className="text-sm font-semibold text-field">Accepted</span>}
                {quote.status === "declined" && <span className="text-sm text-muted">Declined</span>}
              </div>
            </article>
          );
        })}
        {shown < quotes.length && (
          <p className="rounded-2xl bg-gold-soft px-4 py-3 text-sm font-semibold text-gold">
            Another operator is pricing this job…
          </p>
        )}
        {quotes.length === 0 && !providerDeclined && request.status === "open" && (
          <div className="rounded-2xl border border-line bg-card p-4">
            <p className="font-semibold">Waiting for {selectedProvider?.name ?? "the selected provider"} to respond.</p>
            <p className="mt-1 text-sm leading-5 text-muted">
              The provider may accept by sending a quote or decline. You will not be charged or booked while this request is waiting.
            </p>
          </div>
        )}
        {providerDeclined && request.status === "open" && (
          <div className="rounded-2xl border border-danger/25 bg-danger-soft p-4">
            <p className="font-semibold text-danger">The selected provider declined this request.</p>
            <p className="mt-1 text-sm leading-5 text-muted">You can choose another nearby provider. Your service details remain saved.</p>
            <Button asChild className="mt-3">
              <Link to="/find/$slug" params={{ slug: request.serviceId }}>Choose another provider</Link>
            </Button>
          </div>
        )}
      </div>

      {request.status === "open" && (
        <Button
          variant="danger"
          className="mt-4"
          onClick={() => {
            const result = cancelRequest(request.id);
            if (!result.ok) toast.error(result.error);
            else toast.success("Request cancelled.");
          }}
        >
          Cancel request
        </Button>
      )}
      {quotes.length > 0 && pending.length === 0 && request.status === "open" && !providerDeclined && (
        <p className="mt-3 text-sm text-muted">This quote is no longer available. Choose another provider or cancel this request.</p>
      )}

      <h2 className="mt-8 font-display text-xl font-bold">Job chat</h2>
      {quotes.length > 0 ? (
        <div className="mt-3">
          <ChatBox messages={request.messages} onSend={(text) => {
            const result = sendMessage("request", request.id, text);
            if (!result.ok) toast.error(result.error);
          }} />
        </div>
      ) : (
        <p className="mt-2 rounded-xl bg-paper p-3 text-sm leading-5 text-muted">
          Chat opens after the selected provider responds. Phone numbers stay private until a quote is accepted and the booking is confirmed.
        </p>
      )}
    </div>
  );
}
