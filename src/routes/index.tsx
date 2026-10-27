import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  LocateFixed,
  ListTree,
  MapPin,
  MapPinned,
  Search,
  ShieldCheck,
  Sprout,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { MapCanvas } from "@/components/fieldly/map-canvas";
import { SitePicker } from "@/components/fieldly/site-picker";
import { Button } from "@/components/ui/button";
import { SERVICES } from "@/lib/fieldly/catalog";
import { formatKm, kmBetween } from "@/lib/fieldly/geo";
import { t } from "@/lib/fieldly/i18n";
import { useFieldly, useProviders } from "@/lib/fieldly/store";

export const Route = createFileRoute("/")({ component: Home });

type LocationMethod = "manual" | "map" | "gps";

const HERO_IMAGE =
  "https://images.pexels.com/photos/35565815/pexels-photo-35565815.jpeg?auto=compress&cs=tinysrgb&w=2000";

const SERVICE_PHOTOS: Record<string, { src: string; alt: string; title: string }> = {
  borewell: {
    src: "https://images.pexels.com/photos/29470002/pexels-photo-29470002.jpeg?auto=compress&cs=tinysrgb&w=900",
    alt: "Heavy-duty drilling rig at an Indian construction site",
    title: "Borewell Services",
  },
  jcb: {
    src: "https://images.pexels.com/photos/35565815/pexels-photo-35565815.jpeg?auto=compress&cs=tinysrgb&w=900",
    alt: "Yellow backhoe loader working with a tractor on a construction site",
    title: "JCB & Excavators",
  },
  crane: {
    src: "https://images.pexels.com/photos/35693058/pexels-photo-35693058.jpeg?auto=compress&cs=tinysrgb&w=900",
    alt: "Mobile construction crane displayed outdoors",
    title: "Cranes",
  },
  tractor: {
    src: "https://images.pexels.com/photos/34861587/pexels-photo-34861587.jpeg?auto=compress&cs=tinysrgb&w=900",
    alt: "Red tractor working in a green paddy field in India",
    title: "Tractors",
  },
  tanker: {
    src: "https://images.pexels.com/photos/17168925/pexels-photo-17168925.jpeg?auto=compress&cs=tinysrgb&w=900",
    alt: "Water tanker truck spraying water on a work site",
    title: "Water Tankers",
  },
  tipper: {
    src: "https://images.pexels.com/photos/14475776/pexels-photo-14475776.jpeg?auto=compress&cs=tinysrgb&w=900",
    alt: "Yellow dump truck on a construction site",
    title: "Trucks & Tippers",
  },
};

const POPULAR_SERVICE_IDS = ["borewell", "jcb", "crane", "tractor", "tanker", "tipper"];

function Home() {
  const site = useFieldly((s) => s.site);
  const setSite = useFieldly((s) => s.setSite);
  const lang = useFieldly((s) => s.lang);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMethod, setPickerMethod] = useState<LocationMethod>("manual");
  const [showAllServices, setShowAllServices] = useState(false);

  if (site) return <Marketplace />;

  const methodOptions = [
    { id: "manual" as const, label: "Manual", detail: "Enter address", icon: ListTree },
    { id: "map" as const, label: "Map", detail: "Drop a pin", icon: MapPinned },
    { id: "gps" as const, label: "Use my location", detail: "GPS", icon: LocateFixed },
  ];

  const benefitOptions = [
    { icon: MapPin, title: "Precise work-site pin", detail: "Choose the actual job location" },
    { icon: BadgeCheck, title: "Clear provider details", detail: "Review listing information first" },
    { icon: CheckCircle2, title: "Easy booking flow", detail: "Share needs and compare quotes" },
    { icon: Clock3, title: "Better coordination", detail: "Give the operator useful site details" },
  ];

  const featuredServices = SERVICES.filter((service) => POPULAR_SERVICE_IDS.includes(service.id));
  const displayedServices = showAllServices ? SERVICES : featuredServices;

  return (
    <div className="fieldly-landing">
      <section
        className="fieldly-home-hero relative overflow-hidden"
        style={{
          backgroundImage:
            'linear-gradient(90deg, rgba(226, 243, 255, 0.97) 0%, rgba(235, 247, 255, 0.9) 37%, rgba(235, 247, 255, 0.38) 68%, rgba(235, 247, 255, 0.08) 100%), url("' +
            HERO_IMAGE +
            '")',
        }}
      >
        <div className="relative mx-auto grid max-w-6xl gap-7 px-4 py-8 sm:py-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(260px,0.7fr)] lg:items-center lg:gap-10 lg:py-14">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide text-field shadow-sm backdrop-blur">
              <MapPin className="size-4" />
              {t(lang, "gate_kicker")}
            </div>
            <h1 className="mt-4 max-w-2xl font-display text-4xl font-extrabold leading-[1.04] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Construction &amp; Field Equipment Services{" "}
              <span className="text-field">Across India</span>
            </h1>
            <p className="mt-4 max-w-xl text-base font-medium leading-7 text-ink/90 sm:text-lg">
              Book borewell rigs, JCBs, cranes, tractors, water tankers and more — at your work site, quickly and easily.
            </p>

            <div className="mt-6 max-w-2xl rounded-3xl border border-white/90 bg-white/95 p-4 shadow-[0_20px_55px_rgba(20,40,58,0.16)] backdrop-blur sm:p-5">
              <h2 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl">
                Where is your work site?
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                Choose how you want to set the location.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {methodOptions.map(({ id, label, detail, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={pickerMethod === id}
                    onClick={() => setPickerMethod(id)}
                    className={
                      "flex min-h-[86px] flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-center transition sm:min-h-24 " +
                      (pickerMethod === id
                        ? "border-field bg-field-soft text-field shadow-sm ring-1 ring-field/20"
                        : "border-line bg-paper text-ink hover:border-field/60 hover:bg-field-soft/50")
                    }
                  >
                    <Icon className="size-5 sm:size-6" />
                    <span className="text-xs font-bold leading-tight sm:text-sm">{label}</span>
                    <span className="hidden text-[11px] leading-none text-muted sm:block">{detail}</span>
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="primary"
                className="mt-4 h-12 w-full rounded-xl text-base font-bold shadow-sm"
                onClick={() => setPickerOpen(true)}
              >
                Enter location <ArrowRight className="ml-2 size-4" />
              </Button>
              <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-field" />
                {t(lang, "gate_privacy")}
              </p>
            </div>
          </div>

          <div className="hidden lg:flex lg:items-end lg:justify-end">
            <div className="mb-1 max-w-xs rounded-3xl border border-white/60 bg-white/75 p-5 shadow-xl backdrop-blur-md">
              <span className="grid size-12 place-items-center rounded-2xl bg-field-soft text-field">
                <Sprout className="size-7" />
              </span>
              <h2 className="mt-4 font-display text-2xl font-extrabold leading-tight">
                From farm fields to construction sites.
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Set the exact work location, choose the equipment and compare the details before you book.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["Construction", "Agriculture", "Water", "Transport"].map((item) => (
                  <span key={item} className="rounded-full border border-line bg-white/90 px-3 py-1.5 text-xs font-bold text-ink">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-line bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-4 py-5 sm:grid-cols-4 sm:gap-4 sm:py-6">
          {benefitOptions.map(({ icon: Icon, title, detail }) => (
            <div key={title} className="flex items-center gap-3 rounded-2xl p-2 sm:gap-3 sm:p-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-sky-50 text-field ring-1 ring-sky-100 sm:size-12">
                <Icon className="size-5 sm:size-6" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold leading-tight text-ink">{title}</span>
                <span className="mt-1 hidden text-xs leading-4 text-muted sm:block">{detail}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:py-10 lg:py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-field">Explore Fieldly</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
              Popular Services
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Equipment for construction, agriculture and everyday site work.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAllServices((current) => !current)}
            className="mb-1 inline-flex shrink-0 items-center gap-1 text-sm font-extrabold text-field hover:underline"
          >
            {showAllServices ? "Show popular" : "See all"}
            <ArrowRight className="size-4" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-3">
          {displayedServices.map((service) => {
            const photo = SERVICE_PHOTOS[service.id] ?? SERVICE_PHOTOS.jcb;
            return (
              <Link
                key={service.id}
                to="/services/$slug"
                params={{ slug: service.id }}
                className="fieldly-category-card group overflow-hidden rounded-2xl border border-line bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-field/40 hover:shadow-lg"
              >
                <div className="relative h-28 overflow-hidden bg-sky-50 sm:h-36">
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    loading="lazy"
                    decoding="async"
                    className="fieldly-service-photo h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <span className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/25 to-transparent" />
                </div>
                <div className="flex items-center justify-between gap-2 p-3 sm:p-4">
                  <span className="min-w-0">
                    <span className="block text-sm font-extrabold leading-tight sm:text-base">
                      {photo.title}
                    </span>
                    <span className="mt-1 block text-xs leading-4 text-muted sm:text-sm">
                      {service.blurb}
                    </span>
                  </span>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-field-soft text-field transition group-hover:bg-field group-hover:text-white">
                    <ArrowRight className="size-4" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        <section className="mt-10 grid gap-4 rounded-3xl border border-line bg-white p-5 sm:p-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:p-8">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-field">Simple by design</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">From location to booking, with clarity.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
              Set a work-site pin, share the details of your job and review quotes and terms before choosing an operator.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { number: "01", title: "Set the site", copy: "Choose by address, map or GPS." },
              { number: "02", title: "Choose a service", copy: "Tell us what work needs doing." },
              { number: "03", title: "Compare quotes", copy: "Review details before deciding." },
            ].map((step) => (
              <div key={step.number} className="rounded-2xl bg-paper p-4">
                <span className="grid size-8 place-items-center rounded-xl bg-field-soft text-sm font-extrabold text-field">{step.number}</span>
                <h3 className="mt-3 text-sm font-extrabold">{step.title}</h3>
                <p className="mt-1 text-xs leading-5 text-muted">{step.copy}</p>
              </div>
            ))}
          </div>
        </section>
      </section>

      {pickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close location selector"
            onClick={() => setPickerOpen(false)}
          />
          <div className="relative z-10 max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-card p-4 shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4 border-b border-line pb-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-field">01 / LOCATION</p>
                <h2 className="mt-1 font-display text-2xl font-extrabold">{t(lang, "gate_panel_title")}</h2>
                <p className="mt-1 text-sm leading-5 text-muted">{t(lang, "gate_panel_sub")}</p>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper text-ink hover:bg-field-soft"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            <SitePicker
              key={pickerMethod}
              initialMethod={pickerMethod}
              onPick={(next) => {
                setSite(next);
                setPickerOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
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
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
          {services.map((service) => {
            const photo = SERVICE_PHOTOS[service.id] ?? SERVICE_PHOTOS.jcb;
            return (
              <Link
                key={service.id}
                to="/services/$slug"
                params={{ slug: service.id }}
                className="fieldly-category-card group overflow-hidden rounded-2xl border border-line bg-card shadow-sm transition hover:-translate-y-1 hover:border-field/40 hover:shadow-lg"
              >
                <div className="h-28 overflow-hidden bg-sky-50 sm:h-36">
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    loading="lazy"
                    decoding="async"
                    className="fieldly-service-photo h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 p-3 sm:p-4">
                  <span className="min-w-0">
                    <span className="block text-sm font-extrabold sm:text-base">{service.name}</span>
                    <span className="mt-1 block text-xs leading-4 text-muted sm:text-sm">{service.blurb}</span>
                    <span className="mt-2 block text-xs font-bold text-field">{t(lang, "service_card_cta")}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-field transition group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
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
