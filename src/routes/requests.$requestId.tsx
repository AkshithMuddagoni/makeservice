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
import { authEnabled } from "@/lib/auth/client";
import { acceptCurrentProviderQuote, getCurrentJobRequestDetail } from "@/lib/fieldly/account.functions";

export const Route = createFileRoute("/requests/$requestId")({ component: RequestPage });

type LiveRequestDetail = {
  id: string;
  serviceId: string;
  status: "open" | "booked" | "cancelled" | "expired";
  createdAt: string;
  whenLabel: string;
  notes: string;
  requirements: Record<string, string>;
  site: { label: string; area: string; city: string; district?: string; state: string; pincode?: string; address?: string; landmark?: string; lat: number; lng: number };
  provider: { businessId: string; name: string; area: string; city: string; state: string; latitude: number; longitude: number; yearsExperience: number };
  distanceKm: number;
  quotes: Array<{
    id: string;
    businessId: string;
    providerName: string;
    amountPaise: number;
    currency: string;
    note: string;
    inclusions: string[];
    exclusions: string[];
    extraCharges: Array<{ label: string; amountPaise: number }>;
    cancellationTerms: string;
    etaMinutes: number | null;
    status: "pending" | "accepted" | "declined" | "withdrawn" | "expired";
    createdAt: string;
    expiresAt: string | null;
  }>;
  booking: {
    id: string;
    publicReference: string;
    amountPaise: number;
    status: string;
  } | null;
};

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
  const [liveRequest, setLiveRequest] = useState<LiveRequestDetail | null>(null);
  const [liveRequestLoading, setLiveRequestLoading] = useState(authEnabled);
  const [liveRequestError, setLiveRequestError] = useState("");
  const [liveQuoteConsent, setLiveQuoteConsent] = useState<Record<string, boolean>>({});
  const [acceptingLiveQuoteId, setAcceptingLiveQuoteId] = useState<string | null>(null);
  const [refreshingLiveRequest, setRefreshingLiveRequest] = useState(false);
  const [liveRefreshKey, setLiveRefreshKey] = useState(0);
  const [shown, setShown] = useState(1);
  const [quoteConsent, setQuoteConsent] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!authEnabled) return;
    let cancelled = false;
    setLiveRequestLoading(true);
    setLiveRequestError("");
    void getCurrentJobRequestDetail({ data: { requestId } })
      .then((result) => {
        if (!cancelled) setLiveRequest(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLiveRequestError(error instanceof Error ? error.message : "Could not load this request.");
      })
      .finally(() => {
        if (!cancelled) setLiveRequestLoading(false);
      });
    return () => { cancelled = true; };
  }, [requestId, liveRefreshKey]);

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

  if (authEnabled) {
    if (liveRequestLoading) {
      return <main className="mx-auto max-w-3xl px-4 py-16 text-sm text-muted">Loading your saved request…</main>;
    }
    if (!liveRequest) {
      return (
        <main className="mx-auto max-w-xl px-4 py-16">
          <h1 className="font-display text-3xl font-bold">Request unavailable</h1>
          <p className="mt-2 text-sm text-muted">{liveRequestError || "This request does not exist or does not belong to the signed-in account."}</p>
          <Link to="/" className="mt-4 inline-block font-semibold">Back to home</Link>
        </main>
      );
    }
    const liveService = getService(liveRequest.serviceId);

    async function refreshLiveRequest() {
      setRefreshingLiveRequest(true);
      setLiveRequestError("");
      try {
        const result = await getCurrentJobRequestDetail({ data: { requestId } });
        setLiveRequest(result);
      } catch (error) {
        setLiveRequestError(error instanceof Error ? error.message : "Could not refresh request updates.");
      } finally {
        setRefreshingLiveRequest(false);
      }
    }

    async function acceptLiveQuote(quoteId: string) {
      if (!liveQuoteConsent[quoteId]) {
        toast.error("Review the quotation and accept the terms before confirming.");
        return;
      }
      setAcceptingLiveQuoteId(quoteId);
      try {
        const result = await acceptCurrentProviderQuote({
          data: { quoteId, termsAccepted: true },
        });
        await refreshLiveRequest();
        toast.success("Booking " + result.publicReference + " is confirmed. No payment has been taken.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The quote could not be accepted.");
      } finally {
        setAcceptingLiveQuoteId(null);
      }
    }

    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-field">Saved service request</p>
            <h1 className="mt-1 font-display text-3xl font-bold">{liveService?.name ?? liveRequest.serviceId}</h1>
            <p className="mt-2 text-sm text-muted">{liveRequest.site.label}, {liveRequest.site.area} · {liveRequest.whenLabel}</p>
          </div>
          {liveRequest.status === "open" && (
            <Button variant="secondary" disabled={refreshingLiveRequest} onClick={() => void refreshLiveRequest()}>
              {refreshingLiveRequest ? "Checking…" : "Check for quote updates"}
            </Button>
          )}
        </div>

        <section className="mt-5 rounded-2xl border border-line bg-card p-5">
          {liveRequest.booking ? (
            <>
              <div className="flex items-center gap-2 text-sm font-bold text-field">
                <BadgeCheck className="size-5" /> Booking confirmed
              </div>
              <h2 className="mt-2 font-display text-2xl font-bold">{liveRequest.booking.publicReference}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Agreed amount: <span className="font-semibold">{inr(liveRequest.booking.amountPaise / 100)}</span><br />
                Booking status: {liveRequest.booking.status.replaceAll("_", " ")}
              </p>
              <p className="mt-3 rounded-xl bg-paper p-3 text-sm leading-5">
                Your quote acceptance and booking are saved. Payment has not been collected or recorded. Do not pay outside the MakeService payment flow.
              </p>
              <Button asChild className="mt-3">
                <Link to="/bookings/$bookingId" params={{ bookingId: liveRequest.booking.id }}>Open booking details</Link>
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm font-bold text-field">
                <BadgeCheck className="size-5" /> Service request saved
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">
                Reference: <span className="font-mono font-semibold">{liveRequest.id}</span><br />
                Status: {liveRequest.status}<br />
                Sent to: {liveRequest.provider.name}<br />
                Provider base location: {formatKm(liveRequest.distanceKm)} away
              </p>
              <p className="mt-3 rounded-xl bg-paper p-3 text-sm leading-5">
                Your request is saved. Review a provider's quote before accepting it. No booking is confirmed and no payment has been taken yet.
              </p>
            </>
          )}
        </section>

        <section className="mt-4 rounded-2xl border border-line bg-card p-5">
          <h2 className="font-display text-lg font-bold">Work site</h2>
          <p className="mt-2 text-sm text-muted">{liveRequest.site.address || liveRequest.site.label}, {liveRequest.site.area}, {liveRequest.site.city}, {liveRequest.site.state}</p>
          {liveRequest.site.pincode && <p className="text-sm text-muted">PIN {liveRequest.site.pincode}</p>}
          {liveRequest.site.landmark && <p className="text-sm text-muted">Landmark: {liveRequest.site.landmark}</p>}
          <div className="mt-4 h-64 overflow-hidden rounded-xl">
            <MapCanvas center={liveRequest.site} markers={[
              { id: "site", lat: liveRequest.site.lat, lng: liveRequest.site.lng, label: "Your work site", kind: "site" },
              { id: liveRequest.provider.businessId, lat: liveRequest.provider.latitude, lng: liveRequest.provider.longitude, label: liveRequest.provider.name + " · base location", kind: "provider" },
            ]} />
          </div>
          <p className="mt-2 text-xs text-muted">The provider marker is the registered business base, not a live vehicle GPS location.</p>
        </section>

        <section className="mt-4 rounded-2xl border border-line bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold">Service requirements</h2>
            <span className="text-xs text-muted">{Object.keys(liveRequest.requirements).length} item(s)</span>
          </div>
          <ul className="mt-2 grid gap-2 text-sm">
            {Object.entries(liveRequest.requirements).map(([key, value]) => (
              <li key={key} className="flex justify-between gap-4 border-b border-line pb-2">
                <span className="text-muted">{key.replaceAll("_", " ")}</span>
                <span className="text-right font-semibold">{value}</span>
              </li>
            ))}
          </ul>
          {liveRequest.notes && <p className="mt-3 text-sm text-muted">Note: {liveRequest.notes}</p>}
        </section>

        <section className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold">Provider quotations</h2>
            <span className="text-xs text-muted">{liveRequest.quotes.length} quote(s)</span>
          </div>
          {liveRequest.quotes.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-line bg-card p-4">
              <p className="font-semibold">Waiting for the provider's response.</p>
              <p className="mt-1 text-sm leading-5 text-muted">Use “Check for quote updates” to refresh. You are not booked or charged while no quote is accepted.</p>
            </div>
          ) : (
            <div className="mt-3 grid gap-3">
              {liveRequest.quotes.map((quote) => (
                <article key={quote.id} className="rounded-2xl border border-line bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-xl font-bold">{quote.providerName}</h3>
                      <p className="mt-1 text-xs text-muted">
                        {quote.etaMinutes === null ? "Arrival estimate not provided" : "Estimated arrival: " + quote.etaMinutes + " minutes"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold">{inr(quote.amountPaise / 100)}</p>
                      <p className="text-xs text-muted">{quote.status.replaceAll("_", " ")}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-5">{quote.note}</p>
                  {quote.inclusions.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Included</p>
                      <ul className="mt-1 grid gap-1 text-sm">{quote.inclusions.map((item, i) => <li key={i}>• {item}</li>)}</ul>
                    </div>
                  )}
                  {quote.exclusions.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Excluded</p>
                      <ul className="mt-1 grid gap-1 text-sm text-muted">{quote.exclusions.map((item, i) => <li key={i}>• {item}</li>)}</ul>
                    </div>
                  )}
                  {quote.extraCharges.length > 0 && (
                    <div className="mt-3 rounded-xl bg-paper p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Additional charges</p>
                      {quote.extraCharges.map((item, i) => (
                        <p key={i} className="mt-1 flex justify-between gap-3 text-sm"><span>{item.label}</span><span className="font-semibold">{inr(item.amountPaise / 100)}</span></p>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 rounded-xl bg-paper p-3 text-sm leading-5">
                    <p className="font-semibold">Cancellation & rescheduling</p>
                    <p className="mt-1">{quote.cancellationTerms}</p>
                  </div>
                  {quote.status === "pending" && liveRequest.status === "open" && (
                    <>
                      <label className="mt-4 flex items-start gap-3 rounded-xl border border-line bg-white p-3 text-sm leading-5">
                        <input
                          type="checkbox"
                          checked={Boolean(liveQuoteConsent[quote.id])}
                          onChange={(event) => setLiveQuoteConsent((current) => ({ ...current, [quote.id]: event.target.checked }))}
                          className="mt-1 size-4 shrink-0 accent-emerald-600"
                        />
                        <span>I reviewed the total price, inclusions, exclusions, additional charges and cancellation terms. I agree to confirm the booking on this quotation. Any changes must be agreed before extra work starts.</span>
                      </label>
                      <Button
                        className="mt-3"
                        disabled={!liveQuoteConsent[quote.id] || acceptingLiveQuoteId !== null}
                        onClick={() => void acceptLiveQuote(quote.id)}
                      >
                        {acceptingLiveQuoteId === quote.id ? "Confirming…" : "Accept quote & confirm booking"}
                      </Button>
                    </>
                  )}
                  {quote.status === "accepted" && <p className="mt-3 text-sm font-semibold text-field">Accepted for this booking</p>}
                </article>
              ))}
            </div>
          )}
        </section>

        {liveRequestError && <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">{liveRequestError}</p>}
        <Button asChild variant="secondary" className="mt-5"><Link to="/">Back to home</Link></Button>
      </main>
    );
  }

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
                <a
                  href={`tel:${provider.phone}`}
                  className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-field px-4 text-sm font-semibold text-on-field hover:bg-ink"
                >
                  Call operator · {provider.phone}
                </a>
              )}
              {quote.status === "pending" && request.status === "open" && (
                <label className="mt-4 flex items-start gap-3 rounded-xl border border-line bg-white p-3 text-sm leading-5">
                  <input
                    type="checkbox"
                    checked={Boolean(quoteConsent[quote.id])}
                    onChange={(event) => setQuoteConsent((current) => ({ ...current, [quote.id]: event.target.checked }))}
                    className="mt-1 size-4 shrink-0 accent-emerald-600"
                  />
                  <span>
                    I have reviewed the total price, included work, exclusions, extra fees, rescheduling terms, arrival estimate and the details I submitted. I agree to proceed on these quoted terms. Any scope or price change must be agreed before extra work starts.
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
