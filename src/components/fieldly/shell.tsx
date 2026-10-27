import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, MapPin, Menu, Sprout, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { t } from "@/lib/fieldly/i18n";
import { useFieldly } from "@/lib/fieldly/store";
import type { Lang } from "@/lib/fieldly/types";
import { cn } from "@/lib/utils";
import { SitePicker } from "./site-picker";

export function Shell({ children }: { children: ReactNode }) {
  const lang = useFieldly((s) => s.lang);
  const setLang = useFieldly((s) => s.setLang);
  const site = useFieldly((s) => s.site);
  const setSite = useFieldly((s) => s.setSite);
  const session = useFieldly((s) => s.session);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [menu, setMenu] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);

  useEffect(() => {
    void Promise.resolve(useFieldly.persist.rehydrate()).finally(() => {
      useFieldly.setState({ hydrated: true });
    });
  }, []);

  useEffect(() => {
    setMenu(false);
  }, [path]);

  useEffect(() => {
    if (!menu && !siteOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenu(false);
        setSiteOpen(false);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menu, siteOpen]);

  const links = [
    { to: "/", label: t(lang, "nav_services"), exact: true },
    { to: "/bookings", label: t(lang, "nav_bookings") },
    { to: "/desk", label: t(lang, "nav_desk") },
    { to: "/join", label: t(lang, "nav_join") },
  ] as const;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
            <span className="grid size-9 place-items-center rounded-xl bg-white text-field"><Sprout className="size-6" aria-hidden /></span>
            Fieldly
          </Link>
          <nav className="hidden items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:text-ink",
                  path === l.to && "bg-paper text-ink",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSiteOpen(true)}
              className="inline-flex h-10 min-w-0 max-w-[142px] items-center gap-1.5 rounded-xl border border-line bg-white px-2.5 text-left text-xs font-bold shadow-sm transition hover:border-field max-[380px]:max-w-[92px] max-[380px]:px-1.5 sm:h-11 sm:max-w-52 sm:gap-2 sm:px-3"
            >
              <MapPin className="size-4 shrink-0 text-field" />
              <span className="truncate">{site ? site.city : "India"}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted" />
            </button>
            <label className="hidden items-center sm:flex">
              <span className="sr-only">{t(lang, "language")}</span>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                className="h-11 rounded-xl border border-line bg-card px-2 text-sm font-semibold"
              >
                <option value="en">EN</option>
                <option value="te">తె</option>
                <option value="hi">हि</option>
              </select>
            </label>
            <Link
              to="/account"
              className="grid h-11 place-items-center rounded-xl bg-ink px-3 text-sm font-semibold text-on-ink max-[380px]:hidden"
            >
              {session ? session.name.split(" ")[0] : "Login"}
            </Link>
            <button
              type="button"
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-white transition hover:border-field sm:size-11"
              onClick={() => setMenu((v) => !v)}
              aria-label={menu ? "Close menu" : "Open menu"}
              aria-expanded={menu}
              aria-controls="fieldly-navigation-menu"
            >
              {menu ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {menu && (
          <nav id="fieldly-navigation-menu" aria-label="Main navigation" className="border-t border-line bg-card px-4 py-3 shadow-sm">
            <button
              type="button"
              onClick={() => setSiteOpen(true)}
              className="flex h-11 w-full items-center gap-2 text-sm font-semibold"
            >
              <MapPin className="size-4 text-field" />
              {site ? site.label : t(lang, "your_site")}
            </button>
            <Link to="/account" className="flex h-11 items-center text-sm font-semibold">
              {session ? session.name : "Login"}
            </Link>
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="flex h-11 items-center text-sm font-semibold">
                {l.label}
              </Link>
            ))}
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="mb-2 h-11 w-full rounded-xl border border-line bg-card px-2 text-sm font-semibold"
              aria-label={t(lang, "language")}
            >
              <option value="en">English</option>
              <option value="te">తెలుగు</option>
              <option value="hi">हिन्दी</option>
            </select>
          </nav>
        )}
      </header>
      <main>{children}</main>
      <footer className="mt-8 border-t border-line bg-ink text-on-ink">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:justify-between">
          <div className="max-w-md">
            <div className="font-display text-xl font-bold">Fieldly</div>
            <p className="mt-2 text-sm text-on-ink/80">
              Find equipment for construction, agriculture, lifting, water and transport jobs. Choose a work site,
              review service details and compare terms before making a decision.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 text-sm">
            <div className="grid content-start gap-2">
              <div className="font-semibold">Customers</div>
              <Link to="/" className="text-on-ink/80">
                {t(lang, "nav_services")}
              </Link>
              <Link to="/bookings" className="text-on-ink/80">
                {t(lang, "nav_bookings")}
              </Link>
              <Link to="/account" className="text-on-ink/80">
                {t(lang, "nav_account")}
              </Link>
            </div>
            <div className="grid content-start gap-2">
              <div className="font-semibold">Operators</div>
              <Link to="/desk" className="text-on-ink/80">
                {t(lang, "nav_desk")}
              </Link>
              <Link to="/join" className="text-on-ink/80">
                {t(lang, "nav_join")}
              </Link>
            </div>
          </div>
        </div>
        <div className="border-t border-on-ink/15 px-4 py-3 text-center text-xs text-on-ink/70">
          Local requirements vary by state and service. Confirm applicable rules before work begins. Preview listings
          are illustrative; SMS and payments are not connected.
        </div>
      </footer>
      {siteOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-3 sm:items-center">
          <button type="button" className="absolute inset-0" aria-label="Close" onClick={() => setSiteOpen(false)} />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="fieldly-change-site-title"
            className="relative max-h-[94vh] w-full max-w-xl overflow-auto rounded-t-3xl bg-card p-4 shadow-xl sm:rounded-3xl sm:p-6"
          >
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-3">
              <h2 id="fieldly-change-site-title" className="font-display text-2xl font-bold">{t(lang, "change_site")}</h2>
              <button type="button" onClick={() => setSiteOpen(false)} className="grid size-10 place-items-center rounded-xl bg-paper">
                <X className="size-4" />
              </button>
            </div>
            <SitePicker
              onPick={(next) => {
                setSite(next);
                setSiteOpen(false);
              }}
            />
          </section>
        </div>
      )}
      <Toaster position="top-center" />
    </div>
  );
}
