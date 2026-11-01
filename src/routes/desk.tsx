import { Link, createFileRoute } from "@tanstack/react-router";
import { Activity, ArrowUpRight, Banknote, BriefcaseBusiness, CalendarClock, CheckCircle2, ClipboardList, FileCheck2, History, LifeBuoy, MapPin, PauseCircle, PlayCircle, Plus, Settings2, ShieldCheck, Truck, UserRound, Wallet, Wrench } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { StatusPill, requirementLines } from "@/components/fieldly/bits";
import { authClient, authEnabled } from "@/lib/auth/client";
import { getCurrentProviderBookings, getCurrentProviderDashboard, getCurrentProviderOpenRequests, setCurrentProviderAssetAvailability, setCurrentProviderPresence, setCurrentProviderServiceAvailability, submitCurrentProviderQuote } from "@/lib/fieldly/account.functions";
import { SERVICE_ONBOARDING } from "@/lib/fieldly/provider-onboarding";
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
  const { data: authSession, isPending: authSessionPending } = authClient.useSession();
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

  if (authEnabled) {
    if (authSessionPending) {
      return <div className="mx-auto max-w-5xl px-4 py-14 text-sm text-muted">Checking your secure provider session…</div>;
    }
    if (!authSession?.user) {
      return (
        <div className="mx-auto max-w-lg px-4 py-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-field">Provider workspace</p>
          <h1 className="mt-1 font-display text-4xl font-bold">Your provider desk</h1>
          <p className="mt-3 text-sm leading-6 text-muted">Sign in with your verified MakeService mobile account to view your submitted businesses, machinery and verification progress.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild><Link to="/account">Sign in to MakeService</Link></Button>
            <Button asChild variant="secondary"><Link to="/join">Register your business</Link></Button>
          </div>
        </div>
      );
    }
    const phone = authSession.user.phoneNumber ?? "";
    const phoneVerified = Boolean(authSession.user.phoneNumberVerified && /^\\+91[6-9]\\d{9}$/.test(phone));
    if (!phoneVerified) {
      return (
        <div className="mx-auto max-w-lg px-4 py-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-field">Provider workspace</p>
          <h1 className="mt-1 font-display text-4xl font-bold">Verify your mobile</h1>
          <p className="mt-3 text-sm leading-6 text-muted">Provider access requires a verified Indian mobile number. MSG91/DLT setup is still pending, so real phone verification is not active yet. The preview code is not accepted in production.</p>
          <Button asChild className="mt-5"><Link to="/account">Go to account</Link></Button>
        </div>
      );
    }
    return <ProductionDeskHome />;
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

type ProductionApplication = Awaited<ReturnType<typeof getCurrentProviderDashboard>>[number];

const reviewLabel = (status: string) => status.replaceAll("_", " ").replace(/\\b\\w/g, (letter) => letter.toUpperCase());
const reviewTone = (status: string) => {
  const value = status.toLowerCase();
  if (value === "approved" || value === "verified") return "bg-field-soft text-field";
  if (value === "rejected" || value === "suspended") return "bg-red-50 text-red-700";
  if (value === "needs_information") return "bg-amber-50 text-amber-800";
  return "bg-paper text-muted";
};

function ProductionDeskHome() {
  const { data: authSession } = authClient.useSession();
  const [applications, setApplications] = useState<ProductionApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadApplications = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const data = await getCurrentProviderDashboard();
      setApplications(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't load your provider applications.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  const userName = authSession?.user?.name || "Provider";
  const totalServices = applications.reduce((sum, app) => sum + app.services.length, 0);
  const totalAssets = applications.reduce((sum, app) => sum + app.assets.length, 0);
  const pendingDocs = applications.reduce(
    (sum, app) => sum + app.documentRequirements.filter((doc) => doc.requiredForApproval && !["verified", "not_applicable"].includes(doc.status)).length,
    0,
  );

  if (loading) {
    return <div className="mx-auto max-w-5xl px-4 py-14 text-sm text-muted">Loading your provider applications from Supabase…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 pb-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-field">MakeService provider workspace</p>
          <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">Welcome, {userName}</h1>
          <p className="mt-2 text-sm text-muted">Your provider applications and verification progress, securely loaded from your account.</p>
        </div>
        <Button variant="secondary" onClick={() => void loadApplications(true)} disabled={refreshing}>
          <Activity className="mr-2 size-4" />{refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </header>

      {error && (
        <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
          <button type="button" className="ml-2 font-semibold underline" onClick={() => void loadApplications(true)}>Try again</button>
        </div>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric icon={BriefcaseBusiness} label="Businesses" value={String(applications.length)} note="Owned by your account" />
        <Metric icon={Wrench} label="Registered services" value={String(totalServices)} note="Across your businesses" />
        <Metric icon={Truck} label="Machines & assets" value={String(totalAssets)} note="Registered equipment" />
        <Metric icon={FileCheck2} label="Documents pending" value={String(pendingDocs)} note="Required checklist items" />
      </section>

      {!applications.length && !error && (
        <section className="mt-6 rounded-3xl border border-line bg-card p-6 sm:p-8">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-paper"><BriefcaseBusiness className="size-6" /></div>
          <h2 className="mt-4 font-display text-2xl font-bold">No provider application yet</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">Register your business, services and machines. Your application will be stored under your verified account and will remain unavailable to customers until the required checks and admin approval are complete.</p>
          <Button asChild className="mt-5"><Link to="/join"><Plus className="mr-2 size-4" />Register a business or machine</Link></Button>
        </section>
      )}

      <div className="mt-6 grid gap-5">
        {applications.map((application) => (
          <article key={application.id} className="overflow-hidden rounded-3xl border border-line bg-card">
            <div className="border-b border-line p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-widest text-field">Business application</p>
                  <h2 className="mt-1 break-words font-display text-2xl font-bold">{application.tradeName}</h2>
                  <p className="mt-1 text-sm text-muted">{application.legalName} · {application.businessType.replaceAll("_", " ")}</p>
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted"><MapPin className="size-3.5" />{application.area}, {application.city ?? application.district}, {application.state} · {application.pincode}</p>
                </div>
                <span className={cn("rounded-full px-3 py-1.5 text-xs font-bold", reviewTone(application.verificationStatus))}>
                  {reviewLabel(application.verificationStatus)}
                </span>
              </div>
              {application.reviewerNote && (
                <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  <span className="font-semibold">Reviewer note:</span> {application.reviewerNote}
                </div>
              )}
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <InfoMini label="Owner" value={application.ownerFullName} />
                <InfoMini label="Experience" value={application.yearsExperience + " years"} />
                <InfoMini label="Payout onboarding" value={reviewLabel(application.payoutStatus)} />
              </div>
            </div>

            <section className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-lg font-bold">Registered services</h3>
                <span className="text-xs text-muted">{application.services.length} service(s)</span>
              </div>
              {application.services.length ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {application.services.map((service) => (
                    <div key={service.id} className="rounded-2xl border border-line p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="font-semibold">{SERVICE_ONBOARDING[service.serviceId]?.label ?? service.serviceId}</div>
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", reviewTone(service.verificationStatus))}>{reviewLabel(service.verificationStatus)}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted">{service.selectedTasks.join(" · ") || "No tasks recorded"}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-paper px-2.5 py-1">{service.isListed ? "Listed" : "Not listed"}</span>
                        <span className="rounded-full bg-paper px-2.5 py-1">{service.isAvailable ? "Available" : "Unavailable"}</span>
                      </div>
                      {service.reviewerNote && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{service.reviewerNote}</p>}
                    </div>
                  ))}
                </div>
              ) : <p className="mt-3 text-sm text-muted">No services on this application.</p>}
            </section>

            <section className="border-t border-line p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-lg font-bold">Machines & equipment</h3>
                <span className="text-xs text-muted">{application.assets.length} asset(s)</span>
              </div>
              {application.assets.length ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {application.assets.map((asset) => (
                    <div key={asset.id} className="rounded-2xl border border-line p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div><p className="font-semibold">{asset.make} {asset.model}</p><p className="mt-1 text-xs text-muted">{asset.assetType}{asset.yearOfManufacture ? " · " + asset.yearOfManufacture : ""}</p></div>
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", reviewTone(asset.verificationStatus))}>{reviewLabel(asset.verificationStatus)}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted">{reviewLabel(asset.ownership)} · {reviewLabel(asset.roadUse)}</p>
                      <p className="mt-1 text-xs text-muted">For: {asset.serviceIds.map((id) => SERVICE_ONBOARDING[id]?.label ?? id).join(", ")}</p>
                      {asset.registrationLast4 && <p className="mt-1 text-xs text-muted">Registration ending {asset.registrationLast4}</p>}
                      {asset.reviewerNote && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{asset.reviewerNote}</p>}
                    </div>
                  ))}
                </div>
              ) : <p className="mt-3 text-sm text-muted">No machines recorded.</p>}
            </section>

            <section className="border-t border-line p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-lg font-bold">Verification checklist</h3>
                <span className="text-xs text-muted">{application.documentRequirements.filter((item) => item.requiredForApproval).length} required item(s)</span>
              </div>
              {application.documentRequirements.length ? (
                <div className="mt-3 divide-y divide-line rounded-2xl border border-line">
                  {application.documentRequirements.map((document) => (
                    <div key={document.key} className="flex flex-wrap items-start justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{document.label}{document.requiredForApproval && <span className="ml-1 text-amber-700">*</span>}</p>
                        <p className="mt-1 text-xs leading-5 text-muted">{document.description}</p>
                        {document.secureOnly && <p className="mt-1 text-[11px] font-semibold text-muted">Secure verification required</p>}
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold", reviewTone(document.status))}>{reviewLabel(document.status)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-3 text-sm text-muted">No verification requirements recorded.</p>}
              <p className="mt-3 text-xs leading-5 text-muted">This page shows checklist status only. Actual KYC files are not uploaded here. Do not email or message identity documents; secure document upload will be enabled separately.</p>
            </section>
          </article>
        ))}
      </div>

      {applications.length > 0 && <ProductionProviderOperations applications={applications} onRefresh={() => loadApplications(true)} />}
    </div>
  );
}

type LiveProviderRequest = Awaited<ReturnType<typeof getCurrentProviderOpenRequests>>[number];
type LiveProviderBooking = Awaited<ReturnType<typeof getCurrentProviderBookings>>[number];

function ProductionProviderOperations({ applications, onRefresh }: { applications: ProductionApplication[]; onRefresh: () => Promise<void> }) {
  const approvedBusinesses = applications.filter((application) => application.verificationStatus === "approved");
  const [selectedBusinessId, setSelectedBusinessId] = useState(approvedBusinesses[0]?.id ?? "");
  const [onlineByBusiness, setOnlineByBusiness] = useState<Record<string, boolean>>(
    () => Object.fromEntries(approvedBusinesses.map((item) => [item.id, item.isOnline])),
  );
  const [requests, setRequests] = useState<LiveProviderRequest[]>([]);
  const [bookings, setBookings] = useState<LiveProviderBooking[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingPresence, setSavingPresence] = useState(false);
  const [savingAvailabilityId, setSavingAvailabilityId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const online = Boolean(onlineByBusiness[selectedBusinessId]);
  const selectedBusiness = approvedBusinesses.find((item) => item.id === selectedBusinessId);
  const businessRequests = requests.filter((request) => request.businessId === selectedBusinessId);

  useEffect(() => {
    setOnlineByBusiness((current) => {
      const next = { ...current };
      for (const application of approvedBusinesses) next[application.id] = application.isOnline;
      return next;
    });
    if (!selectedBusinessId && approvedBusinesses[0]) setSelectedBusinessId(approvedBusinesses[0].id);
  }, [applications, selectedBusinessId]);

  const loadRequests = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoadingRequests(true);
    setError("");
    try {
      const [rows, bookingRows] = await Promise.all([
        getCurrentProviderOpenRequests(),
        getCurrentProviderBookings(),
      ]);
      setRequests(rows);
      setBookings(bookingRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load provider requests and bookings.");
    } finally {
      setLoadingRequests(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests, selectedBusinessId]);

  const updatePresence = useCallback(async (next: boolean, silent = false) => {
    if (!selectedBusinessId || savingPresence) return;
    setSavingPresence(true);
    if (!silent) setError("");
    try {
      await setCurrentProviderPresence({
        data: { businessId: selectedBusinessId, isOnline: next },
      });
      setOnlineByBusiness((current) => ({ ...current, [selectedBusinessId]: next }));
      if (next) await loadRequests(true);
      else setRequests((current) => current.filter((item) => item.businessId !== selectedBusinessId));
      if (!silent) toast.success(next ? "This business is now accepting eligible service requests." : "This business is offline for new requests.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Availability could not be updated.";
      setError(message);
      if (!silent) toast.error(message);
    } finally {
      setSavingPresence(false);
    }
  }, [selectedBusinessId, savingPresence, loadRequests]);

  // Keep the online heartbeat fresh while this provider desk is open. If the
  // browser closes, the heartbeat expires and discovery stops showing the unit.
  useEffect(() => {
    if (!online || !selectedBusinessId) return;
    const ping = () => {
      void setCurrentProviderPresence({
        data: { businessId: selectedBusinessId, isOnline: true },
      }).then(() => loadRequests(true)).catch(() => {
        setOnlineByBusiness((current) => ({ ...current, [selectedBusinessId]: false }));
        setError("Your online heartbeat could not be renewed. Go online again before accepting new requests.");
      });
    };
    ping();
    const interval = window.setInterval(ping, 4 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [online, selectedBusinessId, loadRequests]);

  async function toggleServiceAvailability(service: ProductionApplication["services"][number]) {
    if (!selectedBusinessId) return;
    setSavingAvailabilityId(service.id);
    try {
      await setCurrentProviderServiceAvailability({
        data: {
          businessId: selectedBusinessId,
          providerServiceId: service.id,
          isAvailable: !service.isAvailable,
        },
      });
      await onRefresh();
      await loadRequests(true);
      toast.success(!service.isAvailable ? "Service activated for eligible customer requests." : "Service paused for new requests.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Service availability could not be changed.");
    } finally {
      setSavingAvailabilityId(null);
    }
  }

  async function toggleAssetAvailability(asset: ProductionApplication["assets"][number]) {
    if (!selectedBusinessId) return;
    setSavingAvailabilityId(asset.id);
    try {
      await setCurrentProviderAssetAvailability({
        data: {
          businessId: selectedBusinessId,
          assetId: asset.id,
          isAvailable: !asset.isAvailable,
        },
      });
      await onRefresh();
      await loadRequests(true);
      toast.success(!asset.isAvailable ? "Machine marked available for eligible services." : "Machine paused for new assignments.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Machine availability could not be changed.");
    } finally {
      setSavingAvailabilityId(null);
    }
  }

  async function sendQuote(
    request: LiveProviderRequest,
    data: {
      amountRupees: number;
      note: string;
      inclusions: string[];
      exclusions: string[];
      extraCharges: Array<{ label: string; amountRupees: number }>;
      cancellationTerms: string;
      etaMinutes: number | null;
    },
  ) {
    try {
      const result = await submitCurrentProviderQuote({
        data: {
          requestId: request.requestId,
          businessId: request.businessId,
          ...data,
        },
      });
      toast.success("Quote saved and sent to the customer.");
      setRequests((current) => current.filter((item) => item.requestId !== request.requestId));
      return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The quote could not be saved.";
      toast.error(message);
      throw cause;
    }
  }

  return (
    <section className="mt-7 rounded-3xl border border-line bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-field">Live provider operations</p>
          <h2 className="mt-1 font-display text-2xl font-bold">Availability & customer requests</h2>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-muted">
            Only businesses approved by MakeService can go online. New requests are delivered only to the selected business and approved service/equipment.
          </p>
        </div>
        <span className={cn("rounded-full px-3 py-1.5 text-xs font-bold", online ? "bg-field-soft text-field" : "bg-paper text-muted")}>
          {online ? "Online · receiving requests" : "Offline · no new requests"}
        </span>
      </div>

      {!approvedBusinesses.length ? (
        <div className="mt-4 rounded-2xl border border-line bg-paper p-4">
          <p className="font-semibold">Your business is not approved yet.</p>
          <p className="mt-1 text-sm leading-5 text-muted">
            You can review your verification checklist above. Online mode and customer requests remain disabled until an administrator approves the business and its services and machinery.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="grid gap-1.5 text-sm font-semibold">
              Business
              <select
                value={selectedBusinessId}
                onChange={(event) => setSelectedBusinessId(event.target.value)}
                className="h-11 rounded-xl border border-line bg-white px-3 font-normal"
              >
                {approvedBusinesses.map((item) => (
                  <option key={item.id} value={item.id}>{item.tradeName} · {item.city ?? item.district}</option>
                ))}
              </select>
            </label>
            <Button
              disabled={!selectedBusinessId || savingPresence}
              variant={online ? "secondary" : "primary"}
              onClick={() => void updatePresence(!online)}
            >
              {savingPresence ? "Saving…" : online ? "Go offline" : "Go online"}
            </Button>
          </div>

          {selectedBusiness && (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>{selectedBusiness.services.filter((service) => service.verificationStatus === "approved" && service.isListed && service.isAvailable).length} approved/listed available service(s)</span>
                <span>·</span>
                <span>{selectedBusiness.assets.filter((asset) => asset.verificationStatus === "approved" && asset.isAvailable).length} approved available machine(s)</span>
                <span>·</span>
                <span>Online signal expires after 10 minutes without a heartbeat</span>
              </div>

              <div className="mt-5 grid gap-4 rounded-2xl border border-line p-4">
                <div>
                  <h3 className="font-display text-lg font-bold">Activate approved services</h3>
                  <p className="mt-1 text-xs leading-5 text-muted">A service can be listed only after admin approval and at least one approved machine is linked to it.</p>
                </div>
                {selectedBusiness.services.map((service) => {
                  const serviceAssets = selectedBusiness.assets.filter((asset) =>
                    asset.serviceIds.includes(service.serviceId) && asset.verificationStatus === "approved",
                  );
                  const serviceName = getService(service.serviceId)?.name ?? service.serviceId;
                  const canActivate = service.verificationStatus === "approved" && serviceAssets.length > 0;
                  return (
                    <div key={service.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
                      <div>
                        <p className="text-sm font-semibold">{serviceName}</p>
                        <p className="mt-1 text-xs text-muted">{reviewLabel(service.verificationStatus)} · {serviceAssets.length} approved linked machine(s)</p>
                      </div>
                      <Button
                        size="sm"
                        variant={service.isAvailable ? "secondary" : "outline"}
                        disabled={!canActivate || savingAvailabilityId !== null}
                        onClick={() => void toggleServiceAvailability(service)}
                      >
                        {savingAvailabilityId === service.id ? "Saving…" : service.isAvailable ? "Pause service" : "Activate service"}
                      </Button>
                    </div>
                  );
                })}
                <div className="border-t border-line pt-4">
                  <h3 className="font-display text-lg font-bold">Machine availability</h3>
                  <p className="mt-1 text-xs leading-5 text-muted">A machine must be approved and linked to at least one active approved service.</p>
                </div>
                {selectedBusiness.assets.map((asset) => {
                  const linkedService = selectedBusiness.services.some((service) =>
                    asset.serviceIds.includes(service.serviceId) &&
                    service.verificationStatus === "approved" &&
                    service.isListed &&
                    service.isAvailable,
                  );
                  const canActivate = asset.verificationStatus === "approved" && linkedService;
                  return (
                    <div key={asset.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
                      <div>
                        <p className="text-sm font-semibold">{[asset.assetType, asset.make, asset.model].filter(Boolean).join(" ")}</p>
                        <p className="mt-1 text-xs text-muted">{reviewLabel(asset.verificationStatus)} · {asset.serviceIds.length} linked service(s)</p>
                      </div>
                      <Button
                        size="sm"
                        variant={asset.isAvailable ? "secondary" : "outline"}
                        disabled={!canActivate || savingAvailabilityId !== null}
                        onClick={() => void toggleAssetAvailability(asset)}
                      >
                        {savingAvailabilityId === asset.id ? "Saving…" : asset.isAvailable ? "Pause machine" : "Make available"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {error && <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
            <div>
              <h3 className="font-display text-xl font-bold">Assigned requests</h3>
              <p className="text-xs text-muted">Customer contact details stay private until a booking is confirmed.</p>
            </div>
            <Button variant="outline" size="sm" disabled={refreshing || !online} onClick={() => void updatePresence(true, true)}>
              <Activity className="mr-2 size-4" />{refreshing ? "Refreshing…" : "Refresh inbox"}
            </Button>
          </div>

          {!online ? (
            <p className="mt-3 rounded-xl bg-paper p-4 text-sm leading-5 text-muted">
              Go online to refresh your heartbeat and receive requests assigned to this business.
            </p>
          ) : loadingRequests ? (
            <p className="mt-3 rounded-xl bg-paper p-4 text-sm text-muted">Loading assigned customer requests…</p>
          ) : !businessRequests.length ? (
            <p className="mt-3 rounded-xl bg-paper p-4 text-sm leading-5 text-muted">
              No open requests are assigned to this business right now. Keep the desk open while online; the heartbeat will renew automatically.
            </p>
          ) : (
            <div className="mt-3 grid gap-3">
              {businessRequests.map((request) => (
                <ProviderQuoteComposer key={request.requestId} request={request} onSubmit={sendQuote} />
              ))}
            </div>
          )}

          <div className="mt-6 border-t border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-xl font-bold">Confirmed & previous bookings</h3>
                <p className="text-xs text-muted">Booking records for all businesses owned by this provider account.</p>
              </div>
              <span className="text-xs text-muted">{bookings.length} booking(s)</span>
            </div>
            {bookings.filter((booking) => booking.businessId === selectedBusinessId).length === 0 ? (
              <p className="mt-3 rounded-xl bg-paper p-4 text-sm text-muted">
                No bookings have been confirmed for this business yet. Accepted customer quotations appear here.
              </p>
            ) : (
              <div className="mt-3 grid gap-2">
                {bookings.filter((booking) => booking.businessId === selectedBusinessId).map((booking) => (
                  <Link
                    key={booking.bookingId}
                    to="/bookings/$bookingId"
                    params={{ bookingId: booking.bookingId }}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-3 hover:border-field"
                  >
                    <div>
                      <p className="font-semibold">{booking.publicReference} · {getService(booking.serviceId)?.name ?? booking.serviceId}</p>
                      <p className="mt-1 text-xs text-muted">{booking.siteLabel}, {booking.area}, {booking.city}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{inr(booking.amountPaise / 100)}</p>
                      <p className="text-xs font-semibold text-field">{booking.status.replaceAll("_", " ")}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function ProviderQuoteComposer({
  request,
  onSubmit,
}: {
  request: LiveProviderRequest;
  onSubmit: (
    request: LiveProviderRequest,
    data: {
      amountRupees: number; note: string; inclusions: string[]; exclusions: string[];
      extraCharges: Array<{ label: string; amountRupees: number }>;
      cancellationTerms: string; etaMinutes: number | null;
    },
  ) => Promise<unknown>;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [inclusions, setInclusions] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [cancellationTerms, setCancellationTerms] = useState("Rescheduling must be agreed before dispatch. Cancellation charges apply only after provider dispatch.");
  const [eta, setEta] = useState("");
  const [busy, setBusy] = useState(false);
  const service = getService(request.serviceId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountRupees = Number(amount);
    if (!Number.isSafeInteger(amountRupees) || amountRupees < 1) {
      toast.error("Enter a whole-number quote amount in rupees.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(request, {
        amountRupees,
        note,
        inclusions: inclusions.split("\n").map((line) => line.trim()).filter(Boolean),
        exclusions: exclusions.split("\n").map((line) => line.trim()).filter(Boolean),
        extraCharges: [],
        cancellationTerms,
        etaMinutes: eta.trim() ? Number(eta) : null,
      });
    } catch {
      // onSubmit displays the server error.
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{service?.name ?? request.serviceId}</p>
          <p className="mt-1 text-xs text-muted">{request.site.label}, {request.site.area}, {request.site.city}, {request.site.state}</p>
          <p className="mt-1 text-xs text-muted">{formatKm(request.distanceKm)} from your registered business base · {request.whenLabel}</p>
        </div>
        <span className="rounded-full bg-field-soft px-2.5 py-1 text-xs font-semibold text-field">New request</span>
      </div>
      <div className="mt-3 grid gap-1 text-sm">
        {Object.entries(request.requirements).map(([key, value]) => (
          <p key={key}><span className="text-muted">{key.replaceAll("_", " ")}:</span> {value}</p>
        ))}
      </div>
      {request.notes && <p className="mt-2 rounded-xl bg-paper p-3 text-sm">{request.notes}</p>}
      <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 border-t border-line pt-4">
        <label className="grid gap-1 text-sm font-semibold">
          Total quote (₹)
          <input required type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-11 rounded-xl border border-line bg-white px-3 font-normal" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Quote details
          <textarea required minLength={8} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Describe the work scope, price basis and important conditions." className="min-h-20 rounded-xl border border-line bg-white p-3 font-normal" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">
            Included work (one per line)
            <textarea maxLength={1200} value={inclusions} onChange={(event) => setInclusions(event.target.value)} placeholder="Rig, operator, standard setup…" className="min-h-20 rounded-xl border border-line bg-white p-3 font-normal" />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Exclusions (one per line)
            <textarea maxLength={1200} value={exclusions} onChange={(event) => setExclusions(event.target.value)} placeholder="Power supply, permits, extra materials…" className="min-h-20 rounded-xl border border-line bg-white p-3 font-normal" />
          </label>
        </div>
        <label className="grid gap-1 text-sm font-semibold">
          Estimated arrival (minutes, optional)
          <input type="number" min="0" max="10080" step="1" value={eta} onChange={(event) => setEta(event.target.value)} className="h-11 rounded-xl border border-line bg-white px-3 font-normal" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Cancellation/rescheduling terms
          <textarea required minLength={8} maxLength={1200} value={cancellationTerms} onChange={(event) => setCancellationTerms(event.target.value)} className="min-h-16 rounded-xl border border-line bg-white p-3 font-normal" />
        </label>
        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>{busy ? "Sending quote…" : "Send quote to customer"}</Button>
        </div>
      </form>
    </article>
  );
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
  return <article className="rounded-3xl border border-line bg-card p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-xl font-bold">{title}</h2><p className="text-sm text-muted">{place} · {whenLabel}</p><p className="mt-1 text-xs text-muted">Request {requestId.slice(-6)}</p></div><span className="rounded-full bg-paper px-2 py-1 text-xs font-semibold text-muted">New enquiry</span></div><ul className="mt-3 grid gap-1 text-sm text-muted">{lines.map((row) => <li key={row.label}>{row.label}: {row.value}</li>)}{notes && <li>Customer note: {notes}</li>}</ul>{siteImages.length > 0 && <div className="mt-3"><p className="mb-2 text-xs font-semibold text-muted">Work-site photos</p><div className="grid grid-cols-3 gap-2">{siteImages.map((image, i) => <img key={image.slice(-36)} src={image} alt={"Customer work site " + (i + 1)} className="h-24 w-full rounded-xl border border-line object-cover" />)}</div></div>}{existing && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-field-soft p-3"><p className="text-sm font-semibold text-field">Quote already sent · {inr(existing.amount)}</p><a href={"tel:" + customerPhone} className="text-sm font-semibold underline">Call customer</a></div>}{servicePaused && <p className="mt-3 rounded-xl bg-gold-soft p-3 text-xs leading-5 text-gold">This service is paused. Re-enable it under Services & fleet before sending a quote. You may still decline this request.</p>}<div className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr]"><label className="grid gap-1 text-xs font-semibold text-muted">Quote amount (₹)<input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} className="h-11 rounded-xl border border-line px-3 text-base text-ink outline-none" /></label><label className="grid gap-1 text-xs font-semibold text-muted">Quote details and terms<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Travel, fuel, operator, extra hours, fees, cancellation…" className="h-11 rounded-xl border border-line px-3 text-base text-ink outline-none" /></label></div><div className="mt-3 flex flex-wrap gap-2"><Button disabled={servicePaused || !Number(amount) || note.trim().length < 8} onClick={() => onSend(Number(amount), note)}>{existing ? "Update quote" : "Accept request & send quote"}</Button><Button variant="secondary" onClick={onDecline}>Decline request</Button></div></article>;
}
