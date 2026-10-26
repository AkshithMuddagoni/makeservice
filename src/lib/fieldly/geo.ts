export function kmBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function travelMinutes(km: number) {
  return Math.max(12, Math.round((km / 26) * 60 + 8));
}

export function formatKm(km: number) {
  if (km < 1) return `${Math.max(1, Math.round(km * 10) * 100)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function midway(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  t = 0.55,
) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}
