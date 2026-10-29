import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

export type MapMarker = {
  id: string
  lat: number
  lng: number
  label: string
  kind: "site" | "provider" | "vehicle"
};

type Props = {
  center: { lat: number; lng: number }
  markers: MapMarker[]
  zoom?: number
  onPick?: (lat: number, lng: number) => void
  className?: string
};

let workerReady = false;

export function MapCanvas({ center, markers, zoom = 12, onPick, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const markerKey = markers.map((m) => `${m.id}:${m.lat.toFixed(5)}:${m.lng.toFixed(5)}:${m.label}:${m.kind}`).join("|");

  useEffect(() => {
    let dead = false;
    const node = wrapRef.current;
    if (!node) return;
    void (async () => {
      try {
        const maplibregl = await import("maplibre-gl");
        if (dead || !wrapRef.current) return;
        if (!workerReady) {
          maplibregl.setWorkerUrl(workerUrl);
          workerReady = true;
        }
        libRef.current = maplibregl;
        const map = new maplibregl.Map({
          container: wrapRef.current,
          // OpenFreeMap's hosted styles do not require an API key.
          // The provider style supplies its OpenMapTiles/OpenStreetMap attribution.
          style: "https://tiles.openfreemap.org/styles/positron",
          center: [center.lng, center.lat],
          zoom,
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
        map.on("load", () => {
          if (!dead) setReady(true);
        });
        map.on("click", (event: { lngLat: { lat: number; lng: number } }) => {
          pickRef.current?.(event.lngLat.lat, event.lngLat.lng);
        });
        map.on("error", (event: { error?: { message?: string } }) => {
          const message = event.error?.message ?? "";
          if (/worker|style|source|failed to fetch|network|401|403|404/i.test(message) && !dead) {
            setFailed(true);
          }
        });
        mapRef.current = map;
      } catch {
        if (!dead) setFailed(true);
      }
    })();
    return () => {
      dead = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // Mount once; center updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.easeTo({ center: [center.lng, center.lat], zoom, duration: 500 });
  }, [center.lat, center.lng, zoom, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = libRef.current;
    if (!map || !maplibregl || !ready) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = markers.map((mk) => {
      const el = document.createElement("div");
      el.className = `pin ${mk.kind === "site" ? "pin-site" : ""} ${mk.kind === "vehicle" ? "pin-vehicle" : ""}`;
      const text = document.createElement("span");
      text.textContent = mk.label;
      el.appendChild(text);
      return new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([mk.lng, mk.lat])
        .addTo(map);
    });
    if (markers.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      markers.forEach((m) => bounds.extend([m.lng, m.lat]));
      map.fitBounds(bounds, { padding: 56, maxZoom: 13, duration: 400 });
    }
    // markerKey is the stable identity of the pin set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerKey, ready]);

  return (
    <div className={className ? `map-wrap ${className}` : "map-wrap"}>
      <div ref={wrapRef} className="absolute inset-0" />
      {failed && !ready && (
        <div className="absolute inset-0 grid place-items-center bg-paper p-6 text-center text-sm text-muted">
          Map tiles did not load. The list still uses the same coordinates.
        </div>
      )}
    </div>
  );
}
