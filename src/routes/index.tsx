import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, MapPin, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { ServiceIcon } from "@/components/fieldly/icons";
import { MapCanvas } from "@/components/fieldly/map-canvas";
import { SitePicker } from "@/components/fieldly/site-picker";
import { Button } from "@/components/ui/button";
import { SERVICES } from "@/lib/fieldly/catalog";
import { formatKm, kmBetween } from "@/lib/fieldly/geo";
import { t } from "@/lib/fieldly/i18n";
import { useFieldly, useProviders } from "@/lib/fieldly/store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const site = useFieldly((s) => s.site);
  const setSite = useFieldly((s) => s.setSite);
  const lang = useFieldly((s) => s.lang);

  if (!site) {
    const benefits = [
      ["01", t(lang, "gate_benefit_1")],
      ["02", t(lang, "gate_benefit_2")],
      ["03", t(lang, "gate_benefit_3")],
    ];

    return (
      <section className="border-b border-line bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:py-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-10 lg:py-14">
          <div className="pt-1 lg:pt-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-field-soft px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-field">
              <MapPin className="size-4" />
              {t(lang, "gate_kicker")}
            </div>
            <h1 className="mt-5 max-w-xl font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl lg:text-6xl">
              {t(lang, "gate_title")}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted md:text-lg">
              {t(lang, "gate_sub")}
            </p>
            <div className="mt-7 grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {benefits.map(([number, label]) => (
                <div key={number} className="flex items-center gap-3 rounded-2xl border border-line bg-white/80 p-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-paper text-sm font-bold text-field">
                    {number}
                  </span>
                  <span className="text-sm font-semibold">{label}</span>
                </div>
              ))}
            </div>
            <p className="mt-6 flex items-start gap-2 text-sm leading-6 text-muted">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-field" />
              <span>{t(lang, "gate_privacy")}</span>
            </p>
          </div>
          <div className="rounded-3xl border border-line bg-white p-4 shadow-sm md:p-6">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-widest text-field">01 / LOCATION</p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight md:text-3xl">
                {t(lang, "gate_panel_title")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">{t(lang, "gate_panel_sub")}</p>
            </div>
            <SitePicker onPick={setSite} />
          </div>
        </div>
      </section>
    );
  }

  return <Marketplace />;
}

function Marketplace() {
  const lang = useFieldly((s) => s.lang);
  const site = useFieldly((s) => s.site)!;
  const providers = useProviders();
  const [query, setQuery] = useState("");
  const services = SERVICES.filter((service) =>
    `${service.name} ${service.blurb}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const nearby = useMemo(
    () =>
      providers
        .map((provider) => ({ provider, km: kmBetween(site, provider) }))
        .filter((row) => row.provider.approved && row.provider.verified.identity && row.km < 40)
        .sort((a, b) => a.km - b.km)
        .slice(0, 4),
    [providers, site],
  );

  return (
    <div>
      <section className="border-b border-line bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:py-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-10">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-field">
              {site.city} · {site.state}
            </p>
            <h1 className="mt-3 max-w-2xl font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              {t(lang, "home_title")}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted">{t(lang, "home_sub")}</p>
            <label className="mt-6 flex h-14 items-center gap-3 rounded-2xl border border-line bg-paper px-4 focus-within:border-field focus-within:ring-2 focus-within:ring-field/15">
              <Search className="size-5 shrink-0 text-muted" />
              <span className="sr-only">Search services</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t(lang, "search_ph")}
                className="w-full bg-transparent text-base outline-none"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-field-soft px-3 py-1.5 font-semibold text-field">
                <MapPin className="size-3.5" /> {site.label}
              </span>
              <span className="rounded-full bg-paper px-3 py-1.5 font-medium text-muted">
                {site.city}, {site.state}
              </span>
            </div>
          </div>
          <div>
            <div className="h-72 overflow-hidden rounded-3xl border border-line md:h-80">
              <MapCanvas
                center={site}
                zoom={12}
                markers={[
                  { id: "site", ...site, label: "Work site", kind: "site" },
                  ...nearby.map(({ provider }) => ({
                    id: provider.id,
                    lat: provider.lat,
                    lng: provider.lng,
                    label: "Example",
                    kind: "provider" as const,
                  })),
                ]}
              />
            </div>
            <p className="mt-2 text-xs leading-5 text-muted">{t(lang, "map_preview_note")}</p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8 md:py-10">
        <div>
          <h2 className="font-display text-2xl font-bold md:text-3xl">{t(lang, "services_title")}</h2>
          <p className="mt-1 text-sm text-muted">{t(lang, "services_sub")}</p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <Link
              key={service.id}
              to="/services/$slug"
              params={{ slug: service.id }}
              className="group flex min-h-36 items-center gap-4 rounded-2xl border border-line bg-card p-4 transition hover:-translate-y-0.5 hover:border-field hover:shadow-sm"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-field-soft text-field">
                <ServiceIcon name={service.icon} className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{service.name}</span>
                <span className="mt-1 block text-sm leading-5 text-muted">{service.blurb}</span>
                <span className="mt-2 block text-xs font-bold text-field">{t(lang, "service_card_cta")}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-1 group-hover:text-field" />
            </Link>
          ))}
          {services.length === 0 && <p className="text-muted">{t(lang, "no_services")}</p>}
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-line bg-card p-5 md:p-6">
            <h2 className="font-display text-2xl font-bold">{t(lang, "nearby")}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{t(lang, "sample_listing_note")}</p>
            {nearby.length > 0 ? (
              <div className="mt-3 divide-y divide-line">
                {nearby.map(({ provider, km }) => (
                  <Link
                    key={provider.id}
                    to="/providers/$providerId"
                    params={{ providerId: provider.id }}
                    search={{ service: provider.services[0] ?? "" }}
                    className="flex items-center gap-3 py-4"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-paper font-display text-sm font-bold">
                      {provider.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{provider.name}</span>
                      <span className="mt-1 block text-xs text-muted">
                        {formatKm(km)} · {provider.equipment}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-paper px-2 py-1 text-xs font-semibold text-muted">
                      {t(lang, "sample_listing_badge")}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-line bg-paper p-5">
                <MapPin className="size-6 text-field" />
                <h3 className="mt-3 font-semibold">{t(lang, "empty_nearby_title")}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{t(lang, "empty_nearby_body")}</p>
              </div>
            )}
          </section>
          <section className="rounded-3xl bg-ink p-5 text-on-ink md:p-6">
            <ShieldCheck className="size-8 text-gold-soft" />
            <h2 className="mt-3 font-display text-2xl font-bold">{t(lang, "trust_title")}</h2>
            <p className="mt-2 text-sm leading-6 text-on-ink/80">{t(lang, "trust_body")}</p>
          </section>
        </div>

        <section className="mt-10">
          <h2 className="font-display text-2xl font-bold md:text-3xl">{t(lang, "how_title")}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              ["01", "how_1_t", "how_1_d"],
              ["02", "how_2_t", "how_2_d"],
              ["03", "how_3_t", "how_3_d"],
            ].map(([number, title, body]) => (
              <div key={number} className="rounded-2xl border border-line bg-card p-5">
                <div className="grid size-9 place-items-center rounded-xl bg-field-soft font-display text-sm font-bold text-field">
                  {number}
                </div>
                <h3 className="mt-3 font-display text-lg font-bold">{t(lang, title)}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{t(lang, body)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 flex flex-col items-start justify-between gap-4 rounded-3xl border border-line bg-field-soft p-5 md:flex-row md:items-center md:p-7">
          <div>
            <h2 className="font-display text-2xl font-bold">{t(lang, "cta_title")}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{t(lang, "cta_sub")}</p>
          </div>
          <Button asChild variant="primary">
            <Link to="/join">{t(lang, "cta_btn")}</Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
