import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { BadgeCheck, CheckCircle2, MapPin, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChatBox, Stars, requirementLines } from "@/components/fieldly/bits";
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
    () => allQuotes.filter((q) => q.requestId === requestId && q.status !== "draft"),
    [allQuotes, requestId],
  );
  const acceptQuote = useFieldly((s) => s.acceptQuote);
  const cancelRequest = useFieldly((s) => s.cancelRequest);
  const sendMessage = useFieldly((s) => s.sendMessage);
  const providers = useProviders();
  const [shown, setShown] = useState(1);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    if (!request) return;
    const age = Date.now() - request.createdAt;
    if (age > 4000) {
      setShown(quotes.length);
      return;
    }
    setShown(Math.min(1, quotes.length));
    if (quotes.length <= 1) return;
    const timers = quotes.slice(1).map((_, i) => setTimeout(() => setShown(i + 2), 700 * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, [request, quotes.length, requestId]);

  useEffect(() => {
    setTermsAccepted(false);
  }, [selectedQuoteId]);

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
  const selectedQuote = quotes.find((q) => q.id === selectedQuoteId && q.status === "pending");
  const selectedProvider = selectedQuote ? providers.find((p) => p.id === selectedQuote.providerId) : null;
  const invitedCount = request.targetedProviderIds.length;
  const respondedCount = quotes.length;

  function confirmBooking() {
    if (!selectedQuote) {
      toast.error("Choose an available operator quote first.");
      return;
    }
    if (!termsAccepted) {
      toast.error("Review and confirm the job details before booking.");
      return;
    }
    const result = acceptQuote(selectedQuote.id);
    if (!result.ok || !result.id) {
      toast.error(!result.ok ? result.error : "Could not book.");
      return;
    }
    toast.success("Booking confirmed.");
    void navigate({ to: "/bookings/$bookingId", params: { bookingId: result.id } });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-field">
        {request.status === "open" ? "Provider responses" : request.status}
      </p>
      <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">{service?.name}</h1>
      <p className="mt-2 text-sm text-muted">
        {request.site.label}, {request.site.area} · {request.whenLabel} · opened {timeAgo(request.createdAt)}
      </p>

      <section className="mt-4 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-semibold">Your submitted job details</h2>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {requirementLines(request.serviceId, request.requirements).map((row) => (
            <li key={row.label} className="rounded-xl bg-white px-3 py-2">
              <span className="block text-xs text-muted">{row.label}</span>
              <span className="font-semibold">{row.value}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-start gap-2 text-sm text-muted">
          <MapPin className="mt-0.5 size-4 shrink-0 text-field" />
          <span>{request.site.address || request.site.label}, {request.site.area}, {request.site.city}, {request.site.state}{request.site.pincode ? " · " + request.site.pincode : ""}</span>
        </div>
        {request.notes && <p className="mt-3 text-sm"><span className="font-semibold">Operator note:</span> {request.notes}</p>}
        {request.siteImages?.length ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold">Site photos ({request.siteImages.length})</h3>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:max-w-md">
              {request.siteImages.map((photo, index) => (
                <a key={photo.name + index} href={photo.dataUrl} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-line">
                  <img src={photo.dataUrl} alt={photo.name} className="h-24 w-full object-cover" />
                  <span className="block truncate px-2 py-1 text-[11px] text-muted">{photo.name}</span>
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl font-bold">Available providers</h2>
          <p className="mt-1 text-sm text-muted">{respondedCount} response(s) received out of {invitedCount} invited provider(s).</p>
        </div>
        <p className="text-xs text-muted">Only a quote actually sent by an operator can be accepted.</p>
      </div>

      <div className="mt-4 grid gap-3">
        {visible.map((quote) => {
          const provider = providers.find((p) => p.id === quote.providerId);
          if (!provider) return null;
          const km = kmBetween(request.site, provider);
          const isAvailableQuote = quote.status === "pending" && request.status === "open";
          return (
            <article key={quote.id} className={"rounded-3xl border bg-card p-5 " + (selectedQuoteId === quote.id ? "border-field ring-1 ring-field/30" : "border-line")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to="/providers/$providerId"
                    params={{ providerId: provider.id }}
                    search={{ service: request.serviceId }}
                    className="inline-flex items-center gap-1 font-display text-xl font-bold"
                  >
                    {provider.name}
                    <BadgeCheck className="size-4 shrink-0 text-field" />
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Stars value={provider.rating} />
                    <span>{provider.rating.toFixed(1)} · {provider.reviewCount} reviews</span>
                    <span>{formatKm(km)} straight-line</span>
                    <span>{provider.jobs} jobs</span>
                  </div>
                  <p className="mt-2 text-sm text-muted">{provider.equipment} · {provider.years} years · {provider.languages.join(", ")}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                    <ShieldCheck className="size-3.5 text-field" />
                    {provider.verified.identity && provider.verified.equipment ? "Identity and equipment marked checked in listing" : "Some listing checks are incomplete"}
                  </p>
                </div>
                <div className="text-right">
                  {quote.status === "declined" ? (
                    <>
                      <div className="font-display text-xl font-bold text-muted">Unavailable</div>
                      <div className="text-xs text-muted">Provider declined</div>
                    </>
                  ) : (
                    <>
                      <div className="font-display text-2xl font-bold">{inr(quote.amount)}</div>
                      <div className="text-xs text-muted">{quote.summary}</div>
                    </>
                  )}
                </div>
              </div>
              {quote.status !== "declined" && (
                <>
                  <ul className="mt-3 grid gap-1 text-sm">
                    {quote.includes.map((item) => <li key={item}>✓ {item}</li>)}
                  </ul>
                  {quote.note && <p className="mt-2 text-sm text-muted">{quote.note}</p>}
                </>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {isAvailableQuote && (
                  <Button
                    onClick={() => setSelectedQuoteId(quote.id)}
                  >
                    {selectedQuoteId === quote.id ? "Selected for review" : "Review and choose"}
                  </Button>
                )}
                {quote.status === "accepted" && <span className="text-sm font-semibold text-field">Accepted</span>}
                {quote.status === "declined" && <span className="text-sm text-muted">This operator cannot take this request.</span>}
              </div>
            </article>
          );
        })}
        {shown < quotes.length && (
          <p className="rounded-2xl bg-gold-soft px-4 py-3 text-sm font-semibold text-gold">
            Another operator is preparing a response…
          </p>
        )}
        {quotes.length === 0 && request.status === "open" && (
          <div className="rounded-2xl border border-line bg-card p-5">
            <div className="flex items-center gap-2 font-semibold"><span className="size-2 animate-pulse rounded-full bg-field" /> Waiting for operators to respond</div>
            <p className="mt-2 text-sm leading-6 text-muted">Your request has been sent to {invitedCount} matching provider(s). They can send a quote or decline it. A draft price is not shown as an offer; you can book only after an operator submits a quote.</p>
          </div>
        )}
        {quotes.length > 0 && pending.length === 0 && request.status === "open" && (
          <p className="rounded-2xl bg-gold-soft px-4 py-3 text-sm font-semibold text-gold">
            No open quotes remain. Cancel and try another date, site, or service.
          </p>
        )}
      </div>

      {selectedQuote && selectedProvider && request.status === "open" && (
        <section className="mt-6 rounded-3xl border border-field/40 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-field">Final review</p>
          <h2 className="mt-1 font-display text-2xl font-bold">Confirm {selectedProvider.name}</h2>
          <p className="mt-1 text-sm text-muted">Review the exact scope and quote before a booking is created.</p>
          <div className="mt-4 grid gap-3 rounded-2xl bg-paper p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted">Provider quote</span>
              <span className="font-display text-2xl font-bold">{inr(selectedQuote.amount)}</span>
            </div>
            <p className="text-sm font-semibold">{selectedQuote.summary}</p>
            <div>
              <h3 className="text-sm font-semibold">Included in the quote</h3>
              <ul className="mt-2 grid gap-1 text-sm">
                {selectedQuote.includes.map((item) => <li key={item}>✓ {item}</li>)}
              </ul>
            </div>
            {selectedQuote.note && <p className="text-sm text-muted">{selectedQuote.note}</p>}
            <div>
              <h3 className="text-sm font-semibold">Your requirements</h3>
              <ul className="mt-2 grid gap-1 text-sm">
                {requirementLines(request.serviceId, request.requirements).map((row) => <li key={row.label}>{row.label}: {row.value}</li>)}
                <li>When: {request.whenLabel}</li>
              </ul>
            </div>
            {request.notes && <p className="text-sm">Operator note: {request.notes}</p>}
            <p className="text-xs leading-5 text-muted">Confirm access, permissions and any site safety constraints directly with the operator before work starts. The preview does not verify legal permissions.</p>
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-4 text-sm leading-6">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
              className="mt-1 size-5 shrink-0 accent-emerald-600"
            />
            <span>I have reviewed the work type, submitted site details, schedule, quoted amount and the operator's included work. I agree to proceed with this quote.</span>
          </label>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="secondary" className="sm:flex-1" onClick={() => { setSelectedQuoteId(null); setTermsAccepted(false); }}>Back to providers</Button>
            <Button className="sm:flex-1" disabled={!termsAccepted} onClick={confirmBooking}>Confirm booking</Button>
          </div>
        </section>
      )}

      {request.status === "open" && (
        <Button
          variant="danger"
          className="mt-5"
          onClick={() => {
            const result = cancelRequest(request.id);
            if (!result.ok) toast.error(result.error);
            else toast.success("Request cancelled.");
          }}
        >
          Cancel request
        </Button>
      )}

      <h2 className="mt-8 font-display text-xl font-bold">Request chat</h2>
      <p className="mt-1 text-xs text-muted">Use chat to clarify access, timing, and scope while quotes are pending. In this preview, messages stay in this browser.</p>
      <div className="mt-3">
        <ChatBox messages={request.messages} onSend={(text) => sendMessage("request", request.id, text)} />
      </div>
    </div>
  );
}
