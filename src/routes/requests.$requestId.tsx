import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { BadgeCheck } from "lucide-react";
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
    () => allQuotes.filter((q) => q.requestId === requestId),
    [allQuotes, requestId],
  );
  const acceptQuote = useFieldly((s) => s.acceptQuote);
  const cancelRequest = useFieldly((s) => s.cancelRequest);
  const sendMessage = useFieldly((s) => s.sendMessage);
  const providers = useProviders();
  const [shown, setShown] = useState(1);

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-field">
        {request.status === "open" ? "Quotes" : request.status}
      </p>
      <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">{service?.name}</h1>
      <p className="mt-2 text-sm text-muted">
        {request.site.label}, {request.site.area} · {request.whenLabel} · opened {timeAgo(request.createdAt)}
      </p>
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
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {quote.status === "pending" && request.status === "open" && (
                  <Button
                    onClick={() => {
                      const result = acceptQuote(quote.id);
                      if (!result.ok || !result.id) {
                        toast.error(!result.ok ? result.error : "Could not book.");
                        return;
                      }
                      toast.success("Booking confirmed.");
                      void navigate({ to: "/bookings/$bookingId", params: { bookingId: result.id } });
                    }}
                  >
                    Accept quote
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
        {quotes.length === 0 && <p className="text-sm text-muted">No quotes yet.</p>}
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
      {pending.length === 0 && request.status === "open" && (
        <p className="mt-3 text-sm text-muted">Every quote was declined. Cancel and try another site or service.</p>
      )}

      <h2 className="mt-8 font-display text-xl font-bold">Job chat</h2>
      <div className="mt-3">
        <ChatBox messages={request.messages} onSend={(text) => sendMessage("request", request.id, text)} />
      </div>
    </div>
  );
}
