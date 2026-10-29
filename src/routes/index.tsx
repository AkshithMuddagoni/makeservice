import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Globe2,
  Clock3,
  LocateFixed,
  ListTree,
  MapPin,
  MapPinned,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MapCanvas } from "@/components/fieldly/map-canvas";
import { SitePicker } from "@/components/fieldly/site-picker";
import { CustomerSignInDialog } from "@/components/fieldly/customer-sign-in-dialog";
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
    src: "https://images.pexels.com/photos/7910062/pexels-photo-7910062.jpeg?auto=compress&cs=tinysrgb&w=900",
    alt: "Heavy-duty drilling rig at an Indian construction site",
    title: "Borewell Services",
  },
  jcb: {
    src: "https://images.pexels.com/photos/35565815/pexels-photo-35565815.jpeg?auto=compress&cs=tinysrgb&w=900",
    alt: "Yellow backhoe loader working with a tractor on a construction site",
    title: "JCB & Excavators",
  },
  crane: {
    src: "https://images.pexels.com/photos/29502220/pexels-photo-29502220.jpeg?auto=compress&cs=tinysrgb&w=900",
    alt: "Mobile construction crane displayed outdoors",
    title: "Cranes",
  },
  tractor: {
    src: "https://images.pexels.com/photos/12875208/pexels-photo-12875208.jpeg?auto=compress&cs=tinysrgb&w=900",
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
    alt: "Dump truck loaded with soil at a construction site",
    title: "Trucks & Tippers",
  },
  other: {
    src: "https://images.pexels.com/photos/14475776/pexels-photo-14475776.jpeg?auto=compress&cs=tinysrgb&w=900",
    alt: "Tipper truck hauling soil at a construction site",
    title: "Other Services",
  },
};

const POPULAR_SERVICE_IDS = ["borewell", "jcb", "crane", "tractor", "tanker", "other"];

const HERO_BACKGROUNDS = POPULAR_SERVICE_IDS.map((id) => {
  const photo = SERVICE_PHOTOS[id] ?? SERVICE_PHOTOS.jcb;
  return {
    id,
    label: photo.title,
    // Use the same underlying photograph as the Popular Services card, served at hero resolution.
    image: photo.src.replace("w=900", "w=2000"),
  };
});

function Home() {
  const site = useFieldly((s) => s.site);
  const setSite = useFieldly((s) => s.setSite);
  const lang = useFieldly((s) => s.lang);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMethod, setPickerMethod] = useState<LocationMethod>("manual");
  const [showAllServices, setShowAllServices] = useState(false);
  const [heroSlideIndex, setHeroSlideIndex] = useState(0);
  const heroBackground = HERO_BACKGROUNDS[heroSlideIndex] ?? HERO_BACKGROUNDS[0];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setHeroSlideIndex((current) => (current + 1) % HERO_BACKGROUNDS.length);
    }, 6500);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setPickerOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [pickerOpen]);

  if (site) return <Marketplace />;

  const methodOptions = [
    { id: "manual" as const, label: "Manual", detail: "Enter address", icon: ListTree },
    { id: "map" as const, label: "Map", detail: "Drop a pin", icon: MapPinned },
    { id: "gps" as const, label: "Use my location", detail: "GPS", icon: LocateFixed },
  ];

  const benefitOptions = [
    { icon: BadgeCheck, title: "Verified Providers", detail: "Review listing information first" },
    { icon: Globe2, title: "Wide Coverage", detail: "Choose a work site across India" },
    { icon: CheckCircle2, title: "Easy Booking", detail: "Share details and compare quotes" },
    { icon: Clock3, title: "On-Time Service", detail: "Keep the job site details ready" },
  ];

  const featuredServices = SERVICES.filter((service) => POPULAR_SERVICE_IDS.includes(service.id));
  const displayedServices = showAllServices ? SERVICES : featuredServices;

  return (
    <div className="fieldly-landing">
      <section
        data-testid="hero-section"
        data-background={heroBackground.id}
        className="fieldly-home-hero relative isolate overflow-hidden"
      >
        <div className="fieldly-hero-backdrops pointer-events-none absolute inset-0 z-0" aria-hidden="true">
          {HERO_BACKGROUNDS.map((scene, index) => (
            <img
              key={scene.id}
              data-testid="hero-background-slide"
              data-slide={scene.id}
              src={scene.image}
              alt=""
              loading={index < 2 ? "eager" : "lazy"}
              fetchPriority={index === heroSlideIndex ? "high" : "auto"}
              decoding="async"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
              className={"fieldly-hero-slide absolute inset-0 h-full w-full object-cover " + (index === heroSlideIndex ? "is-active" : "")}
            />
          ))}
          <div className="fieldly-hero-overlay absolute inset-0" />
        </div>
        <div className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:py-10 lg:py-12">
          <div className="max-w-[620px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide text-field shadow-sm backdrop-blur">
              <MapPin className="size-4" />
              {t(lang, "gate_kicker")}
            </div>
            <h1 className="mt-4 max-w-[590px] font-display text-4xl font-extrabold leading-[1.04] tracking-tight text-ink sm:text-5xl lg:text-[3.35rem]">
              Construction &amp; Field Equipment Services{" "}
              <span className="text-field">Across India</span>
            </h1>
            <p className="mt-4 max-w-xl text-base font-medium leading-7 text-ink/90 sm:text-lg">
              Book borewell rigs, JCBs, cranes, tractors, water tankers and more — at your work site, quickly and easily.
            </p>

            <div data-testid="location-hero-card" className="mt-6 max-w-[390px] rounded-3xl border border-white/90 bg-white/95 p-4 shadow-[0_20px_55px_rgba(20,40,58,0.16)] backdrop-blur sm:p-5">
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

        </div>
        <div
          aria-label="Hero image selection"
          className="fieldly-hero-controls absolute bottom-4 right-4 z-10 hidden items-center gap-3 rounded-full border border-white/75 bg-white/85 px-3 py-2 shadow-lg backdrop-blur-md sm:flex"
        >
          <span className="max-w-32 truncate text-xs font-extrabold text-ink">{heroBackground.label}</span>
          <div className="flex items-center gap-1">
            {HERO_BACKGROUNDS.map((scene, index) => (
              <button
                key={scene.id}
                type="button"
                aria-label={`Show ${scene.label} background`}
                aria-pressed={index === heroSlideIndex}
                onClick={() => setHeroSlideIndex(index)}
                className="grid size-5 place-items-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-field"
              >
                <span
                  className={
                    "rounded-full transition-all " +
                    (index === heroSlideIndex
                      ? "h-2 w-4 bg-field"
                      : "size-2 bg-ink/30 hover:bg-ink/60")
                  }
                />
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-line bg-white">
        <div data-testid="benefit-strip" className="mx-auto grid max-w-6xl grid-cols-4 gap-1.5 px-2 py-4 sm:gap-3 sm:px-4 sm:py-6">
          {benefitOptions.map(({ icon: Icon, title, detail }) => (
            <div key={title} className="flex min-w-0 flex-col items-center justify-center gap-2 rounded-xl px-0.5 py-2 text-center sm:gap-2 sm:p-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sky-50 text-field ring-1 ring-sky-100 sm:size-11">
                <Icon className="size-4 sm:size-5" />
              </span>
              <span className="block max-w-full text-[10px] font-extrabold leading-tight text-ink sm:text-sm">{title}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:py-10 lg:py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
              Popular Services
            </h2>
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

        <div data-testid="popular-services-grid" className="mt-5 grid grid-cols-3 gap-2 sm:gap-4">
          {displayedServices.map((service) => {
            const photo = SERVICE_PHOTOS[service.id] ?? SERVICE_PHOTOS.jcb;
            return (
              <Link
                key={service.id}
                to="/services/$slug"
                params={{ slug: service.id }}
                className="fieldly-category-card group overflow-hidden rounded-2xl border border-line bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-field/40 hover:shadow-lg"
              >
                <div className="relative h-20 overflow-hidden bg-sky-50 sm:h-28 lg:h-32">
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                      if (event.currentTarget.dataset.fallback === "true") {
                        event.currentTarget.style.display = "none";
                        return;
                      }
                      event.currentTarget.dataset.fallback = "true";
                      event.currentTarget.src = HERO_IMAGE;
                    }}
                    className="fieldly-service-photo h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <span className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/25 to-transparent" />
                </div>
                <div className="min-w-0 p-2 sm:p-3">
                  <span className="block break-words text-[11px] font-extrabold leading-tight sm:text-sm">
                    {photo.title}
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
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fieldly-location-title"
            aria-describedby="fieldly-location-description"
            className="relative z-10 max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-card p-4 shadow-2xl sm:rounded-3xl sm:p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-4 border-b border-line pb-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-field">01 / LOCATION</p>
                <h2 id="fieldly-location-title" className="mt-1 font-display text-2xl font-extrabold">{t(lang, "gate_panel_title")}</h2>
                <p id="fieldly-location-description" className="mt-1 text-sm leading-5 text-muted">{t(lang, "gate_panel_sub")}</p>
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
  const session = useFieldly((s) => s.session);
  const providers = useProviders();
  const [query, setQuery] = useState("");
  const [signInOpen, setSignInOpen] = useState(true);
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

  if (!session || session.role !== "customer") {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-paper px-4 py-10 sm:py-16">
        <section className="mx-auto max-w-2xl rounded-3xl border border-line bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-field">Work site confirmed</p>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Sign in before choosing a service.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
            Your work site is saved as <strong>{site.city}, {site.state}</strong>. Sign in to continue to service selection and job details.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl bg-field-soft p-3 text-sm">
            <MapPin className="size-4 shrink-0 text-field" />
            <span className="font-semibold">{site.address || site.label}</span>
            <span className="text-muted">· {site.pincode}</span>
          </div>
          <Button className="mt-5" onClick={() => setSignInOpen(true)}>
            Sign in to choose services <ArrowRight className="ml-2 size-4" />
          </Button>
        </section>
        <CustomerSignInDialog
          open={signInOpen}
          onClose={() => setSignInOpen(false)}
          onSuccess={() => setSignInOpen(false)}
        />
      </main>
    );
  }

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
                className="min-w-0 w-full bg-transparent text-base outline-none"
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
        <div data-testid="marketplace-services-grid" className="mt-5 grid grid-cols-3 gap-2 sm:gap-4">
          {services.map((service) => {
            const photo = SERVICE_PHOTOS[service.id] ?? SERVICE_PHOTOS.jcb;
            return (
              <Link
                key={service.id}
                to="/services/$slug"
                params={{ slug: service.id }}
                className="fieldly-category-card group overflow-hidden rounded-2xl border border-line bg-card shadow-sm transition hover:-translate-y-1 hover:border-field/40 hover:shadow-lg"
              >
                <div className="relative h-20 overflow-hidden bg-sky-50 sm:h-28 lg:h-32">
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                      if (event.currentTarget.dataset.fallback === "true") {
                        event.currentTarget.style.display = "none";
                        return;
                      }
                      event.currentTarget.dataset.fallback = "true";
                      event.currentTarget.src = HERO_IMAGE;
                    }}
                    className="fieldly-service-photo h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="min-w-0 p-2 sm:p-3">
                  <span className="block break-words text-[11px] font-extrabold leading-tight sm:text-sm">
                    {service.name}
                  </span>
                </div>
              </Link>
            );
          })}
          {services.length === 0 && <p className="text-muted">{t(lang, "no_services")}</p>}
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
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
