import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useMemo } from "react";
import { CATALOG_PROVIDERS, getService, isEligible } from "./catalog";
import { kmBetween, travelMinutes } from "./geo";
import { priceJob } from "./pricing";
import type {
  Booking,
  BookingStatus,
  CustomerProfile,
  Draft,
  JobRequest,
  Lang,
  Provider,
  Quote,
  Result,
  Session,
  Site,
} from "./types";

const ALLOWED: Record<BookingStatus, BookingStatus[]> = {
  CONFIRMED: ["ON_THE_WAY", "CANCELLED"],
  ON_THE_WAY: ["ARRIVED", "CANCELLED"],
  ARRIVED: ["SERVICE_STARTED", "DISPUTED"],
  SERVICE_STARTED: ["SERVICE_COMPLETED", "DISPUTED"],
  SERVICE_COMPLETED: ["PAID", "DISPUTED"],
  PAID: [],
  DISPUTED: [],
  CANCELLED: [],
};

const OTP_TTL = 15 * 60 * 1000;
const OTP_MAX = 5;

function makeId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

function hashOtp(code: string) {
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function newOtp() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
  return n.toString().padStart(4, "0");
}

function sameCode(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type State = {
  hydrated: boolean
  lang: Lang
  site: Site | null
  draft: Draft | null
  customer: CustomerProfile | null
  session: Session | null
  extras: Provider[]
  availability: Record<string, boolean>
  requests: JobRequest[]
  quotes: Quote[]
  bookings: Booking[]
  setLang: (lang: Lang) => void
  setSite: (site: Site) => void
  setDraft: (draft: Draft) => void
  signInCustomer: (phone: string, name: string) => void
  signInProvider: (providerId: string) => void
  resumeCustomer: () => boolean
  signOut: () => void
  allProviders: () => Provider[]
  providerById: (id: string) => Provider | undefined
  isOnline: (id: string) => boolean
  setOnline: (id: string, online: boolean) => void
  addProvider: (provider: Provider) => void
  createRequest: (input: {
    serviceId: string
    providerId: string
    detailsConsent: boolean
  }) => Result
  sendQuote: (requestId: string, amount: number, note: string) => Result
  declineRequest: (requestId: string) => Result
  acceptQuote: (quoteId: string, termsAccepted: boolean) => Result
  cancelRequest: (requestId: string) => Result
  transition: (bookingId: string, to: BookingStatus, note?: string) => Result
  verifyCode: (bookingId: string, code: string) => Result
  regenerateCode: (bookingId: string) => Result
  pay: (bookingId: string, method: string) => Result
  review: (bookingId: string, stars: number, text: string) => Result
  sendMessage: (kind: "request" | "booking", id: string, text: string) => Result
};

function issueCode(booking: Booking): Booking {
  const code = newOtp();
  return {
    ...booking,
    startCode: code,
    codeHash: hashOtp(code),
    codeExpiresAt: Date.now() + OTP_TTL,
    codeAttempts: 0,
    messages: [
      ...booking.messages,
      {
        id: makeId("msg"),
        from: "system",
        text: "Start code is ready for the customer. It expires in 15 minutes.",
        at: Date.now(),
      },
    ],
  };
}

const memoryStorage: Storage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  length: 0,
};

export const useFieldly = create<State>()(
  persist(
    (set, get) => ({
      hydrated: false,
      lang: "en",
      site: null,
      draft: null,
      customer: null,
      session: null,
      extras: [],
      availability: {},
      requests: [],
      quotes: [],
      bookings: [],
      setLang: (lang) => set({ lang }),
      setSite: (site) => set({ site }),
      setDraft: (draft) => set({ draft }),
      signInCustomer: (phone, name) =>
        set({
          customer: { phone, name: name.trim() || "Customer" },
          session: { phone, name: name.trim() || "Customer", role: "customer" },
        }),
      signInProvider: (providerId) => {
        const p = get().providerById(providerId);
        if (!p) return;
        set({
          session: { phone: p.phone, name: p.name, role: "provider", providerId: p.id },
        });
      },
      resumeCustomer: () => {
        const c = get().customer;
        if (!c) return false;
        set({ session: { phone: c.phone, name: c.name, role: "customer" } });
        return true;
      },
      signOut: () => set({ session: null, customer: null }),
      allProviders: () => {
        const extraIds = new Set(get().extras.map((p) => p.id));
        return [...CATALOG_PROVIDERS.filter((p) => !extraIds.has(p.id)), ...get().extras];
      },
      providerById: (id) => get().allProviders().find((p) => p.id === id),
      isOnline: (id) => {
        const map = get().availability;
        if (id in map) return map[id];
        return get().providerById(id)?.online ?? false;
      },
      setOnline: (id, online) =>
        set((s) => ({
          availability: { ...s.availability, [id]: online },
          extras: s.extras.map((p) => (p.id === id ? { ...p, online } : p)),
        })),
      addProvider: (provider) => set((s) => ({ extras: [...s.extras.filter((p) => p.id !== provider.id), provider] })),
      createRequest: ({ serviceId, providerId, detailsConsent }) => {
        const { site, draft, session } = get();
        const who = session?.role === "customer" ? session : null;
        if (!who) return { ok: false, error: "Sign in with your mobile number before requesting this service." };
        if (!site) return { ok: false, error: "Set the work site first." };
        if (!detailsConsent) return { ok: false, error: "Review the service details and confirm consent before sending." };
        const service = getService(serviceId);
        if (!service) return { ok: false, error: "Unknown service." };
        if (!providerId) return { ok: false, error: "Choose a provider before sending a request." };
        const provider = get().providerById(providerId);
        if (!provider || !isEligible(provider, serviceId) || !get().isOnline(providerId)) {
          return { ok: false, error: "This provider is no longer available or eligible. Choose another provider." };
        }
        const km = kmBetween(site, provider);
        if (km > service.radiusKm) {
          return { ok: false, error: "This provider is outside the service's current travel range." };
        }
        const requirements = draft?.serviceId === serviceId ? draft.requirements : {};
        const whenLabel = draft?.serviceId === serviceId ? draft.whenLabel : "Today";
        const notes = draft?.serviceId === serviceId ? draft.notes : "";
        const siteImages = draft?.serviceId === serviceId ? draft.siteImages ?? [] : [];
        const id = makeId("req");
        const now = Date.now();
        const request: JobRequest = {
          id,
          serviceId,
          site,
          requirements,
          whenLabel,
          notes,
          customerPhone: who.phone,
          customerName: who.name,
          status: "open",
          createdAt: now,
          targetedProviderIds: [provider.id],
          declinedProviderIds: [],
          siteImages,
          messages: [
            {
              id: makeId("msg"),
              from: "system",
              text: `Service request sent to ${provider.name} for ${service.name} at ${site.label}. Waiting for the provider to accept with a quote or decline. No booking is confirmed yet.`,
              at: now,
            },
          ],
        };
        set((s) => ({ requests: [request, ...s.requests] }));
        return { ok: true, id };
      },
      sendQuote: (requestId, amount, note) => {
        const session = get().session;
        if (!session?.providerId) return { ok: false, error: "Open the operator desk first." };
        const request = get().requests.find((r) => r.id === requestId);
        if (!request || request.status !== "open") return { ok: false, error: "This request is not open." };
        const provider = get().providerById(session.providerId);
        if (!provider) return { ok: false, error: "Operator not found." };
        if (!request.targetedProviderIds.includes(provider.id)) {
          return { ok: false, error: "This request has not been assigned to your operator account." };
        }
        if (request.declinedProviderIds?.includes(provider.id)) {
          return { ok: false, error: "You already declined this request." };
        }
        if (!isEligible(provider, request.serviceId)) {
          return { ok: false, error: "This machine is not eligible for the service. Check papers and WALTA if it is a rig." };
        }
        if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter a price greater than zero." };
        const existing = get().quotes.find(
          (q) => q.requestId === requestId && q.providerId === provider.id && q.status === "pending",
        );
        const km = kmBetween(request.site, provider);
        const next: Quote = {
          id: existing?.id ?? makeId("quo"),
          requestId,
          providerId: provider.id,
          amount: Math.round(amount),
          summary: existing ? "Updated provider quote" : "Provider quote",
          etaMin: travelMinutes(km),
          note: note.trim() || "Offer based on the submitted details. Confirm inclusions and exclusions before booking.",
          includes: getService(request.serviceId)?.includes ?? [],
          status: "pending",
          createdAt: Date.now(),
        };
        const responseMessage = {
          id: makeId("msg"),
          from: "system" as const,
          text: `${provider.name} responded with a quote. Review the amount, inclusions, timing, and terms before accepting.`,
          at: Date.now(),
        };
        set((s) => ({
          quotes: existing
            ? s.quotes.map((q) => (q.id === existing.id ? next : q))
            : [next, ...s.quotes],
          requests: s.requests.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  declinedProviderIds: (r.declinedProviderIds ?? []).filter((id) => id !== provider.id),
                  messages: [...r.messages, responseMessage],
                }
              : r,
          ),
        }));
        return { ok: true, id: next.id };
      },
      declineRequest: (requestId) => {
        const session = get().session;
        const pid = session?.role === "provider" ? session.providerId : undefined;
        if (!pid) return { ok: false, error: "Open the operator desk first." };
        const request = get().requests.find((r) => r.id === requestId);
        if (!request || request.status !== "open") return { ok: false, error: "This request is not open." };
        if (!request.targetedProviderIds.includes(pid)) return { ok: false, error: "This request is not assigned to your operator account." };
        const responseMessage = {
          id: makeId("msg"),
          from: "system" as const,
          text: `${get().providerById(pid)?.name ?? "The provider"} declined this request. You can return to the provider list and choose someone else.`,
          at: Date.now(),
        };
        set((s) => ({
          quotes: s.quotes.map((q) =>
            q.requestId === requestId && q.providerId === pid && q.status === "pending"
              ? { ...q, status: "declined" }
              : q,
          ),
          requests: s.requests.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  declinedProviderIds: Array.from(new Set([...(r.declinedProviderIds ?? []), pid!])),
                  messages: [...r.messages, responseMessage],
                }
              : r,
          ),
        }));
        return { ok: true };
      },
      acceptQuote: (quoteId, termsAccepted) => {
        if (!termsAccepted) return { ok: false, error: "Review the provider's price and terms before accepting." };
        const quote = get().quotes.find((q) => q.id === quoteId);
        if (!quote || quote.status !== "pending") return { ok: false, error: "That quote is no longer open." };
        const request = get().requests.find((r) => r.id === quote.requestId);
        if (!request || request.status !== "open") return { ok: false, error: "This request is closed." };
        const session = get().session;
        const phone = session?.role === "customer" ? session.phone : null;
        if (phone !== request.customerPhone) {
          return { ok: false, error: "Only the customer who asked can accept." };
        }
        const provider = get().providerById(quote.providerId);
        if (!provider) return { ok: false, error: "Operator missing." };
        const service = getService(request.serviceId);
        const bookingId = makeId("job");
        const n = get().bookings.length + 1041;
        const terms = [
          `${provider.name} will do ${service?.name ?? request.serviceId} at ${request.site.label}, ${request.site.area}.`,
          `Price ${quote.summary}: ₹${quote.amount.toLocaleString("en-IN")}. Window: ${request.whenLabel}.`,
          "Work starts only after the operator enters the customer’s 4-digit code.",
          "You can cancel until the operator is on the way. After arrival, stop the job by raising a dispute.",
          "Fieldly does not grant WALTA or any other permission to drill or lift. That stays with you and the operator.",
        ].join(" ");
        const now = Date.now();
        const booking: Booking = {
          id: bookingId,
          code: `FLD-${n}`,
          requestId: request.id,
          quoteId: quote.id,
          providerId: provider.id,
          serviceId: request.serviceId,
          site: request.site,
          requirements: request.requirements,
          whenLabel: request.whenLabel,
          notes: request.notes,
          customerPhone: request.customerPhone,
          customerName: request.customerName,
          amount: quote.amount,
          summary: quote.summary,
          quoteNote: quote.note,
          quoteIncludes: quote.includes,
          quoteEtaMin: quote.etaMin,
          terms,
          termsAcceptedAt: Date.now(),
          siteImages: request.siteImages ?? [],
          status: "CONFIRMED",
          startCode: null,
          codeHash: null,
          codeExpiresAt: null,
          codeAttempts: 0,
          audit: [
            {
              at: now,
              actor: request.customerName,
              from: "NONE",
              to: "CONFIRMED",
              note: "Quote accepted",
            },
          ],
          messages: [
            {
              id: makeId("msg"),
              from: "system",
              text: `Booking ${`FLD-${n}`} confirmed with ${provider.name}.`,
              at: now,
            },
          ],
          timestamps: { CONFIRMED: now },
        };
        set((s) => ({
          quotes: s.quotes.map((q) => {
            if (q.requestId !== request.id) return q;
            if (q.id === quote.id) return { ...q, status: "accepted" };
            if (q.status === "pending") return { ...q, status: "declined" };
            return q;
          }),
          requests: s.requests.map((r) => (r.id === request.id ? { ...r, status: "booked" } : r)),
          bookings: [booking, ...s.bookings],
        }));
        return { ok: true, id: bookingId };
      },
      cancelRequest: (requestId) => {
        const request = get().requests.find((r) => r.id === requestId);
        if (!request || request.status !== "open") return { ok: false, error: "Nothing open to cancel." };
        const session = get().session;
        if (session?.role !== "customer" || session.phone !== request.customerPhone) {
          return { ok: false, error: "Only the customer who opened this request can cancel it." };
        }
        set((s) => ({
          requests: s.requests.map((r) => (r.id === requestId ? { ...r, status: "cancelled" } : r)),
          quotes: s.quotes.map((q) =>
            q.requestId === requestId && q.status === "pending" ? { ...q, status: "declined" } : q,
          ),
        }));
        return { ok: true };
      },
      transition: (bookingId, to, note) => {
        const booking = get().bookings.find((b) => b.id === bookingId);
        if (!booking) return { ok: false, error: "Booking not found." };
        const allowed = ALLOWED[booking.status];
        if (!allowed.includes(to)) {
          const next = allowed.map((s) => s.replaceAll("_", " ").toLowerCase());
          return {
            ok: false,
            error: next.length
              ? `Cannot jump from ${booking.status.replaceAll("_", " ").toLowerCase()} to ${to.replaceAll("_", " ").toLowerCase()}. Next: ${next.join(" or ")}.`
              : "This booking is closed.",
          };
        }
        if (to === "SERVICE_STARTED") {
          return { ok: false, error: "Work starts only when the operator enters the customer code." };
        }
        const session = get().session;
        if (to === "CANCELLED" || to === "DISPUTED") {
          const isCustomer = session?.role === "customer" && session.phone === booking.customerPhone;
          const isOperator = session?.role === "provider" && session.providerId === booking.providerId;
          if (!isCustomer && !isOperator) {
            return { ok: false, error: "Only the customer or the operator on this job can do that." };
          }
          if (to === "DISPUTED" && !note?.trim()) {
            return { ok: false, error: "Write what went wrong. Disputes need a reason." };
          }
        }
        const actor =
          to === "CANCELLED" || to === "DISPUTED"
            ? session?.name || booking.customerName
            : get().providerById(booking.providerId)?.name || "Operator";
        if (
          (to === "ON_THE_WAY" || to === "ARRIVED" || to === "SERVICE_COMPLETED") &&
          (session?.role !== "provider" || session.providerId !== booking.providerId)
        ) {
          return { ok: false, error: "Switch to this operator before moving the job." };
        }
        const now = Date.now();
        set((s) => ({
          bookings: s.bookings.map((b) => {
            if (b.id !== bookingId) return b;
            let next: Booking = {
              ...b,
              status: to,
              timestamps: { ...b.timestamps, [to]: now },
              audit: [...b.audit, { at: now, actor, from: b.status, to, note }],
              cancelReason: to === "CANCELLED" ? note || b.cancelReason : b.cancelReason,
              disputeReason: to === "DISPUTED" ? note || b.disputeReason : b.disputeReason,
            };
            if (to === "ARRIVED") next = issueCode(next);
            return next;
          }),
        }));
        return { ok: true };
      },
      verifyCode: (bookingId, code) => {
        const booking = get().bookings.find((b) => b.id === bookingId);
        if (!booking) return { ok: false, error: "Booking not found." };
        if (booking.status !== "ARRIVED") return { ok: false, error: "The code works only after the operator has arrived." };
        const session = get().session;
        if (session?.role !== "provider" || session.providerId !== booking.providerId) {
          return { ok: false, error: "Only the operator on this job can enter the code." };
        }
        if (!booking.codeHash || !booking.codeExpiresAt) {
          return { ok: false, error: "Ask the customer to show a fresh code." };
        }
        if (booking.codeAttempts >= OTP_MAX) {
          return { ok: false, error: "Too many tries. Ask the customer for a new code." };
        }
        if (Date.now() > booking.codeExpiresAt) {
          return { ok: false, error: "That code expired. Ask the customer for a new one." };
        }
        const cleaned = code.replace(/\D/g, "");
        if (!sameCode(hashOtp(cleaned), booking.codeHash)) {
          const attempts = booking.codeAttempts + 1;
          set((s) => ({
            bookings: s.bookings.map((b) => (b.id === bookingId ? { ...b, codeAttempts: attempts } : b)),
          }));
          const left = OTP_MAX - attempts;
          return {
            ok: false,
            error: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many tries. Ask for a new code.",
          };
        }
        const now = Date.now();
        const actor = get().providerById(booking.providerId)?.name || "Operator";
        set((s) => ({
          bookings: s.bookings.map((b) =>
            b.id === bookingId
              ? {
                  ...b,
                  status: "SERVICE_STARTED",
                  startCode: null,
                  codeHash: null,
                  codeExpiresAt: null,
                  codeAttempts: 0,
                  timestamps: { ...b.timestamps, SERVICE_STARTED: now },
                  audit: [
                    ...b.audit,
                    { at: now, actor, from: "ARRIVED", to: "SERVICE_STARTED", note: "Start code matched" },
                  ],
                }
              : b,
          ),
        }));
        return { ok: true };
      },
      regenerateCode: (bookingId) => {
        const booking = get().bookings.find((b) => b.id === bookingId);
        if (!booking) return { ok: false, error: "Booking not found." };
        if (booking.status !== "ARRIVED") return { ok: false, error: "A code is issued when the operator arrives." };
        const session = get().session;
        const phone = session?.role === "customer" ? session.phone : null;
        if (phone !== booking.customerPhone) return { ok: false, error: "Only the customer on this booking can refresh the code." };
        const code = newOtp();
        set((s) => ({
          bookings: s.bookings.map((b) =>
            b.id === bookingId
              ? {
                  ...b,
                  startCode: code,
                  codeHash: hashOtp(code),
                  codeExpiresAt: Date.now() + OTP_TTL,
                  codeAttempts: 0,
                }
              : b,
          ),
        }));
        return { ok: true };
      },
      pay: (bookingId, method) => {
        const booking = get().bookings.find((b) => b.id === bookingId);
        if (!booking) return { ok: false, error: "Booking not found." };
        if (booking.status !== "SERVICE_COMPLETED") {
          return { ok: false, error: "Pay only after the work is marked done." };
        }
        const session = get().session;
        const phone = session?.role === "customer" ? session.phone : null;
        if (phone !== booking.customerPhone) return { ok: false, error: "Only the customer on this booking can record payment." };
        const now = Date.now();
        const ref = `PAY-${makeId("r").slice(-6).toUpperCase()}`;
        set((s) => ({
          bookings: s.bookings.map((b) =>
            b.id === bookingId
              ? {
                  ...b,
                  status: "PAID",
                  payment: { method, ref, at: now },
                  timestamps: { ...b.timestamps, PAID: now },
                  audit: [
                    ...b.audit,
                    { at: now, actor: b.customerName, from: "SERVICE_COMPLETED", to: "PAID", note: method },
                  ],
                }
              : b,
          ),
        }));
        return { ok: true };
      },
      review: (bookingId, stars, text) => {
        const booking = get().bookings.find((b) => b.id === bookingId);
        if (!booking || (booking.status !== "SERVICE_COMPLETED" && booking.status !== "PAID")) {
          return { ok: false, error: "Rate the job after the service is marked complete." };
        }
        const session = get().session;
        if (session?.role !== "customer" || session.phone !== booking.customerPhone) {
          return { ok: false, error: "Only the customer on this booking can leave a review." };
        }
        if (booking.review) return { ok: false, error: "This booking already has a review." };
        if (stars < 1 || stars > 5) return { ok: false, error: "Pick 1 to 5 stars." };
        set((s) => ({
          bookings: s.bookings.map((b) =>
            b.id === bookingId ? { ...b, review: { stars, text: text.trim(), at: Date.now() } } : b,
          ),
        }));
        return { ok: true };
      },
      sendMessage: (kind, id, text) => {
        const body = text.trim();
        if (!body) return { ok: false, error: "Write a message first." };
        const session = get().session;
        if (!session) return { ok: false, error: "Sign in to send a message." };
        const from = session.role === "provider" ? "provider" : "customer";

        if (kind === "request") {
          const request = get().requests.find((r) => r.id === id);
          if (!request) return { ok: false, error: "Request not found." };
          const responded = get().quotes.some((q) => q.requestId === id);
          if (!responded) return { ok: false, error: "Chat opens after the selected provider responds to your request." };
          const isCustomer = session.role === "customer" && session.phone === request.customerPhone;
          const isAssignedProvider = session.role === "provider" && Boolean(session.providerId) && request.targetedProviderIds.includes(session.providerId!);
          if (!isCustomer && !isAssignedProvider) return { ok: false, error: "Only participants in this request can send messages." };
          const msg = { id: makeId("msg"), from: from as "customer" | "provider", text: body, at: Date.now() };
          set((s) => ({
            requests: s.requests.map((r) => (r.id === id ? { ...r, messages: [...r.messages, msg] } : r)),
          }));
        } else {
          const booking = get().bookings.find((b) => b.id === id);
          if (!booking) return { ok: false, error: "Booking not found." };
          const isCustomer = session.role === "customer" && session.phone === booking.customerPhone;
          const isAssignedProvider = session.role === "provider" && session.providerId === booking.providerId;
          if (!isCustomer && !isAssignedProvider) return { ok: false, error: "Only participants in this booking can send messages." };
          const msg = { id: makeId("msg"), from: from as "customer" | "provider", text: body, at: Date.now() };
          set((s) => ({
            bookings: s.bookings.map((b) => (b.id === id ? { ...b, messages: [...b.messages, msg] } : b)),
          }));
        }
        return { ok: true };
      },
    }),
    {
      name: "fieldly-preview-v1",
      version: 2,
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<State>;
        const oldWarangalPresets = new Set([
          "Hunter Road",
          "Kazipet",
          "Warangal Fort",
          "Enumamula",
          "Subedari",
          "Narsampet Road",
          "Parkal",
          "Kazipet industrial",
        ]);
        const selectedLabel = state.site?.label.replace(/^Near\s+/, "");
        const oldLocalPin =
          state.site && kmBetween(state.site, { lat: 17.978, lng: 79.575 }) < 35;
        if (version < 2 && ((selectedLabel && oldWarangalPresets.has(selectedLabel)) || oldLocalPin)) {
          return { ...state, site: null } as State;
        }
        return state as State;
      },
      skipHydration: true,
      storage: createJSONStorage(() => (typeof window === "undefined" ? memoryStorage : localStorage)),
      partialize: (s) => ({
        lang: s.lang,
        site: s.site,
        draft: s.draft,
        customer: s.customer,
        session: s.session,
        extras: s.extras,
        availability: s.availability,
        requests: s.requests,
        quotes: s.quotes,
        bookings: s.bookings,
      }),
    },
  ),
);

export function useProviders() {
  const extras = useFieldly((s) => s.extras);
  const availability = useFieldly((s) => s.availability);
  return useMemo(() => {
    const ids = new Set(extras.map((p) => p.id));
    return [...CATALOG_PROVIDERS.filter((p) => !ids.has(p.id)), ...extras].map((p) => ({
      ...p,
      online: Object.prototype.hasOwnProperty.call(availability, p.id) ? availability[p.id] : p.online,
    }));
  }, [extras, availability]);
}

export function useHydrated() {
  return useFieldly((s) => s.hydrated);
}
