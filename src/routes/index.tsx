import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { ServiceIcon } from "@/components/fieldly/icons";
import { MapCanvas } from "@/components/fieldly/map-canvas";
import { SitePicker } from "@/components/fieldly/site-picker";
import { Stars } from "@/components/fieldly/bits";
import { Button } from "@/components/ui/button";
import { SERVICES, isEligible } from "@/lib/fieldly/catalog";
import { formatKm, kmBetween } from "@/lib/fieldly/geo";
import { t } from "@/lib/fieldly/i18n";
import { useFieldly, useProviders } from "@/lib/fieldly/store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const site = useFieldly((s) => s.site);
  const setSite = useFieldly((s) => s.setSite);
  const lang = useFieldly((s) => s.lang);
  if (!site) {
    return (
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1fr_1.05fr] lg:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-field">{t(lang, "gate_kicker")}</p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight md:text-5xl">{t(lang, "gate_title")}</h1>
          <p className="mt-3 max-w-xl text-base text-muted">{t(lang, "gate_sub")}</p>
          <p className="mt-4 flex items-center gap-2 text-sm text-muted">
            <ShieldCheck className="size-4 text-field" />
            {t(lang, "gate_privacy")}
          </p>
        </div>
        <div className="rounded-3xl border border-line bg-card p-4 md:p-5">
          <SitePicker onPick={setSite} />
        </div>
      </div>
    );
  }
  return <Marketplace />;
}

function Marketplace() {
  const lang = useFieldly((s) => s.lang);
  const site = useFieldly((s) => s.site)!;
  const providers = useProviders();
  const [query, setQuery] = useState("");
  const services = SERVICES.filter((s) =>
    `${s.name} ${s.blurb}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const nearby = useMemo(() => {
    return providers
      .map((p) => ({ p, km: kmBetween(site, p) }))
      .filter((row) => row.p.verified.identity && row.km < 40)
      .sort((a, b) => a.km - b.km)
      .slice(0, 4);
  }, [providers, site]);
  const online = providers.filter((p) => p.online && p.verified.identity).length;

  return (
    <div>
      <section className="border-b border-line bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-field">
              {site.city} · {site.state}
            </p>
            <h1 className="mt-2 max-w-xl font-display text-4xl font-bold tracking-tight md:text-5xl">
              {t(lang, "home_title")}
            </h1>
            <p className="mt-3 max-w-xl text-base text-muted">{t(lang, "home_sub")}</p>
            <label className="mt-6 flex h-14 items-center gap-3 rounded-2xl border border-line bg-paper px-4">
              <span className="sr-only">Search services</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t(lang, "search_ph")}
                className="w-full bg-transparent text-base outline-none"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-field-soft px-3 py-1 font-semibold text-field">{online} online nearby</span>
              <span className="rounded-full bg-paper px-3 py-1 font-semibold">{site.label}</span>
              <span className="rounded-full bg-paper px-3 py-1 font-semibold">{site.area}</span>
            </div>
          </div>
          <div className="h-80 overflow-hidden rounded-3xl border border-line">
            <MapCanvas
              center={site}
              zoom={12}
              markers={[
                { id: "site", ...site, label: "Your site", kind: "site" },
                ...nearby.map(({ p }) => ({
                  id: p.id,
                  lat: p.lat,
                  lng: p.lng,
                  label: p.name.split(" ")[0],
                  kind: "provider" as const,
                })),
              ]}
            />
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="font-display text-2xl font-bold">{t(lang, "services_title")}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => {
            const count = providers.filter((p) => isEligible(p, service.id) && kmBetween(site, p) <= service.radiusKm).length;
            return (
              <Link
                key={service.id}
                to="/services/$slug"
                params={{ slug: service.id }}
                className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4 hover:border-ink"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-paper text-ink">
                  <ServiceIcon name={service.icon} className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{service.name}</span>
                  <span className="block text-sm text-muted">{service.blurb}</span>
                  <span className="mt-1 block text-sm font-semibold text-field">
                    {service.fromLabel} · {count} in range
                  </span>
                </span>
                <ArrowRight className="size-4 text-muted" />
              </Link>
            );
          })}
          {services.length === 0 && <p className="text-muted">Nothing matches that search.</p>}
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-line bg-card p-5">
            <h2 className="font-display text-2xl font-bold">{t(lang, "nearby")}</h2>
            <div className="mt-3 divide-y divide-line">
              {nearby.map(({ p, km }) => (
                <Link
                  key={p.id}
                  to="/providers/$providerId"
                  params={{ providerId: p.id }}
                  search={{ service: p.services[0] ?? "" }}
                  className="flex items-center gap-3 py-3"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-paper font-display text-sm font-bold">
                    {p.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 font-semibold">
                      <span className="truncate">{p.name}</span>
                      {p.verified.identity && <BadgeCheck className="size-4 shrink-0 text-field" />}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                      <Stars value={p.rating} />
                      {p.rating.toFixed(1)} · {formatKm(km)} · {p.equipment}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
          <section className="rounded-3xl bg-ink p-5 text-on-ink">
            <ShieldCheck className="size-8 text-gold-soft" />
            <h2 className="mt-3 font-display text-2xl font-bold">{t(lang, "trust_title")}</h2>
            <p className="mt-2 text-sm text-on-ink/80">{t(lang, "trust_body")}</p>
          </section>
        </div>

        <h2 className="mt-12 font-display text-2xl font-bold">{t(lang, "how_title")}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            ["01", "how_1_t", "how_1_d"],
            ["02", "how_2_t", "how_2_d"],
            ["03", "how_3_t", "how_3_d"],
          ].map(([n, title, body]) => (
            <div key={n} className="rounded-2xl border border-line bg-card p-5">
              <div className="font-display text-sm font-bold text-gold">{n}</div>
              <h3 className="mt-3 font-display text-xl font-bold">{t(lang, title)}</h3>
              <p className="mt-2 text-sm text-muted">{t(lang, body)}</p>
            </div>
          ))}
        </div>

        <section className="mt-12 flex flex-col items-start justify-between gap-4 rounded-3xl border border-line bg-field-soft p-6 md:flex-row md:items-center">
          <div>
            <h2 className="font-display text-2xl font-bold">{t(lang, "cta_title")}</h2>
            <p className="mt-1 max-w-xl text-sm text-muted">{t(lang, "cta_sub")}</p>
          </div>
          <Button asChild variant="primary">
            <Link to="/join">{t(lang, "cta_btn")}</Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
