import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { StatusPill, requirementLines } from "@/components/fieldly/bits";
import { Button } from "@/components/ui/button";
import { getService, isEligible } from "@/lib/fieldly/catalog";
import { inr } from "@/lib/fieldly/format";
import { formatKm, kmBetween } from "@/lib/fieldly/geo";
import { priceJob } from "@/lib/fieldly/pricing";
import { t } from "@/lib/fieldly/i18n";
import { useFieldly, useProviders } from "@/lib/fieldly/store";
import type { SiteImage } from "@/lib/fieldly/types";
import { z } from "zod";

export const Route = createFileRoute("/desk")({ component: DeskPage });

const phoneSchema = z.string().regex(/^[6-9]\d{9}$/);

function DeskPage() {
  const lang = useFieldly((s) => s.lang);
  const session = useFieldly((s) => s.session);
  const providers = useProviders();
  const signInProvider = useFieldly((s) => s.signInProvider);
  const [phone, setPhone] = useState("9000000001");
  const [code, setCode] = useState("");

  function enter(e: FormEvent) {
    e.preventDefault();
    if (!phoneSchema.safeParse(phone).success) {
      toast.error("Use a 10-digit mobile, for example 9000000001.");
      return;
    }
    if (code.trim() !== "482609") {
      toast.error("Preview code is 482609.");
      return;
    }
    const match = providers.find((p) => p.phone === phone);
    if (!match) {
      toast.error("No machine is listed on that number. Join first.");
      return;
    }
    signInProvider(match.id);
  }

  if (session?.role !== "provider" || !session.providerId) {
    const demos = providers.filter((p) => p.phone.startsWith("900000000"));
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <h1 className="font-display text-4xl font-bold">{t(lang, "desk_title")}</h1>
        <p className="mt-2 text-sm text-muted">
          Same preview code as customers, <span className="font-semibold text-ink">482609</span>. Demo rigs use
          9000000001 to 9000000004.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {demos.slice(0, 4).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPhone(p.phone)}
              className="rounded-full border border-line bg-card px-3 py-2 text-left text-xs font-semibold"
            >
              {p.name}
              <span className="block text-muted">{p.phone}</span>
            </button>
          ))}
        </div>
        <form onSubmit={enter} className="mt-4 grid gap-3 rounded-3xl border border-line bg-card p-5">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            className="h-12 rounded-xl border border-line px-3 text-base outline-none"
          />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="482609"
            className="h-12 rounded-xl border border-line px-3 text-center font-display text-2xl tracking-widest outline-none"
          />
          <Button type="submit" size="lg">
            Open desk
          </Button>
          <Link to="/join" className="text-center text-sm font-semibold">
            List a new machine
          </Link>
        </form>
      </div>
    );
  }

  return <DeskHome providerId={session.providerId} />;
}

function DeskHome({ providerId }: { providerId: string }) {
  const provider = useProviders().find((p) => p.id === providerId);
  const requests = useFieldly((s) => s.requests);
  const quotes = useFieldly((s) => s.quotes);
  const bookings = useFieldly((s) => s.bookings);
  const online = useFieldly((s) => s.isOnline(providerId));
  const setOnline = useFieldly((s) => s.setOnline);
  const sendQuote = useFieldly((s) => s.sendQuote);
  const declineRequest = useFieldly((s) => s.declineRequest);
  const [tab, setTab] = useState<"requests" | "jobs" | "earnings">("requests");

  const openJobs = useMemo(() => {
    if (!provider) return [];
    return requests
      .filter((r) =>
        r.status === "open" &&
        r.targetedProviderIds.includes(provider.id) &&
        provider.services.includes(r.serviceId) &&
        !quotes.some((q) => q.requestId === r.id && q.providerId === provider.id && q.status === "declined"),
      )
      .map((r) => ({ r, km: kmBetween(provider, r.site) }))
      .filter((row) => {
        const service = getService(row.r.serviceId);
        return service ? row.km <= service.radiusKm + 10 : false;
      })
      .sort((a, b) => a.km - b.km);
  }, [requests, provider, quotes]);

  const mine = bookings.filter((b) => b.providerId === providerId);
  const earned = mine.filter((b) => b.status === "PAID").reduce((sum, b) => sum + b.amount, 0);

  if (!provider) return <p className="px-4 py-10">Operator missing.</p>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-field">Operator desk</p>
          <h1 className="font-display text-4xl font-bold tracking-tight">{provider.name}</h1>
          <p className="text-sm text-muted">
            {provider.area} · {provider.phone}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOnline(provider.id, !online)}
          className={
            online
              ? "h-11 rounded-full bg-field px-4 text-sm font-semibold text-on-field"
              : "h-11 rounded-full bg-ink px-4 text-sm font-semibold text-on-ink"
          }
        >
          {online ? "Online" : "Offline"}
        </button>
      </div>
      {!provider.approved && (
        <p className="mt-4 rounded-2xl bg-gold-soft p-4 text-sm text-gold">
          Papers are still in review, so customers cannot see you. Approve for this preview from the join confirmation,
          or check the listing page.
        </p>
      )}
      {!isEligible(provider, provider.services[0] ?? "") && provider.approved && (
        <p className="mt-4 rounded-2xl bg-danger-soft p-4 text-sm text-danger">
          Not eligible for {provider.services[0]}. Identity, equipment
          {provider.services.includes("borewell") ? " and a WALTA number" : ""} are required.
        </p>
      )}
      <div className="mt-5 flex gap-2">
        {(
          [
            ["requests", "Requests"],
            ["jobs", "Jobs"],
            ["earnings", "Earnings"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={
              tab === key
                ? "h-10 rounded-xl bg-ink px-3 text-sm font-semibold text-on-ink"
                : "h-10 rounded-xl border border-line bg-card px-3 text-sm font-semibold"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "requests" && (
        <div className="mt-4 grid gap-3">
          {openJobs.length === 0 && (
            <p className="rounded-2xl bg-card p-4 text-sm text-muted">No open requests in range. Stay online.</p>
          )}
          {openJobs.map(({ r, km }) => (
            <QuoteCard
              key={r.id}
              requestId={r.id}
              title={getService(r.serviceId)?.name ?? r.serviceId}
              place={`${r.site.address || r.site.label}, ${r.site.city}, ${r.site.state} · ${formatKm(km)} straight-line`}
              lines={requirementLines(r.serviceId, r.requirements)}
              whenLabel={r.whenLabel}
              notes={r.notes}
              siteImages={r.siteImages ?? []}
              suggested={priceJob(r.serviceId, provider, r.requirements).amount}
              existing={quotes.find((q) => q.requestId === r.id && q.providerId === provider.id && (q.status === "draft" || q.status === "pending"))}
              onSend={(amount, note) => {
                const result = sendQuote(r.id, amount, note);
                if (!result.ok) toast.error(result.error);
                else toast.success("Quote sent.");
              }}
              onDecline={() => {
                const result = declineRequest(r.id);
                if (!result.ok) toast.error(result.error);
              }}
            />
          ))}
        </div>
      )}

      {tab === "jobs" && (
        <div className="mt-4 grid gap-3">
          {mine.length === 0 && <p className="text-sm text-muted">No accepted jobs yet.</p>}
          {mine.map((b) => (
            <Link
              key={b.id}
              to="/bookings/$bookingId"
              params={{ bookingId: b.id }}
              className="flex items-center justify-between rounded-2xl border border-line bg-card p-4"
            >
              <span>
                <span className="block font-semibold">
                  {b.code} · {getService(b.serviceId)?.name}
                </span>
                <span className="text-sm text-muted">{b.site.label}</span>
              </span>
              <StatusPill status={b.status} />
            </Link>
          ))}
        </div>
      )}

      {tab === "earnings" && (
        <div className="mt-4 rounded-3xl border border-line bg-card p-5">
          <div className="text-sm text-muted">Recorded on paid jobs</div>
          <div className="font-display text-4xl font-bold">{inr(earned)}</div>
          <p className="mt-2 text-sm text-muted">
            {mine.filter((b) => b.status === "PAID").length} paid · {mine.length} bookings. Preview totals stay on this
            device.
          </p>
        </div>
      )}
    </div>
  );
}

function QuoteCard({
  requestId,
  title,
  place,
  lines,
  whenLabel,
  notes,
  siteImages,
  suggested,
  existing,
  onSend,
  onDecline,
}: {
  requestId: string
  title: string
  place: string
  lines: { label: string; value: string }[]
  whenLabel: string
  notes: string
  siteImages: SiteImage[]
  suggested: number
  existing?: { amount: number; note: string }
  onSend: (amount: number, note: string) => void
  onDecline: () => void
}) {
  const [amount, setAmount] = useState(String(existing?.amount && existing.amount > 0 ? existing.amount : suggested));
  const [note, setNote] = useState(existing?.note ?? "");
  return (
    <article className="rounded-3xl border border-line bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <p className="text-sm text-muted">
            {place} · {whenLabel}
          </p>
          {existing?.amount === 0 && (
            <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-950">
              New request: check the details, then send your own price and included work. The suggested amount is only a preview starting point, not a customer offer.
            </p>
          )}
        </div>
        <span className="text-xs text-muted">{requestId.slice(-4)}</span>
      </div>
      <ul className="mt-2 text-sm text-muted">
        {lines.map((row) => (
          <li key={row.label}>
            {row.label}: {row.value}
          </li>
        ))}
        {notes && <li>Note: {notes}</li>}
      </ul>
      {siteImages.length > 0 && (
        <section className="mt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Customer site photos</h3>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:max-w-xs">
            {siteImages.map((photo, index) => (
              <a key={photo.name + index} href={photo.dataUrl} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-line">
                <img src={photo.dataUrl} alt={photo.name} className="h-20 w-full object-cover" />
                <span className="block truncate px-2 py-1 text-[10px] text-muted">{photo.name}</span>
              </a>
            ))}
          </div>
        </section>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
          className="h-11 w-36 rounded-xl border border-line px-3 text-base outline-none"
          aria-label="Quote amount"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note to the customer"
          className="h-11 min-w-48 flex-1 rounded-xl border border-line px-3 text-base outline-none"
        />
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={() => onSend(Number(amount), note)}>{existing && existing.amount > 0 ? "Update quote" : "Send quote"}</Button>
        <Button variant="secondary" onClick={onDecline}>
          Decline
        </Button>
      </div>
    </article>
  );
}
