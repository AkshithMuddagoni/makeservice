import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, BadgeCheck, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { MapCanvas } from "@/components/fieldly/map-canvas";
import { Stars } from "@/components/fieldly/bits";
import { CustomerSignInDialog } from "@/components/fieldly/customer-sign-in-dialog";
import { Button } from "@/components/ui/button";
import { getService, isEligible } from "@/lib/fieldly/catalog";
import { formatKm, kmBetween, travelMinutes } from "@/lib/fieldly/geo";
import { inr } from "@/lib/fieldly/format";
import { priceJob } from "@/lib/fieldly/pricing";
import { t } from "@/lib/fieldly/i18n";
import { useFieldly, useProviders } from "@/lib/fieldly/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/find/$slug")({ component: FindPage });

type SortKey = "recommended" | "nearest" | "rating" | "price";

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
  const req = draft?.serviceId === slug ? draft.requirements : {};

  const rows = useMemo(() => {
    if (!service || !site) return [];
    return providers
      .filter((p) => p.services.includes(service.id))
      .map((p) => {
        const km = kmBetween(site, p);
        const priced = priceJob(service.id, p, req);
        const eligible = isEligible(p, service.id) && p.online;
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
      </div>
    </div>
  );
}
