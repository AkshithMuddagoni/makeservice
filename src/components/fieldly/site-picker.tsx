import { LocateFixed, MapPin, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CITY_CENTER, PRESET_SITES } from "@/lib/fieldly/catalog";
import { kmBetween } from "@/lib/fieldly/geo";
import { t } from "@/lib/fieldly/i18n";
import { useFieldly } from "@/lib/fieldly/store";
import type { Site } from "@/lib/fieldly/types";
import { Button } from "@/components/ui/button";
import { MapCanvas } from "./map-canvas";

type Hit = { label: string; area: string; lat: number; lng: number };

export function SitePicker({
  onPick,
  presets = PRESET_SITES,
}: {
  onPick: (site: Site) => void
  presets?: Site[]
}) {
  const lang = useFieldly((s) => s.lang);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return presets;
    return presets.filter((s) => `${s.label} ${s.area} ${s.city}`.toLowerCase().includes(query));
  }, [presets, q]);

  function choose(site: Site) {
    onPick(site);
  }

  function fromPin(lat: number, lng: number) {
    setPin({ lat, lng });
    const near = presets
      .map((s) => ({ s, km: kmBetween(s, { lat, lng }) }))
      .sort((a, b) => a.km - b.km)[0];
    const close = near && near.km < 2.5 ? near.s : null;
    choose({
      label: close ? `Near ${close.label}` : "Dropped pin",
      area: close?.area ?? `${lat.toFixed(3)}, ${lng.toFixed(3)}`,
      city: close?.city ?? "Warangal",
      state: "Telangana",
      lat,
      lng,
    });
  }

  async function search() {
    const query = q.trim();
    if (query.length < 3) {
      setHits(null);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=in&q=${encodeURIComponent(query)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) throw new Error("search failed");
      const data = (await res.json()) as { display_name: string; lat: string; lon: string }[];
      setHits(
        data.map((row) => {
          const [label, ...rest] = row.display_name.split(",");
          return {
            label: label.trim(),
            area: rest.slice(0, 2).join(",").trim(),
            lat: Number(row.lat),
            lng: Number(row.lon),
          };
        }),
      );
    } catch {
      setHits([]);
      toast.error("Place search is unavailable. Pick an area or drop a pin.");
    } finally {
      setBusy(false);
    }
  }

  function gps() {
    if (!navigator.geolocation) {
      toast.error("This browser has no location. Pick an area instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fromPin(pos.coords.latitude, pos.coords.longitude);
        toast.success("Pin set from this device.");
      },
      () => toast.error("Location was blocked. Pick an area or drop a pin."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const center = pin ?? { lat: CITY_CENTER.lat, lng: CITY_CENTER.lng };

  return (
    <div className="grid gap-4">
      <button
        type="button"
        onClick={gps}
        className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3 text-left hover:border-ink"
      >
        <span className="grid size-11 place-items-center rounded-xl bg-field-soft text-field">
          <LocateFixed className="size-5" />
        </span>
        <span>
          <span className="block font-semibold">{t(lang, "gate_gps")}</span>
          <span className="block text-sm text-muted">{t(lang, "gate_gps_hint")}</span>
        </span>
      </button>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label className="flex h-12 flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3">
          <Search className="size-4 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t(lang, "gate_search")}
            className="w-full bg-transparent text-base outline-none"
          />
        </label>
        <Button type="submit" variant="secondary" disabled={busy}>
          {busy ? "…" : "Search"}
        </Button>
      </form>
      {hits && (
        <div className="grid gap-1">
          {hits.length === 0 && <p className="text-sm text-muted">No matches. Try a town name, or drop a pin.</p>}
          {hits.map((hit) => (
            <button
              key={`${hit.lat}-${hit.lng}`}
              type="button"
              onClick={() =>
                choose({
                  label: hit.label,
                  area: hit.area,
                  city: hit.label,
                  state: "India",
                  lat: hit.lat,
                  lng: hit.lng,
                })
              }
              className="flex items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-paper"
            >
              <MapPin className="size-4 text-field" />
              <span>
                <span className="block text-sm font-semibold">{hit.label}</span>
                <span className="block text-xs text-muted">{hit.area}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-field">{t(lang, "gate_presets")}</div>
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((site) => (
            <button
              key={site.label}
              type="button"
              data-testid={`site-${site.label.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={() => choose(site)}
              className="rounded-xl border border-line bg-card px-3 py-3 text-left hover:border-ink"
            >
              <span className="block text-sm font-semibold">{site.label}</span>
              <span className="block text-xs text-muted">{site.area}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="h-64">
        <MapCanvas
          center={center}
          zoom={11}
          onPick={fromPin}
          markers={
            pin
              ? [{ id: "pin", lat: pin.lat, lng: pin.lng, label: "Site", kind: "site" }]
              : presets.slice(0, 4).map((s) => ({
                  id: s.label,
                  lat: s.lat,
                  lng: s.lng,
                  label: s.label,
                  kind: "provider" as const,
                }))
          }
        />
      </div>
      <p className="text-center text-xs text-muted">Drop a pin on the map if the list does not name your plot.</p>
    </div>
  );
}
