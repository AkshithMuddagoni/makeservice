import { Link, createFileRoute } from "@tanstack/react-router";
import { Activity, ArrowUpRight, Banknote, BriefcaseBusiness, CalendarClock, CheckCircle2, ClipboardList, FileCheck2, History, LifeBuoy, MapPin, PauseCircle, PlayCircle, Plus, Settings2, ShieldCheck, Truck, UserRound, Wallet, Wrench } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { StatusPill, requirementLines } from "@/components/fieldly/bits";
import { Button } from "@/components/ui/button";
import { getService, isAvailableForService, isEligible, isServiceOperational } from "@/lib/fieldly/catalog";
import { inr } from "@/lib/fieldly/format";
import { formatKm, kmBetween } from "@/lib/fieldly/geo";
import { priceJob } from "@/lib/fieldly/pricing";
import { t } from "@/lib/fieldly/i18n";
import { useFieldly, useProviders } from "@/lib/fieldly/store";
import type { Booking, Provider } from "@/lib/fieldly/types";
import { cn } from "@/lib/utils";
import { z } from "zod";

export const Route = createFileRoute("/desk")({ component: DeskPage });

const phoneSchema = z.string().regex(/^[6-9]\d{9}$/);
type Tab = "overview" | "requests" | "jobs" | "fleet" | "earnings" | "business";
type JobFilter = "active" | "awaiting_payment" | "history" | "disputes";
const ACTIVE = ["CONFIRMED", "ON_THE_WAY", "ARRIVED", "SERVICE_STARTED"];

function DeskPage() {
  const lang = useFieldly((s) => s.lang);
  const session = useFieldly((s) => s.session);
  const providers = useProviders();
  const signInProvider = useFieldly((s) => s.signInProvider);
  const hydrated = useFieldly((s) => s.hydrated);
  const [phone, setPhone] = useState("9000000001");
  const [code, setCode] = useState("");

  function enter(e: FormEvent) {
    e.preventDefault();
    if (!phoneSchema.safeParse(phone).success) return toast.error("Use a valid 10-digit mobile number.");
    if (code.trim() !== "482609") return toast.error("Preview OTP is 482609.");
    const match = providers.find((p) => p.phone === phone);
    if (!match) return toast.error("No machine is listed on that number. Join first.");
    signInProvider(match.id);
  }

  if (session?.role !== "provider" || !session.providerId) {
    const demos = providers.filter((p) => p.phone.startsWith("900000000"));
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-field">Provider workspace</p>
        <h1 className="mt-1 font-display text-4xl font-bold">{t(lang, "desk_title")}</h1>
        <p className="mt-2 text-sm text-muted">Preview only · Demo OTP: <b>482609</b></p>
        <div className="mt-4 flex flex-wrap gap-2">
          {demos.slice(0, 6).map((p) => <button key={p.id} type="button" onClick={() => setPhone(p.phone)} className={cn("rounded-full border px-3 py-2 text-left text-xs font-semibold", phone === p.phone ? "border-ink bg-ink text-on-ink" : "border-line bg-card")}>{p.name}<span className="block">{p.phone}</span></button>)}
        </div>
        <form onSubmit={enter} data-testid="operator-login-form" data-hydrated={hydrated ? "true" : "false"} className="mt-4 grid gap-3 rounded-3xl border border-line bg-card p-5">
          <label className="grid gap-1 text-sm font-semibold">Registered mobile number<input value={phone} disabled={!hydrated} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" className="h-12 rounded-xl border border-line px-3 text-base" /></label>
          <label className="grid gap-1 text-sm font-semibold">Preview OTP<input value={code} disabled={!hydrated} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="482609" inputMode="numeric" className="h-12 rounded-xl border border-line px-3 text-center font-display text-2xl tracking-widest" /></label>
          <Button type="submit" size="lg" disabled={!hydrated}>Open desk</Button>
          <Link to="/join" className="text-center text-sm font-semibold">Register a new business / machine</Link>
        </form>
        <p className="mt-4 text-xs leading-5 text-muted">Production sign-in needs real OTP and shared server-side provider records. This preview uses browser-local data.</p>
      </div>
    );
  }
  return <DeskHome providerId={session.providerId} />;
}

function DeskHome({ providerId }: { providerId: string }) {
  const foundProvider = useProviders().find((p) => p.id === providerId);
  const requests = useFieldly((s) => s.requests);
  const quotes = useFieldly((s) => s.quotes);
  const bookings = useFieldly((s) => s.bookings);
  const isOnline = useFieldly((s) => s.isOnline);
  const setOnline = useFieldly((s) => s.setOnline);
  const setServiceAvailability = useFieldly((s) => s.setServiceAvailability);
  const setAssetAvailability = useFieldly((s) => s.setAssetAvailability);
  const sendQuote = useFieldly((s) => s.sendQuote);
  const declineRequest = useFieldly((s) => s.declineRequest);
  const [tab, setTab] = useState<Tab>("overview");
  const [jobFilter, setJobFilter] = useState<JobFilter>("active");
  const online = isOnline(providerId);

  const openRequests = useMemo(() => {
    if (!foundProvider) return [];
    return requests
      .filter((r) => r.status === "open" && r.targetedProviderIds.includes(foundProvider.id) && !(r.declinedProviderIds ?? []).includes(foundProvider.id) && foundProvider.services.includes(r.serviceId))
      .map((request) => ({ request, km: kmBetween(foundProvider, request.site) }))
      .filter(({ request, km }) => {
        const service = getService(request.serviceId);
        return service ? km <= service.radiusKm + 10 : false;
      })
      .sort((a, b) => a.km - b.km);
  }, [requests, foundProvider]);

  if (!foundProvider) return <p className="px-4 py-10">Provider account not found.</p>;
  const provider: Provider = foundProvider;

  const mine = bookings.filter((b) => b.providerId === providerId);
  const activeJobs = mine.filter((b) => ACTIVE.includes(b.status));
  const awaitingPaymentJobs = mine.filter((b) => b.status === "SERVICE_COMPLETED");
  const historyJobs = mine.filter((b) => b.status === "PAID" || b.status === "CANCELLED");
  const disputes = mine.filter((b) => b.status === "DISPUTED");
  const customerPaid = mine.filter((b) => b.status === "PAID").reduce((sum, b) => sum + b.amount, 0);
  const awaitingPayment = mine.filter((b) => b.status === "SERVICE_COMPLETED").reduce((sum, b) => sum + b.amount, 0);
  const canGoOnline = provider.services.some((id) => isEligible(provider, id) && provider.serviceAvailability?.[id] !== false && (!provider.onboarding || provider.onboarding.assets.some((a) => a.serviceIds.includes(id) && a.status === "APPROVED" && a.available !== false)));
  const pausedCount = provider.services.filter((id) => provider.serviceAvailability?.[id] === false).length;

  const tabs: { id: Tab; name: string; icon: typeof Activity }[] = [
    { id: "overview", name: "Overview", icon: Activity },
    { id: "requests", name: "Requests", icon: ClipboardList },
    { id: "jobs", name: "Bookings", icon: BriefcaseBusiness },
    { id: "fleet", name: "Services & fleet", icon: Truck },
    { id: "earnings", name: "Earnings", icon: Wallet },
    { id: "business", name: "Business profile", icon: Settings2 },
  ];

  function toggleGlobal() {
    if (!online && !canGoOnline) return toast.error("No approved service and machine is currently available.");
    setOnline(provider.id, !online);
    toast.success(online ? "New requests paused for all services." : "You are online for eligible services.");
  }
  function toggleService(serviceId: string, next: boolean) {
    const result = setServiceAvailability(provider.id, serviceId, next);
    if (!result.ok) toast.error(result.error);
    else toast.success(next ? "Service is accepting new requests." : "New requests paused for this service.");
  }
  function toggleAsset(assetId: string, next: boolean) {
    const result = setAssetAvailability(provider.id, assetId, next);
    if (!result.ok) toast.error(result.error);
    else toast.success(next ? "Machine available for new work." : "Machine paused for new work.");
  }

  const isServiceEnabled = (id: string) => provider.serviceAvailability?.[id] !== false;
  const serviceApproval = (id: string) => provider.onboarding?.services.find((s) => s.serviceId === id);
  const approvedAssetCount = (id: string) => provider.onboarding?.assets.filter((a) => a.serviceIds.includes(id) && a.status === "APPROVED").length ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-field">Fieldly provider workspace</p>
          <h1 className="mt-1 break-words font-display text-3xl font-bold sm:text-4xl">{provider.name}</h1>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted"><MapPin className="size-3.5" />{provider.area}, {provider.city} · {provider.phone}</p>
          {provider.onboarding?.business.ownerFullName && <p className="mt-1 text-xs text-muted">Account owner: {provider.onboarding.business.ownerFullName}</p>}
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <span className={cn("inline-flex items-center justify-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold", online ? "bg-field-soft text-field" : "bg-paper text-muted")}>
            <span className={cn("size-2 rounded-full", online ? "bg-field" : "bg-muted")} />{online ? "Online · eligible requests on" : "Offline · new requests paused"}
          </span>
          <Button onClick={toggleGlobal} disabled={!online && !canGoOnline} variant={online ? "secondary" : "primary"}>
            {online ? <><PauseCircle className="mr-2 size-4" /> Go offline</> : <><PlayCircle className="mr-2 size-4" /> Go online</>}
          </Button>
        </div>
      </header>

      {provider.onboarding && (
        <section className="mt-4 rounded-2xl border border-line bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="font-semibold">Business verification · {provider.onboarding.businessStatus.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted">{provider.onboarding.business.tradeName} · {provider.onboarding.business.businessType.replaceAll("_", " ")}</p></div>
            <span className="rounded-full bg-paper px-3 py-1.5 text-xs font-semibold">Payout setup: {provider.onboarding.payoutStatus.replaceAll("_", " ")}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">Business, service and machine verification are separate. Payment-provider onboarding remains deferred and is not active in this preview.</p>
        </section>
      )}

      <section className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric icon={ClipboardList} label="Open requests" value={String(openRequests.length)} note="Assigned to registered services" />
        <Metric icon={BriefcaseBusiness} label="In-progress bookings" value={String(activeJobs.length)} note="Confirmed, travel, arrived or working" />
        <Metric icon={CheckCircle2} label="Completed · awaiting payment" value={String(awaitingPaymentJobs.length)} note="Work done; customer payment pending" />
        <Metric icon={Banknote} label="Customer-marked paid" value={inr(customerPaid)} note="Preview record · not a payout" />
      </section>
      <section className="mt-3 grid gap-3 rounded-2xl border border-line bg-card p-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gold-soft p-3 text-gold"><span className="font-display text-2xl font-bold">{provider.reviewCount > 0 ? provider.rating.toFixed(1) : "—"}</span></div>
          <div>
            <p className="font-semibold">Customer rating</p>
            <p className="text-xs text-muted">{provider.reviewCount} verified booking review(s)</p>
          </div>
        </div>
        <div className="min-w-0">
          {provider.reviews.length ? (
            <>
              <p className="text-xs font-semibold text-muted">Latest feedback · {provider.reviews[0].stars}/5</p>
              <p className="mt-1 text-sm leading-5">{provider.reviews[0].text}</p>
            </>
          ) : (
            <p className="text-sm text-muted">Complete jobs and ask customers for honest feedback. Your rating will appear here after the first review.</p>
          )}
        </div>
      </section>

      <nav className="-mx-1 mt-5 flex gap-1 overflow-x-auto px-1 pb-2" aria-label="Provider sections">
        {tabs.map(({ id, name, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={cn("flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold", tab === id ? "bg-ink text-on-ink" : "border border-line bg-card text-muted")}>
            <Icon className="size-4" />{name}{id === "requests" && openRequests.length > 0 && <span className="rounded-full bg-field-soft px-1.5 text-[10px] text-field">{openRequests.length}</span>}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-3xl border border-line bg-card p-4 sm:p-5">
            <h2 className="font-display text-xl font-bold">Service availability</h2>
            <p className="mt-1 text-xs text-muted">Pause one service without taking your other services offline.</p>
            <div className="mt-3 grid gap-2">
              {provider.services.map((id) => {
                const service = getService(id);
                const approved = isEligible(provider, id);
                const enabled = isServiceEnabled(id);
                const effective = isAvailableForService(provider, id);
                return (
                  <div key={id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line p-3">
                    <div><p className="font-semibold">{service?.name ?? id}</p><p className="mt-1 text-xs text-muted">{serviceApproval(id)?.status.replaceAll("_", " ") ?? (provider.approved ? "Legacy listing" : "Not approved")} · {provider.onboarding ? approvedAssetCount(id) + " approved machine(s)" : "Listing"}</p></div>
                    <button type="button" disabled={!approved} onClick={() => toggleService(id, !enabled)} className={cn("rounded-full px-3 py-2 text-xs font-bold", !approved ? "cursor-not-allowed bg-paper text-muted" : effective ? "bg-field-soft text-field" : "bg-paper text-muted")}>{effective ? "Accepting · Pause" : enabled && approved && !online ? "Ready · Global offline" : "Paused · Enable"}</button>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">Going offline or pausing a service stops new leads only. It does not cancel accepted bookings.</p>
          </section>
          <section className="rounded-3xl border border-line bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between"><h2 className="font-display text-xl font-bold">Work queue</h2><CalendarClock className="size-5 text-muted" /></div>
            {activeJobs.length ? <div className="mt-3 grid gap-2">{activeJobs.slice(0, 3).map((b) => <JobRow key={b.id} booking={b} />)}<button className="text-left text-sm font-semibold underline" onClick={() => { setTab("jobs"); setJobFilter("active"); }}>View in-progress bookings</button></div> : <Empty icon={BriefcaseBusiness} title="No in-progress bookings" detail="Accepted jobs that haven't been completed appear here." />}
            {awaitingPaymentJobs.length > 0 && <div className="mt-4 border-t border-line pt-4"><p className="text-sm font-semibold">Completed · customer payment pending · {awaitingPaymentJobs.length}</p>{awaitingPaymentJobs.slice(0, 3).map((b) => <div key={b.id} className="mt-2"><JobRow booking={b} /></div>)}<button className="mt-2 text-sm font-semibold underline" onClick={() => { setTab("jobs"); setJobFilter("awaiting_payment"); }}>View completed jobs awaiting payment</button></div>}
            <div className="mt-4 border-t border-line pt-4"><p className="text-sm font-semibold">Open requests · {openRequests.length}</p>{openRequests.slice(0, 3).map(({ request }) => <p key={request.id} className="mt-2 text-sm text-muted">{getService(request.serviceId)?.name} · {request.site.area} · {request.whenLabel}</p>)}{openRequests.length > 0 && <button onClick={() => setTab("requests")} className="mt-3 text-sm font-semibold underline">Respond to requests</button>}</div>
          </section>
          <section className="rounded-3xl border border-line bg-card p-4 sm:p-5 lg:col-span-2">
            <h2 className="font-display text-xl font-bold">Your operation</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-3"><InfoMini label="Registered services" value={String(provider.services.length)} /><InfoMini label="Registered machines" value={String(provider.onboarding?.assets.length ?? provider.machines.length)} /><InfoMini label="Services paused" value={String(pausedCount)} /></div>
            <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setTab("fleet")}><Truck className="mr-2 size-4" />Manage fleet</Button><Button variant="secondary" onClick={() => setTab("business")}><FileCheck2 className="mr-2 size-4" />Verification status</Button><Button asChild><Link to="/join"><Plus className="mr-2 size-4" />Add service / machine</Link></Button></div>
          </section>
        </div>
      )}

      {tab === "requests" && (
        <section className="mt-4 grid gap-3">
          <div className="rounded-2xl bg-paper p-3 text-xs leading-5 text-muted">Check location, requested date, scope, work-site photos, machine fit and safety details before quoting. Pausing a service blocks new quotes but lets you decline existing enquiries.</div>
          {!openRequests.length && <Empty icon={ClipboardList} title="No open requests" detail="New enquiries appear here when the corresponding service is active and your business is online." />}
          {openRequests.map(({ request, km }) => {
            const quote = quotes.find((q) => q.requestId === request.id && q.providerId === provider.id && q.status === "pending");
            return <QuoteCard key={request.id} requestId={request.id} title={getService(request.serviceId)?.name ?? request.serviceId} place={request.site.label + " · " + formatKm(km)} lines={requirementLines(request.serviceId, request.requirements)} whenLabel={request.whenLabel} notes={request.notes} customerPhone={request.customerPhone} siteImages={request.siteImages ?? []} suggested={priceJob(request.serviceId, provider, request.requirements).amount} existing={quote} servicePaused={!isServiceOperational(provider, request.serviceId)} onSend={(amount, note) => { const r = sendQuote(request.id, amount, note); if (!r.ok) toast.error(r.error); else toast.success("Quote sent for customer review."); }} onDecline={() => { const r = declineRequest(request.id); if (!r.ok) toast.error(r.error); else toast.success("Request declined."); }} />;
          })}
        </section>
      )}

      {tab === "jobs" && (
        <section className="mt-4">
          <div className="flex flex-wrap gap-2">{([["active", "In progress · " + activeJobs.length], ["awaiting_payment", "Awaiting payment · " + awaitingPaymentJobs.length], ["history", "History · " + historyJobs.length], ["disputes", "Disputes · " + disputes.length]] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setJobFilter(key)} className={cn("rounded-xl px-3 py-2 text-sm font-semibold", jobFilter === key ? "bg-ink text-on-ink" : "border border-line bg-card")}>{label}</button>)}</div>
          <div className="mt-3 grid gap-2">
            {jobFilter === "active" && (activeJobs.length ? activeJobs.map((b) => <JobRow key={b.id} booking={b} />) : <Empty icon={BriefcaseBusiness} title="No in-progress bookings" detail="Confirmed jobs, travel, arrival and work in progress show here." />)}
            {jobFilter === "awaiting_payment" && (awaitingPaymentJobs.length ? awaitingPaymentJobs.map((b) => <JobRow key={b.id} booking={b} />) : <Empty icon={Banknote} title="No completed jobs awaiting payment" detail="A completed service appears here until the customer records payment." />)}
            {jobFilter === "history" && (historyJobs.length ? historyJobs.map((b) => <JobRow key={b.id} booking={b} />) : <Empty icon={History} title="No booking history yet" detail="Paid and cancelled bookings appear here." />)}
            {jobFilter === "disputes" && (disputes.length ? disputes.map((b) => <JobRow key={b.id} booking={b} />) : <Empty icon={LifeBuoy} title="No disputed bookings" detail="Bookings that need reviewer attention appear here." />)}
          </div>
        </section>
      )}

      {tab === "fleet" && (
        <section className="mt-4 grid gap-4">
          <div className="rounded-2xl bg-paper p-3 text-xs leading-5 text-muted">Global Online stops all new leads. Service availability pauses one category. Machine availability removes one specific asset from new matching. Existing bookings are never cancelled by these switches.</div>
          <section className="rounded-3xl border border-line bg-card p-4"><h2 className="font-display text-xl font-bold">Service controls</h2><div className="mt-3 grid gap-2">{provider.services.map((id) => { const approved = isEligible(provider, id); const enabled = isServiceEnabled(id); const effective = isAvailableForService(provider, id); return <div key={id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"><div><p className="font-semibold">{getService(id)?.name ?? id}</p><p className="mt-1 text-xs text-muted">{approved ? (effective ? "Approved · accepting new requests" : online && enabled ? "Approved · no active machine or otherwise paused" : "Approved · paused") : "Not approved yet"}</p></div><Button size="sm" variant={enabled && approved ? "secondary" : "primary"} disabled={!approved} onClick={() => toggleService(id, !enabled)}>{enabled ? "Pause service" : "Activate service"}</Button></div>; })}</div></section>
          {provider.onboarding ? <section className="rounded-3xl border border-line bg-card p-4"><h2 className="font-display text-xl font-bold">Machines and equipment</h2><div className="mt-3 grid gap-3">{provider.onboarding.assets.map((asset) => { const approved = asset.status === "APPROVED"; const enabled = asset.available !== false; return <article key={asset.id} className="rounded-2xl border border-line p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{asset.make} {asset.model}</p><p className="mt-1 text-xs text-muted">{asset.assetType} · {asset.yearOfManufacture ?? "Year not supplied"}</p><p className="mt-1 text-xs text-muted">Services: {asset.serviceIds.map((id) => getService(id)?.name ?? id).join(", ")}</p><p className="mt-1 text-xs text-muted">Review: {asset.status.replaceAll("_", " ")} · registration suffix {asset.registrationLast4 ?? "not supplied"}</p></div><Button size="sm" variant={enabled ? "secondary" : "primary"} disabled={!approved} onClick={() => toggleAsset(asset.id, !enabled)}>{enabled ? "Pause machine" : "Make available"}</Button></div>{!approved && <p className="mt-2 text-xs text-gold">Cannot receive new bookings until approved.</p>}</article>; })}</div></section> : <section className="rounded-3xl border border-line bg-card p-4"><h2 className="font-display text-xl font-bold">Listed equipment</h2><div className="mt-3 grid gap-2">{provider.machines.map((m) => <p key={m} className="rounded-xl bg-paper p-3 text-sm">{m}</p>)}</div><p className="mt-2 text-xs text-muted">Legacy preview listing; per-machine controls need a completed asset registration.</p></section>}
          <Button asChild variant="secondary"><Link to="/join"><Plus className="mr-2 size-4" />Add another service or machine</Link></Button>
        </section>
      )}

      {tab === "earnings" && (
        <section className="mt-4 grid gap-4">
          <div className="rounded-2xl border border-gold/30 bg-gold-soft p-4 text-xs leading-5 text-gold">Preview accounting only. “Customer-marked paid” means the customer used the local preview control; it is not gateway-confirmed money, provider payout, bank settlement or a tax statement. Cashfree and real payout processing are deferred.</div>
          <div className="grid gap-2 sm:grid-cols-3"><MoneyMetric label="Customer-marked paid" amount={customerPaid} detail={mine.filter((b) => b.status === "PAID").length + " booking(s)"} /><MoneyMetric label="Completed · awaiting customer payment" amount={awaitingPayment} detail={mine.filter((b) => b.status === "SERVICE_COMPLETED").length + " booking(s)"} /><MoneyMetric label="Active booked value" amount={mine.filter((b) => ACTIVE.includes(b.status)).reduce((sum, b) => sum + b.amount, 0)} detail="Not money received" /></div>
          <section className="rounded-3xl border border-line bg-card p-4"><h2 className="font-display text-xl font-bold">Payment activity</h2>{mine.filter((b) => b.payment || b.status === "SERVICE_COMPLETED").length ? <div className="mt-3 grid gap-2">{mine.filter((b) => b.payment || b.status === "SERVICE_COMPLETED").sort((a, b) => (b.payment?.at ?? b.timestamps.SERVICE_COMPLETED ?? 0) - (a.payment?.at ?? a.timestamps.SERVICE_COMPLETED ?? 0)).map((b) => <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"><div><p className="text-sm font-semibold">{b.code} · {getService(b.serviceId)?.name}</p><p className="mt-1 text-xs text-muted">{b.site.area} · {b.payment ? b.payment.method + " · " + b.payment.ref : "Awaiting customer payment"}</p></div><div className="text-right"><p className="font-display text-xl font-bold">{inr(b.amount)}</p><p className="text-xs text-muted">{b.status.replaceAll("_", " ")}</p></div></div>)}</div> : <Empty icon={Wallet} title="No payment activity" detail="Customer-side records appear after work is marked complete." />}</section>
          <section className="rounded-3xl border border-line bg-card p-4"><h2 className="font-display text-xl font-bold">Service-wise totals</h2><div className="mt-3 grid gap-2">{provider.services.map((id) => { const rows = mine.filter((b) => b.serviceId === id); const total = rows.filter((b) => b.status === "PAID").reduce((sum, b) => sum + b.amount, 0); return <div key={id} className="flex items-center justify-between rounded-xl bg-paper p-3"><span className="text-sm font-semibold">{getService(id)?.name ?? id}<span className="ml-2 text-xs font-normal text-muted">{rows.length} jobs</span></span><span className="font-semibold">{inr(total)}</span></div>; })}</div></section>
          <p className="text-xs text-muted">A real settlement statement, commission deductions, GST/TDS/TCS, refunds, chargebacks and payout reconciliation belong to the deferred payment integration.</p>
        </section>
      )}

      {tab === "business" && (
        <section className="mt-4 grid gap-4">
          {provider.onboarding ? <>
            <section className="rounded-3xl border border-line bg-card p-4"><div className="flex items-center gap-2"><UserRound className="size-5 text-muted" /><h2 className="font-display text-xl font-bold">Business identity</h2></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><InfoMini label="Owner / authorised person" value={provider.onboarding.business.ownerFullName} /><InfoMini label="Legal name" value={provider.onboarding.business.legalName} /><InfoMini label="Trade name" value={provider.onboarding.business.tradeName} /><InfoMini label="Legal structure" value={provider.onboarding.business.businessType.replaceAll("_", " ")} /><InfoMini label="Business address" value={provider.onboarding.business.address + ", " + provider.onboarding.business.district + " – " + provider.onboarding.business.pincode} /><InfoMini label="GST status" value={provider.onboarding.business.gstStatus.replaceAll("_", " ")} /><InfoMini label="Turnover declaration" value={provider.onboarding.business.aggregateTurnoverBand.replaceAll("_", " ")} /><InfoMini label="Udyam" value={provider.onboarding.business.udyamProvided ? "Declared available" : "Not provided"} /></div></section>
            <section className="rounded-3xl border border-line bg-card p-4"><h2 className="font-display text-xl font-bold">Verification checklist</h2><div className="mt-3 grid gap-2">{provider.onboarding.documents.map((doc) => <div key={doc.key} className="flex items-start justify-between gap-3 rounded-xl border border-line p-3"><div><p className="text-sm font-semibold">{doc.label}</p><p className="mt-1 text-xs text-muted">{doc.jobSpecific ? "Job-specific" : doc.requiredForApproval ? "Required for approval" : "Optional / conditional"}</p></div><span className={cn("shrink-0 rounded-full px-2 py-1 text-[10px] font-bold", doc.selectedInPreview ? "bg-gold-soft text-gold" : "bg-paper text-muted")}>{doc.selectedInPreview ? "Marked ready · preview" : "Not submitted"}</span></div>)}</div><p className="mt-2 text-xs text-muted">No real files were uploaded or verified. Document expiry and reviewer decisions are not connected yet.</p></section>
          </> : <section className="rounded-3xl border border-line bg-card p-4"><h2 className="font-display text-xl font-bold">Business profile</h2><p className="mt-2 text-sm text-muted">Legacy preview listing. Complete the full business and asset registration before production onboarding.</p></section>}
          <section className="rounded-3xl border border-line bg-card p-4"><h2 className="font-display text-xl font-bold">Public service profile</h2><p className="mt-2 text-sm text-muted">{provider.bio || "No business description supplied."}</p><p className="mt-2 text-xs text-muted">Operating base: {provider.area}, {provider.city}, {provider.state}. Languages: {provider.languages.join(", ")}.</p></section>
          <Button asChild variant="secondary"><Link to="/join"><Settings2 className="mr-2 size-4" />Add service / update registration</Link></Button>
        </section>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value, note }: { icon: typeof Activity; label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-line bg-card p-3"><div className="flex items-center justify-between gap-1"><span className="text-xs text-muted">{label}</span><Icon className="size-4 text-muted" /></div><p className="mt-2 font-display text-2xl font-bold">{value}</p><p className="mt-1 text-[10px] leading-4 text-muted">{note}</p></div>;
}
function MoneyMetric({ label, amount, detail }: { label: string; amount: number; detail: string }) {
  return <div className="rounded-2xl border border-line bg-card p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 font-display text-2xl font-bold">{inr(amount)}</p><p className="mt-1 text-xs text-muted">{detail}</p></div>;
}
function InfoMini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-paper p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-1 break-words text-sm font-semibold">{value || "Not provided"}</p></div>;
}
function Empty({ icon: Icon, title, detail }: { icon: typeof Activity; title: string; detail: string }) {
  return <div className="rounded-2xl border border-dashed border-line bg-card p-6 text-center"><Icon className="mx-auto size-7 text-muted" /><p className="mt-2 font-semibold">{title}</p><p className="mt-1 text-sm text-muted">{detail}</p></div>;
}
function JobRow({ booking }: { booking: Booking }) {
  return <Link to="/bookings/$bookingId" params={{ bookingId: booking.id }} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card p-4 transition hover:border-ink"><div className="min-w-0"><p className="font-semibold">{booking.code} · {getService(booking.serviceId)?.name ?? booking.serviceId}</p><p className="mt-1 truncate text-sm text-muted">{booking.site.label}, {booking.site.area} · {booking.customerName}</p><p className="mt-1 text-xs text-muted">{booking.whenLabel}</p></div><div className="flex items-center gap-3"><div className="text-right"><p className="font-semibold">{inr(booking.amount)}</p><p className="text-xs text-muted">{booking.status.replaceAll("_", " ")}</p></div><StatusPill status={booking.status} /><ArrowUpRight className="size-4 text-muted" /></div></Link>;
}
function QuoteCard({ requestId, title, place, lines, whenLabel, notes, customerPhone, siteImages, suggested, existing, servicePaused, onSend, onDecline }: {
  requestId: string; title: string; place: string; lines: { label: string; value: string }[]; whenLabel: string; notes: string; customerPhone: string; siteImages: string[]; suggested: number; existing?: { amount: number; note: string }; servicePaused: boolean; onSend: (amount: number, note: string) => void; onDecline: () => void;
}) {
  const [amount, setAmount] = useState(String(existing?.amount ?? (suggested > 0 ? suggested : "")));
  const [note, setNote] = useState(existing?.note ?? "");
  return <article className="rounded-3xl border border-line bg-card p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-xl font-bold">{title}</h2><p className="text-sm text-muted">{place} · {whenLabel}</p><p className="mt-1 text-xs text-muted">Request {requestId.slice(-6)}</p></div><span className="rounded-full bg-paper px-2 py-1 text-xs font-semibold text-muted">New enquiry</span></div><ul className="mt-3 grid gap-1 text-sm text-muted">{lines.map((row) => <li key={row.label}>{row.label}: {row.value}</li>)}{notes && <li>Customer note: {notes}</li>}</ul>{siteImages.length > 0 && <div className="mt-3"><p className="mb-2 text-xs font-semibold text-muted">Work-site photos</p><div className="grid grid-cols-3 gap-2">{siteImages.map((image, i) => <img key={image.slice(-36)} src={image} alt={"Customer work site " + (i + 1)} className="h-24 w-full rounded-xl border border-line object-cover" />)}</div></div>}{existing && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-field-soft p-3"><p className="text-sm font-semibold text-field">Quote already sent · {inr(existing.amount)}</p><a href={"tel:" + customerPhone} className="text-sm font-semibold underline">Call customer</a></div>}{servicePaused && <p className="mt-3 rounded-xl bg-gold-soft p-3 text-xs leading-5 text-gold">This service is paused. Re-enable it under Services & fleet before sending a quote. You may still decline this request.</p>}<div className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr]"><label className="grid gap-1 text-xs font-semibold text-muted">Quote amount (₹)<input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} className="h-11 rounded-xl border border-line px-3 text-base text-ink outline-none" /></label><label className="grid gap-1 text-xs font-semibold text-muted">Inclusions / exclusions / fees<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Travel, fuel, operator, extra hours, fees, cancellation…" className="h-11 rounded-xl border border-line px-3 text-base text-ink outline-none" /></label></div><div className="mt-3 flex flex-wrap gap-2"><Button disabled={servicePaused || !Number(amount) || note.trim().length < 8} onClick={() => onSend(Number(amount), note)}>{existing ? "Update quote" : "Accept request & send quote"}</Button><Button variant="secondary" onClick={onDecline}>Decline request</Button></div></article>;
}
