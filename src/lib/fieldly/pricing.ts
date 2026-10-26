import { getService } from "./catalog";
import type { Provider } from "./types";

export type Priced = {
  amount: number
  summary: string
  includes: string[]
  note: string
};

function num(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function includesOf(serviceId: string) {
  return getService(serviceId)?.includes ?? ["Work described in the request"];
}

export function priceJob(
  serviceId: string,
  provider: Provider,
  req: Record<string, string>,
): Priced {
  const rate = provider.rates[serviceId];
  const includes = includesOf(serviceId);
  if (!rate) {
    return {
      amount: 2500,
      summary: "Visit estimate",
      includes,
      note: "Confirm the scope in chat before you accept.",
    };
  }

  const access = req.site_access;
  const accessMul = access === "Difficult terrain" ? 1.15 : access === "Narrow road" ? 1.08 : 1;

  if (serviceId === "borewell") {
    const assumed = !req.depth_ft;
    const depth = num(req.depth_ft, 450);
    const amount = Math.round(depth * rate.rate * accessMul);
    return {
      amount,
      summary: assumed
        ? `Estimate · ${depth} ft × ₹${rate.rate}/ft`
        : `${depth} ft × ₹${rate.rate}/ft`,
      includes,
      note: assumed
        ? "Depth was not known, so this assumes 450 ft. A different depth needs a new quote before work starts."
        : "If rock or extra casing changes the depth, the provider must send a new quote before continuing.",
    };
  }

  if (serviceId === "jcb" || serviceId === "construction") {
    const hours = num(req.hours, 4);
    const machineOnly = req.operator === "No — machine only" ? 0.82 : 1;
    const amount = Math.round(hours * rate.rate * machineOnly);
    return {
      amount,
      summary: `${hours} hr × ₹${rate.rate}/hr`,
      includes,
      note: "Time starts when the machine is ready at the pin, not when it leaves the yard.",
    };
  }

  if (serviceId === "crane") {
    const hours = num(req.hours, 3);
    const tons = num(req.load_tons, 5);
    const tonMul = tons > 15 ? 1.35 : tons > 8 ? 1.15 : 1;
    const amount = Math.round(hours * rate.rate * tonMul);
    return {
      amount,
      summary: `${hours} hr · about ${tons} tons`,
      includes,
      note: "The approach road has to take the crane. Say so in chat if the lane is tight.",
    };
  }

  if (serviceId === "tractor" || serviceId === "agri") {
    if (req.work === "Hauling") {
      const hours = num(req.hours, 3);
      const amount = Math.round(hours * rate.rate * 0.85);
      return {
        amount,
        summary: `Haul · ${hours} hr`,
        includes,
        note: "Hauling is timed. Field work on acres uses the acre rate.",
      };
    }
    const acres = num(req.acres, 2);
    const amount = Math.round(acres * rate.rate);
    return {
      amount,
      summary: `${acres} acre × ₹${rate.rate}/acre`,
      includes,
      note: "Wet soil or extra passes are a new quote, not a silent add-on.",
    };
  }

  if (serviceId === "tanker") {
    const trips = num(req.trips, 1);
    const cap = req.capacity || "5,000 L";
    const capMul =
      cap === "3,000 L" ? 0.75 : cap === "8,000 L" ? 1.45 : cap === "12,000 L" ? 2 : 1;
    const amount = Math.round(trips * rate.rate * capMul);
    return {
      amount,
      summary: `${trips} × ${cap}`,
      includes,
      note: "Drinking water is not implied. Say if the fill must be potable.",
    };
  }

  if (serviceId === "tipper") {
    const loads = num(req.loads, 1);
    const band = req.distance_band || "Under 10 km";
    const bandMul = band === "25–50 km" ? 1.8 : band === "10–25 km" ? 1.35 : 1;
    const amount = Math.round(loads * rate.rate * bandMul);
    return {
      amount,
      summary: `${loads} load · ${band}`,
      includes,
      note: "The haul band is the distance the material travels, not how far the yard is.",
    };
  }

  if (serviceId === "rental") {
    const days = num(req.days, 1);
    const amount = Math.round(days * rate.rate);
    return {
      amount,
      summary: `${days} day × ₹${rate.rate}/day`,
      includes,
      note: "Damage and extra days are outside this quote.",
    };
  }

  const amount = Math.round(rate.rate);
  return {
    amount,
    summary: "Quoted visit",
    includes,
    note: "Read the note on the quote. Accept only if it matches the job.",
  };
}
