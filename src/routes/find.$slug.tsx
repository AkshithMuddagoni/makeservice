import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, BadgeCheck, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MapCanvas } from "@/components/fieldly/map-canvas";
import { Stars } from "@/components/fieldly/bits";
import { CustomerSignInDialog } from "@/components/fieldly/customer-sign-in-dialog";
import { Button } from "@/components/ui/button";
import { authEnabled } from "@/lib/auth/client";
import { createCurrentJobRequest, discoverCurrentProviders } from "@/lib/fieldly/account.functions";
import { getService, isAvailableForService } from "@/lib/fieldly/catalog";
import { formatKm, kmBetween, travelMinutes } from "@/lib/fieldly/geo";
import { inr } from "@/lib/fieldly/format";
import { priceJob } from "@/lib/fieldly/pricing";
import { t } from "@/lib/fieldly/i18n";
import { useFieldly, useProviders } from "@/lib/fieldly/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/find/$slug")({ component: FindPage });

type SortKey = "recommended" | "nearest" | "rating" | "price";

type LiveProvider = {
  businessId: string;
  providerServiceId: string;
  serviceId: string;
  name: string;
  area: string;
  city: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  yearsExperience: number;
  languages: string[];
  bio: string;
  equipment: string;
  rating: number;
  reviewCount: number;
  distanceKm: number;
};

type CreatedLiveRequest = { requestId: string; providerName: string; distanceKm: number };

function FindPage() {
  const { slug } = Route.useParams();
  const service = getService(slug);
  const site = useFieldly((s) => s.site);
  const draft = useFieldly((s) => s.draft);
  const lang = useFieldly((s) => s.lang);
  const providers = useProviders();
  const session = useFieldly((s) => s.session);
  const [sort, setSort] = useState<SortKey>("recommended");
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [q, setQ] = useState("");
  const [signInOpen, setSignInOpen] = useState(true);
  const [liveProviders, setLiveProviders] = useState<LiveProvider[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [requestingBusinessId, setRequestingBusinessId] = useState<string | null>(null);
  const [createdLiveRequest, setCreatedLiveRequest] = useState<CreatedLiveRequest | null>(null);
  const req = draft?.serviceId === slug ? draft.requirements : {};

  useEffect(() => {
    if (!authEnabled || !site || session?.role !== "customer" || !service) return;
    let cancelled = false;
    setLiveLoading(true);
    setLiveError("");
    void discoverCurrentProviders({ data: { serviceId: slug, site } })
      .then((result) => { if (!cancelled) setLiveProviders(result); })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLiveProviders([]);
          setLiveError(error instanceof Error ? error.message : "Unable to load verified providers.");
        }
      })
      .finally(() => { if (!cancelled) setLiveLoading(false); });
    return () => { cancelled = true; };
  }, [slug, site, session?.role, service]);

  async function createLiveRequest(provider: LiveProvider) {
    if (!site || !service || session?.role !== "customer") {
      setLiveError("Sign in with your customer account and confirm the work site first.");
      return;
    }
    if (draft?.serviceId !== slug) {
      setLiveError("Please complete the service requirements before requesting a quote.");
      return;
    }
    setRequestingBusinessId(provider.businessId);
    setLiveError("");
    try {
      const whenLabel = draft.whenLabel;
      const scheduledFor = /^\\d{4}-\\d{2}-\\d{2}$/.test(whenLabel)
        ? new Date(whenLabel + "T09:00:00+05:30").toISOString()
        : null;
      const result = await createCurrentJobRequest({
        data: {
          serviceId: slug,
          businessId: provider.businessId,
          site,
          requirements: draft.requirements,
          whenLabel,
          scheduledFor,
          notes: draft.notes,
          detailsConsent: true,
        },
      });
      setCreatedLiveRequest({
        requestId: result.requestId,
        providerName: result.providerName,
        distanceKm: result.distanceKm,
      });
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "Your request could not be saved.");
    } finally {
      setRequestingBusinessId(null);
    }
  }

  const rows = useMemo(() => {
    if (!service || !site) return [];
    return providers
      .filter((p) => p.services.includes(service.id))
      .map((p) => {
        const km = kmBetween(site, p);
        const priced = priceJob(service.id, p, req);
        const eligible = isAvailableForService(p, service.id) && km <= service.radiusKm;
        const score = p.rating * 20 - km * 1.1 + (eligible ? 6 : -30) + (p.verified.insurance ? 1 : 0);
        return { p, km, priced, eligible, score };
      })
      .filter((row) => row.km <= service.radiusKm + 15)
      .filter((row) => `${row.p.name} ${row.p.equipment}`.toLowerCase().includes(q.trim().toLowerCase()));
  }, [providers, service, site, req, q]);

  const hidden = rows.filter((r) => !r.eligible).length;
  const visible = rows
    .filter((r) => (verifiedOnly ? r.eligible : true))
    .sort((a, b) => {
      if (sort === "nearest") return a.km - b.km;
      if (sort === "rating") return b.p.rating - a.p.rating;
      if (sort === "price") return a.priced.amount - b.priced.amount;
      return b.score - a.score;
    });

  if (!service) {
    return <p className="px-4 py-16">Unknown service.</p>;
  }
  if (!site) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <h1 className="font-display text-3xl font-bold">Set the work site first.</h1>
        <Link to="/" className="mt-4 inline-block font-semibold">
          Choose a pin
        </Link>
      </div>
    );
  }

  if (!session || session.role !== "customer") {
    return (
      <main className="mx-auto min-h-[60vh] max-w-2xl px-4 py-10">
        <section className="rounded-3xl border border-line bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-field">Site and service ready</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold">Sign in to continue.</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Sign in to review local options and request quotes for {service.name}.
          </p>
          <Button className="mt-5" onClick={() => setSignInOpen(true)}>Sign in and continue</Button>
        </section>
        <CustomerSignInDialog
          open={signInOpen}
          onClose={() => setSignInOpen(false)}
          onSuccess={() => setSignInOpen(false)}
        />
      </main>
    );
  }

  const markers = [
    { id: "site", lat: site.lat, lng: site.lng, label: "Your site", kind: "site" as const },
    ...visible.slice(0, 8).map((row) => ({
      id: row.p.id,
      lat: row.p.lat,
      lng: row.p.lng,
      label: `${row.p.name} · ${formatKm(row.km)}`,
      kind: "vehicle" as const,
    })),
  ];

  if (authEnabled) {
    const liveMarkers = [
      { id: "site", lat: site.lat, lng: site.lng, label: "Your work site", kind: "site" as const },
      ...liveProviders.slice(0, 12).map((provider) => ({
        id: provider.businessId,
        lat: provider.latitude,
        lng: provider.longitude,
        label: provider.name + " · " + formatKm(provider.distanceKm),
        kind: "provider" as const,
      })),
    ];

    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link to="/services/$slug" params={{ slug }} className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
          <ArrowLeft className="size-4" /> Edit service details
        </Link>
        <header className="mt-3">
          <p className="text-xs font-bold uppercase tracking-widest text-field">Verified provider network</p>
          <h1 className="mt-1 font-display text-3xl font-bold">{service.name} near {site.label}</h1>
          <p className="mt-2 text-sm text-muted">
            Listings require an approved business, approved service, approved available equipment and a recent provider-online signal.
          </p>
        </header>
        {createdLiveRequest ? (
          <section className="mt-6 rounded-3xl border border-field/20 bg-field-soft/40 p-6">
            <div className="flex items-center gap-2 text-sm font-bold text-field">
              <BadgeCheck className="size-5" /> Service request saved
            </div>
            <h2 className="mt-2 font-display text-2xl font-bold">Your request was sent to {createdLiveRequest.providerName}.</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Reference: <span className="font-mono font-semibold">{createdLiveRequest.requestId}</span><br />
              Provider base location: {formatKm(createdLiveRequest.distanceKm)} away.<br />
              No quote has been accepted, no booking is confirmed, and no payment has been taken.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild><Link to="/requests/$requestId" params={{ requestId: createdLiveRequest.requestId }}>View saved request</Link></Button>
              <Button variant="outline" asChild><Link to="/">Back to home</Link></Button>
            </div>
          </section>
        ) : (
          <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="min-w-0">
              {liveLoading ? (
                <p className="rounded-2xl border border-line bg-card p-5 text-sm text-muted">Searching verified providers in the selected service radius…</p>
              ) : liveProviders.length === 0 ? (
                <div className="rounded-2xl border border-line bg-card p-5">
                  <h2 className="font-display text-xl font-bold">No verified providers are currently available.</h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    No provider currently meets all approval, equipment, availability and recent-online requirements within {service.radiusKm} km. Demo profiles are not shown as real providers.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  <p className="text-sm font-semibold">{liveProviders.length} verified provider{liveProviders.length === 1 ? "" : "s"} found</p>
                  {liveProviders.map((provider) => (
                    <article key={provider.businessId} className="rounded-2xl border border-line bg-card p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-semibold">
                            <span className="truncate">{provider.name}</span>
                            <BadgeCheck className="size-4 shrink-0 text-field" />
                            <span className="rounded-full bg-field-soft px-2 py-1 text-xs font-semibold text-field">Verified</span>
                          </div>
                          <p className="mt-1 text-xs text-muted">{provider.area}, {provider.city}, {provider.state}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                            {provider.reviewCount > 0 ? (
                              <><Stars value={provider.rating} /><span>{provider.rating.toFixed(1)} · {provider.reviewCount} reviews</span></>
                            ) : <span>New provider · no reviews yet</span>}
                            <span>{formatKm(provider.distanceKm)} away</span>
                            <span>{provider.yearsExperience} years’ experience</span>
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 text-sm">{provider.equipment || service.name}</p>
                      {provider.bio && <p className="mt-1 text-sm leading-5 text-muted">{provider.bio}</p>}
                      {provider.languages.length > 0 && <p className="mt-2 text-xs text-muted">Languages: {provider.languages.join(", ")}</p>}
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-muted">Final price is provided in the provider's quote.</p>
                        <Button
                          disabled={requestingBusinessId !== null}
                          onClick={() => void createLiveRequest(provider)}
                        >
                          {requestingBusinessId === provider.businessId ? "Sending request…" : "Request a quote"}
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {liveError && <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">{liveError}</p>}
              {draft?.serviceId === slug && draft.siteImages?.length ? (
                <p className="mt-3 text-xs leading-5 text-muted">
                  You selected {draft.siteImages.length} site photo(s). Secure photo upload is not enabled yet, so these photos are not included in the database request.
                </p>
              ) : null}
            </section>
            <aside className="h-80 overflow-hidden rounded-2xl border border-line lg:sticky lg:top-20">
              <MapCanvas center={site} markers={liveMarkers} className="h-full" />
              <p className="bg-card px-3 py-2 text-xs text-muted">
                Map pins show verified provider base locations, not live vehicle positions.
              </p>
            </aside>
          </div>
        )}
      </main>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl lg:min-h-screen lg:grid-cols-2">
      <div className="border-line lg:border-r">
        <div className="px-4 py-5">
          <Link to="/services/$slug" params={{ slug }} className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
            <ArrowLeft className="size-4" /> Edit details
          </Link>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{service.name}</h1>
          <p className="text-sm text-muted">
            {site.label}, {site.area}. {visible.length} shown
            {draft?.serviceId === slug ? ` · ${draft.whenLabel}` : ""}.
          </p>
          <div className="mt-4 rounded-2xl border border-field/15 bg-field-soft/60 p-3">
            <p className="text-sm font-bold text-ink">Choose one provider to review and request the service.</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Compare distance, ratings, equipment, response time and the indicative estimate. Your request goes only to the provider you choose; no booking is confirmed until you review and accept their quote.
            </p>
          </div>
          <label className="mt-3 flex h-11 items-center rounded-xl border border-line bg-card px-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by name"
              className="w-full bg-transparent text-base outline-none"
            />
          </label>
          <div className="mt-3 flex gap-2 overflow-auto">
            {(
              [
                ["recommended", "Recommended"],
                ["nearest", "Nearest"],
                ["rating", "Top rated"],
                ["price", "Lowest quote"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                className={cn(
                  "h-9 shrink-0 rounded-lg px-3 text-xs font-semibold",
                  sort === key ? "bg-ink text-on-ink" : "border border-line bg-card",
                )}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setVerifiedOnly((v) => !v)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-xs font-semibold",
                verifiedOnly ? "bg-field text-on-field" : "border border-line bg-card",
              )}
            >
              <SlidersHorizontal className="size-3.5" />
              {verifiedOnly ? t(lang, "verified_only") : t(lang, "show_unchecked")}
            </button>
          </div>
          {verifiedOnly && hidden > 0 && (
            <p className="mt-2 text-xs text-muted">{t(lang, "hidden_note", { n: hidden })}</p>
          )}
        </div>
        <div className="h-64 px-4 lg:hidden">
          <MapCanvas center={site} markers={markers} />
          <p className="mt-2 text-xs leading-5 text-muted">
            Pins show listed provider locations. Distances are approximate straight-line distances; vehicle GPS is not connected in this preview.
          </p>
        </div>
        <div className="grid gap-2 px-4 py-4">
          {visible.map((row) => (
            <Link
              key={row.p.id}
              to="/providers/$providerId"
              params={{ providerId: row.p.id }}
              search={{ service: slug }}
              className={cn(
                "rounded-2xl border border-line bg-card p-4",
                !row.eligible && "opacity-70",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1 font-semibold">
                    <span className="truncate">{row.p.name}</span>
                    {row.eligible ? (
                      <BadgeCheck className="size-4 shrink-0 text-field" />
                    ) : (
                      <span className="rounded bg-danger-soft px-1.5 py-0.5 text-xs font-semibold text-danger">
                        Not bookable
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Stars value={row.p.rating} />
                    <span>
                      {row.p.rating.toFixed(1)} · {row.p.reviewCount}
                    </span>
                    <span>{formatKm(row.km)} away</span>
                    <span>~{travelMinutes(row.km)} min travel estimate</span>
                    <span>Replies in ~{row.p.replyMin} min</span>
                  </div>
                  <p className="mt-2 text-sm text-muted">{row.p.equipment}</p>
                  <p className="mt-1 text-xs text-muted">
                    {row.p.years} years’ experience · {row.p.jobs} recorded jobs · {row.p.languages.join(", ")}
                  </p>
                  <p className="mt-2 text-xs font-bold text-field">View profile, review service details &amp; request →</p>
                </div>
                <div className="text-right">
                  <div className="font-display text-lg font-bold">
                    {row.priced.amount > 0 ? inr(row.priced.amount) : "Quote needed"}
                  </div>
                  <div className="text-xs text-muted">{row.priced.summary}</div>
                </div>
              </div>
            </Link>
          ))}
          {visible.length === 0 && (
            <p className="rounded-2xl bg-card p-4 text-sm text-muted">
              Nobody with checked papers is inside the usual range. Change the site or show unchecked listings.
            </p>
          )}
        </div>
      </div>
      <div className="sticky top-16 hidden h-screen p-4 lg:block">
        <MapCanvas center={site} markers={markers} className="h-full min-h-0" />
        <p className="mt-2 text-xs leading-5 text-muted">
          Pins show listed provider locations, not live vehicle positions. Use the provider's profile to compare verification, equipment, ratings and terms.
        </p>
      </div>
    </div>
  );
}
