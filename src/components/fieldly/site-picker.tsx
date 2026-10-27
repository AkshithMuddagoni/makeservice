import {
  CheckCircle2,
  Crosshair,
  ListTree,
  LocateFixed,
  MapPin,
  MapPinned,
  Navigation,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CITY_CENTER } from "@/lib/fieldly/catalog";
import { t } from "@/lib/fieldly/i18n";
import { useFieldly } from "@/lib/fieldly/store";
import type { Site } from "@/lib/fieldly/types";
import { Button } from "@/components/ui/button";
import { MapCanvas } from "./map-canvas";

type Method = "manual" | "map" | "gps";
type AddressFields = {
  state: string;
  district: string;
  city: string;
  pincode: string;
  address: string;
  landmark: string;
};
type SearchResult = {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    state?: string;
    state_district?: string;
    county?: string;
    district?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    hamlet?: string;
    city_district?: string;
    suburb?: string;
    neighbourhood?: string;
    road?: string;
    house_number?: string;
    postcode?: string;
  };
};
type SearchHit = { result: SearchResult; title: string; subtitle: string };

const STATES_AND_UTS = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
  "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
  "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

const EMPTY_FIELDS: AddressFields = {
  state: "", district: "", city: "", pincode: "", address: "", landmark: "",
};

function fieldsFromResult(result: SearchResult): AddressFields {
  const a = result.address ?? {};
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.hamlet ?? a.city_district ?? a.suburb ?? "";
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  return {
    state: a.state ?? "",
    district: a.state_district ?? a.county ?? a.district ?? a.city_district ?? "",
    city,
    pincode: (a.postcode ?? "").replace(/\D/g, "").slice(0, 6),
    address: street || a.neighbourhood || a.suburb || result.display_name,
    landmark: "",
  };
}

function reverseUrl(lat: number, lng: number) {
  return "https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=" + lat + "&lon=" + lng;
}

export function SitePicker({ onPick }: { onPick: (site: Site) => void }) {
  const lang = useFieldly((s) => s.lang);
  const currentSite = useFieldly((s) => s.site);
  const [method, setMethod] = useState<Method>("manual");
  const [fields, setFields] = useState<AddressFields>(() => ({
    ...EMPTY_FIELDS,
    state: currentSite?.state ?? "",
    district: currentSite?.district ?? "",
    city: currentSite?.city ?? "",
    pincode: currentSite?.pincode ?? "",
    address: currentSite?.address ?? "",
    landmark: currentSite?.landmark ?? "",
  }));
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(() =>
    currentSite ? { lat: currentSite.lat, lng: currentSite.lng } : null,
  );

  function patchField(key: keyof AddressFields, value: string) {
    setFields((previous) => ({ ...previous, [key]: value }));
    if (key !== "landmark") setPin(null);
  }

  async function reverseGeocode(lat: number, lng: number) {
    setBusy(true);
    try {
      const response = await fetch(reverseUrl(lat, lng), { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Address lookup failed");
      const result = (await response.json()) as SearchResult;
      setFields(fieldsFromResult(result));
      toast.success("Address details found. Review them before confirming.");
    } catch {
      toast.error("Pin saved, but address lookup failed. Enter the address details manually.");
    } finally {
      setBusy(false);
    }
  }

  async function searchPlaces(searchText = query) {
    const cleanQuery = searchText.trim();
    if (cleanQuery.length < 3) {
      toast.error("Enter at least 3 characters to search.");
      return;
    }
    setBusy(true);
    setHits(null);
    try {
      const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=in&q=" + encodeURIComponent(cleanQuery);
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Place search failed");
      const data = (await response.json()) as SearchResult[];
      setHits(data.map((result) => {
        const address = result.address ?? {};
        const location = address.city ?? address.town ?? address.village ?? address.municipality ?? address.county ?? "";
        return {
          result,
          title: address.road
            ? [address.house_number, address.road].filter(Boolean).join(" ")
            : address.neighbourhood ?? address.suburb ?? location ?? result.display_name.split(",")[0],
          subtitle: result.display_name,
        };
      }));
      if (data.length === 0) toast.message("No matches found. Try a nearby town, landmark or PIN code.");
    } catch {
      setHits([]);
      toast.error("Place search is unavailable. You can still move the pin on the map.");
    } finally {
      setBusy(false);
    }
  }

  function selectSearchResult(hit: SearchHit) {
    const lat = Number(hit.result.lat);
    const lng = Number(hit.result.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error("That search result did not include valid map coordinates.");
      return;
    }
    setPin({ lat, lng });
    setFields(fieldsFromResult(hit.result));
    setHits(null);
    setQuery(hit.result.display_name);
    toast.success("Location selected. Check the pin and complete any missing details.");
  }

  function useLiveLocation() {
    if (!navigator.geolocation) {
      toast.error("This browser does not support device location. Use the map or manual entry.");
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setPin({ lat, lng });
        setMethod("gps");
        setGpsBusy(false);
        void reverseGeocode(lat, lng);
      },
      (error) => {
        setGpsBusy(false);
        toast.error(error.code === error.PERMISSION_DENIED
          ? "Location permission was denied. Enable it in your browser or use the map."
          : "Could not read your current location. Try the map or manual entry.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }

  function pickMapPin(lat: number, lng: number) {
    setPin({ lat, lng });
    setHits(null);
    void reverseGeocode(lat, lng);
  }

  function submitLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const required: (keyof AddressFields)[] = ["state", "district", "city", "pincode", "address"];
    const missing = required.find((key) => !fields[key].trim());
    if (missing) {
      toast.error("Complete State, District, City/Town/Village, PIN code and work-site address.");
      return;
    }
    if (!/^\d{6}$/.test(fields.pincode.trim())) {
      toast.error("Enter a valid 6-digit Indian PIN code.");
      return;
    }
    if (!pin) {
      toast.error("Set the exact work-site pin using Map or Use my location before continuing.");
      setMethod("map");
      return;
    }
    const site: Site = {
      label: fields.landmark.trim() || fields.address.trim() || fields.city.trim(),
      area: fields.address.trim(),
      city: fields.city.trim(),
      state: fields.state.trim(),
      district: fields.district.trim(),
      pincode: fields.pincode.trim(),
      address: fields.address.trim(),
      landmark: fields.landmark.trim(),
      lat: pin.lat,
      lng: pin.lng,
    };
    onPick(site);
  }

  const center = pin ?? { lat: CITY_CENTER.lat, lng: CITY_CENTER.lng };
  const mapsVisible = method === "map" || (method === "gps" && Boolean(pin));
  const stateValueIsUnlisted = Boolean(fields.state && !STATES_AND_UTS.includes(fields.state));
  const methods: { id: Method; title: string; subtitle: string; icon: typeof ListTree }[] = [
    { id: "manual", title: t(lang, "location_method_manual"), subtitle: "Enter the address", icon: ListTree },
    { id: "map", title: t(lang, "location_method_map"), subtitle: "Choose the exact pin", icon: MapPinned },
    { id: "gps", title: t(lang, "location_method_gps"), subtitle: "Use device GPS", icon: Crosshair },
  ];

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Location selection method">
        {methods.map(({ id, title, subtitle, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={method === id}
            onClick={() => setMethod(id)}
            className={"flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border p-3 text-center transition " +
              (method === id
                ? "border-field bg-field-soft text-field shadow-sm ring-1 ring-field/20"
                : "border-line bg-paper text-ink hover:border-field/60")}
          >
            <Icon className="size-5" />
            <span className="text-sm font-bold leading-tight">{title}</span>
            <span className="hidden text-xs leading-4 text-muted sm:block">{subtitle}</span>
          </button>
        ))}
      </div>

      {method === "manual" && (
        <div className="flex items-start gap-3 rounded-2xl border border-line bg-paper p-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-field" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Enter the work-site details</p>
            <p className="mt-1 text-sm leading-5 text-muted">
              Fill the address below, then use the Map tab to set the exact work-site pin. Your current home location may be different from the job site.
            </p>
            <button
              type="button"
              onClick={() => {
                const addressQuery = [fields.address, fields.city, fields.district, fields.state, fields.pincode].filter(Boolean).join(", ");
                setQuery(addressQuery);
                setMethod("map");
              }}
              className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-field hover:underline"
            >
              Pin this address on map <Navigation className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {method === "map" && (
        <div className="grid gap-3">
          <div>
            <h3 className="font-display text-xl font-bold">{t(lang, "location_map_title")}</h3>
            <p className="mt-1 text-sm leading-5 text-muted">{t(lang, "location_map_hint")}</p>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void searchPlaces();
            }}
          >
            <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 focus-within:border-field focus-within:ring-2 focus-within:ring-field/15">
              <Search className="size-4 shrink-0 text-muted" />
              <span className="sr-only">{t(lang, "location_search_label")}</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t(lang, "location_search_placeholder")}
                className="w-full min-w-0 bg-transparent text-sm outline-none"
              />
            </label>
            <Button type="submit" variant="secondary" disabled={busy}>
              {busy ? "…" : t(lang, "location_search_btn")}
            </Button>
          </form>
          {hits && (
            <div className="max-h-48 overflow-auto rounded-xl border border-line bg-card p-1">
              {hits.length === 0 && <p className="p-3 text-sm text-muted">No results. Try a different place or move the map pin.</p>}
              {hits.map((hit) => (
                <button
                  type="button"
                  key={hit.result.lat + "-" + hit.result.lon}
                  onClick={() => selectSearchResult(hit)}
                  className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-paper"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-field" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{hit.title}</span>
                    <span className="mt-0.5 block text-xs leading-4 text-muted">{hit.subtitle}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="h-72 overflow-hidden rounded-2xl border border-line">
            <MapCanvas
              center={center}
              zoom={pin ? 15 : 4}
              onPick={pickMapPin}
              markers={pin ? [{ id: "work-site", ...pin, label: "Work site", kind: "site" }] : []}
            />
          </div>
          <p className="text-xs leading-5 text-muted">
            {pin
              ? "Pin selected: " + pin.lat.toFixed(5) + ", " + pin.lng.toFixed(5) + ". Click elsewhere on the map to adjust it."
              : "Search for the site, then click the map to place the pin exactly where the work will happen."}
          </p>
        </div>
      )}

      {method === "gps" && (
        <div className="rounded-2xl border border-line bg-paper p-4 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-field-soft text-field">
            <LocateFixed className="size-8" />
          </span>
          <h3 className="mt-3 font-display text-xl font-bold">{t(lang, "location_gps_title")}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{t(lang, "location_gps_body")}</p>
          <Button type="button" variant="primary" className="mt-4 w-full sm:w-auto" onClick={useLiveLocation} disabled={gpsBusy || busy}>
            <Crosshair className="mr-2 size-4" />
            {gpsBusy ? "Finding location…" : t(lang, "location_gps_btn")}
          </Button>
          {pin && (
            <p className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-field">
              <CheckCircle2 className="size-4" />
              Coordinates captured. Review the address and pin below.
            </p>
          )}
          {pin && (
            <div className="mt-4 h-52 overflow-hidden rounded-2xl border border-line text-left">
              <MapCanvas center={center} zoom={15} onPick={pickMapPin} markers={[{ id: "work-site", ...pin, label: "Work site", kind: "site" }]} />
            </div>
          )}
          <p className="mt-3 text-xs leading-5 text-muted">
            Your GPS location is only a starting point. Adjust it if the equipment needs to reach a different site.
          </p>
        </div>
      )}

      <form onSubmit={submitLocation} className="grid gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-field-soft text-field">
            <MapPinned className="size-4" />
          </span>
          <div>
            <h3 className="font-display text-xl font-bold">{t(lang, "location_details_title")}</h3>
            <p className="mt-1 text-sm leading-5 text-muted">{t(lang, "location_details_subtitle")}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold">
            {t(lang, "location_state")} <span className="text-field">*</span>
            <select
              value={fields.state}
              onChange={(event) => patchField("state", event.target.value)}
              required
              className="h-12 w-full rounded-xl border border-line bg-card px-3 font-normal outline-none focus:border-field focus:ring-2 focus:ring-field/15"
            >
              <option value="">Select State / UT</option>
              {stateValueIsUnlisted && <option value={fields.state}>{fields.state}</option>}
              {STATES_AND_UTS.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            {t(lang, "location_district")} <span className="text-field">*</span>
            <input
              value={fields.district}
              onChange={(event) => patchField("district", event.target.value)}
              placeholder={t(lang, "location_district_placeholder")}
              required
              autoComplete="address-level2"
              className="h-12 w-full rounded-xl border border-line bg-card px-3 font-normal outline-none focus:border-field focus:ring-2 focus:ring-field/15"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            {t(lang, "location_city")} <span className="text-field">*</span>
            <input
              value={fields.city}
              onChange={(event) => patchField("city", event.target.value)}
              placeholder={t(lang, "location_city_placeholder")}
              required
              autoComplete="address-level3"
              className="h-12 w-full rounded-xl border border-line bg-card px-3 font-normal outline-none focus:border-field focus:ring-2 focus:ring-field/15"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            {t(lang, "location_pincode")} <span className="text-field">*</span>
            <input
              value={fields.pincode}
              onChange={(event) => patchField("pincode", event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="e.g. 500001"
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="postal-code"
              className="h-12 w-full rounded-xl border border-line bg-card px-3 font-normal outline-none focus:border-field focus:ring-2 focus:ring-field/15"
            />
          </label>
        </div>

        <label className="grid gap-1.5 text-sm font-semibold">
          {t(lang, "location_work_address")} <span className="text-field">*</span>
          <textarea
            value={fields.address}
            onChange={(event) => patchField("address", event.target.value)}
            placeholder={t(lang, "location_work_address_placeholder")}
            rows={2}
            required
            autoComplete="street-address"
            className="w-full resize-y rounded-xl border border-line bg-card px-3 py-3 font-normal outline-none focus:border-field focus:ring-2 focus:ring-field/15"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-semibold">
          {t(lang, "location_landmark")} <span className="font-normal text-muted">({t(lang, "optional")})</span>
          <input
            value={fields.landmark}
            onChange={(event) => patchField("landmark", event.target.value)}
            placeholder={t(lang, "location_landmark_placeholder")}
            className="h-12 w-full rounded-xl border border-line bg-card px-3 font-normal outline-none focus:border-field focus:ring-2 focus:ring-field/15"
          />
        </label>

        <div className={"rounded-2xl border p-3 " + (pin ? "border-field/30 bg-field-soft" : "border-line bg-paper")}>
          <div className="flex items-start gap-3">
            {pin ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-field" /> : <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{pin ? t(lang, "location_pin_confirmed") : t(lang, "location_pin_required")}</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                {pin
                  ? pin.lat.toFixed(5) + ", " + pin.lng.toFixed(5) + " · " + (fields.city || "Work site") + ", " + (fields.state || "India")
                  : t(lang, "location_pin_help")}
              </p>
            </div>
            {!pin && (
              <button type="button" onClick={() => setMethod("map")} className="shrink-0 text-sm font-bold text-field hover:underline">
                Open map
              </button>
            )}
          </div>
        </div>

        <Button type="submit" variant="primary" className="h-12 w-full text-base">
          {t(lang, "location_confirm_btn")}
          <Navigation className="ml-2 size-4" />
        </Button>
        <p className="flex items-start gap-2 text-xs leading-5 text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-field" />
          {t(lang, "location_privacy_note")}
        </p>
      </form>
      {mapsVisible && method === "gps" && <span className="sr-only">Map preview of the selected pin</span>}
    </div>
  );
}
