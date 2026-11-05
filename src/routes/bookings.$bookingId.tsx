import { Link, createFileRoute } from "@tanstack/react-router";
import { Check, Star } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ChatBox, StatusPill, requirementLines } from "@/components/fieldly/bits";
import { MapCanvas, type MapMarker } from "@/components/fieldly/map-canvas";
import { Button } from "@/components/ui/button";
import { getService } from "@/lib/fieldly/catalog";
import { inr, whenClock } from "@/lib/fieldly/format";
import { midway } from "@/lib/fieldly/geo";
import { STATUS_LABEL } from "@/lib/fieldly/i18n";
import { useFieldly, useProviders } from "@/lib/fieldly/store";
import type { BookingStatus } from "@/lib/fieldly/types";
import { cn } from "@/lib/utils";
import { authEnabled } from "@/lib/auth/client";
import { getCurrentBookingDetail, submitCurrentProviderReview, issueCurrentBookingStartCode, sendCurrentBookingMessage, stopCurrentProviderBookingLocation, updateCurrentBookingParticipantAction, updateCurrentProviderBookingLocation, updateCurrentProviderBookingStatus, verifyCurrentBookingStartCode } from "@/lib/fieldly/account.functions";

export const Route = createFileRoute("/bookings/$bookingId")({ component: BookingPage });

type LiveBooking = {
  id: string;
  publicReference: string;
  status: "confirmed" | "on_the_way" | "arrived" | "service_started" | "service_completed" | "paid" | "disputed" | "cancelled";
  amountPaise: number;
  currency: string;
  serviceId: string;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancellationReason: string | null;
  disputeReason: string | null;
  site: {
    label: string; address: string; area: string; city: string; district: string | null;
    state: string; pincode: string | null; landmark: string | null; latitude: number; longitude: number;
  };
  requirements: Record<string, string>;
  terms: {
    note?: string; inclusions: string[]; exclusions: string[];
    extraCharges: Array<{ label: string; amountPaise: number }>;
    cancellationTerms?: string; etaMinutes?: number | null;
  };
  provider: { businessId: string; name: string; baseLatitude: number | null; baseLongitude: number | null };
  assignment: {
    asset: { id: string; assetType: string; make: string; model: string } | null;
    operator: { id: string; fullName: string; roleTitle: string } | null;
  };
  permissions: { isCustomer: boolean; isProvider: boolean; isAssignedOperator: boolean };
  review: { rating: number; reviewText: string; createdAt: string } | null;
  startCode: {
    hasActiveCode: boolean; expiresAt: string | null; attempts: number;
    issueCount: number; maxIssues: number; maxAttempts: number;
  };
  liveLocation: {
    latitude: number; longitude: number; accuracyMeters: number | null;
    headingDegrees: number | null; speedMps: number | null;
    recordedAt: string; expiresAt: string;
  } | null;
  events: Array<{
    id: string; fromStatus: string | null; toStatus: string;
    eventType: string; note: string | null; createdAt: string;
  }>;
  messages: Array<{
    id: string; senderRole: "customer" | "provider"; messageText: string;
    createdAt: string; isMine: boolean;
  }>;
};

type IssuedCode = { code: string; expiresAt: string };

const LIVE_STATUS_LABEL: Record<LiveBooking["status"], string> = {
  confirmed: "Booking confirmed",
  on_the_way: "Provider on the way",
  arrived: "Provider arrived",
  service_started: "Work started",
  service_completed: "Work completed",
  paid: "Payment recorded",
  disputed: "Dispute raised",
  cancelled: "Cancelled",
};

const HAPPY: BookingStatus[] = [
  "CONFIRMED",
  "ON_THE_WAY",
  "ARRIVED",
  "SERVICE_STARTED",
  "SERVICE_COMPLETED",
  "PAID",
];

function BookingPage() {
  const { bookingId } = Route.useParams();
  const booking = useFieldly((s) => s.bookings.find((b) => b.id === bookingId));
  const lang = useFieldly((s) => s.lang);
  const session = useFieldly((s) => s.session);
  const transition = useFieldly((s) => s.transition);
  const verifyCode = useFieldly((s) => s.verifyCode);
  const regenerateCode = useFieldly((s) => s.regenerateCode);
  const pay = useFieldly((s) => s.pay);
  const review = useFieldly((s) => s.review);
  const sendMessage = useFieldly((s) => s.sendMessage);
  const providers = useProviders();
  const isCustomer = Boolean(booking && session?.role === "customer" && session.phone === booking.customerPhone);
  const isOperator = Boolean(booking && session?.role === "provider" && session.providerId === booking.providerId);
  const [pane, setPane] = useState<"customer" | "operator">(session?.role === "provider" ? "operator" : "customer");
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("UPI");
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [showPay, setShowPay] = useState(false);
  const [liveBooking, setLiveBooking] = useState<LiveBooking | null>(null);
  const [liveLoading, setLiveLoading] = useState(authEnabled);
  const [liveError, setLiveError] = useState("");
  const [liveRefreshKey, setLiveRefreshKey] = useState(0);
  const [liveBusy, setLiveBusy] = useState(false);
  const [issuedCode, setIssuedCode] = useState<IssuedCode | null>(null);
  const [verificationAttemptsLeft, setVerificationAttemptsLeft] = useState<number | null>(null);
  const [sharingLiveLocation, setSharingLiveLocation] = useState(false);
  const [liveLocationError, setLiveLocationError] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [sendingChatMessage, setSendingChatMessage] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastLocationSentAtRef = useRef(0);

  // Keep both participants' booking timeline, GPS marker and chat current.
  // The tab polls only while visible and while the booking is still active.
  useEffect(() => {
    if (
      !authEnabled ||
      (!liveBooking?.permissions.isCustomer && !liveBooking?.permissions.isProvider && !liveBooking?.permissions.isAssignedOperator) ||
      ["paid", "disputed", "cancelled"].includes(liveBooking.status)
    ) return;
    let cancelled = false;
    let inFlight = false;
    const poll = async () => {
      if (cancelled || document.visibilityState !== "visible" || inFlight) return;
      inFlight = true;
      try {
        const result = await getCurrentBookingDetail({ data: { bookingId } });
        if (!cancelled) setLiveBooking(result);
      } catch {
        // Preserve the last saved state during a temporary connection failure.
      } finally {
        inFlight = false;
      }
    };
    const interval = window.setInterval(() => { void poll(); }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    bookingId,
    liveBooking?.permissions.isCustomer,
    liveBooking?.permissions.isProvider,
    liveBooking?.status,
  ]);

  useEffect(() => {
    return () => {
      const hadActiveWatch = watchIdRef.current !== null;
      if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
      if (authEnabled && hadActiveWatch) {
        void stopCurrentProviderBookingLocation({ data: { bookingId } }).catch(() => undefined);
      }
    };
  }, [bookingId]);

  useEffect(() => {
    if (!authEnabled) return;
    let cancelled = false;
    setLiveLoading(true);
    setLiveError("");
    void getCurrentBookingDetail({ data: { bookingId } })
      .then((result) => {
        if (!cancelled) setLiveBooking(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLiveError(error instanceof Error ? error.message : "Could not load booking details.");
      })
      .finally(() => {
        if (!cancelled) setLiveLoading(false);
      });
    return () => { cancelled = true; };
  }, [bookingId, liveRefreshKey]);

  async function refreshLiveBooking() {
    setLiveError("");
    const result = await getCurrentBookingDetail({ data: { bookingId } });
    setLiveBooking(result);
  }

  function stopBrowserLocationWatch() {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    setSharingLiveLocation(false);
  }

  async function stopLiveLocationSharing() {
    setLiveLocationError("");
    stopBrowserLocationWatch();
    try {
      await stopCurrentProviderBookingLocation({ data: { bookingId } });
      setLiveRefreshKey((value) => value + 1);
    } catch (error) {
      setLiveLocationError(error instanceof Error ? error.message : "Could not stop location sharing on the server.");
    }
  }

  function startLiveLocationSharing() {
    setLiveLocationError("");
    if (!navigator.geolocation) {
      setLiveLocationError("This browser does not provide GPS location. Try a modern browser on a secure HTTPS connection.");
      return;
    }
    if (watchIdRef.current !== null) return;
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const now = Date.now();
          if (now - lastLocationSentAtRef.current < 10_000) return;
          lastLocationSentAtRef.current = now;
          const { latitude, longitude, accuracy, heading, speed } = position.coords;
          if (!Number.isFinite(accuracy) || accuracy > 200) {
            setLiveLocationError("GPS accuracy is currently too low. Move outdoors or to a clearer area.");
            return;
          }
          void updateCurrentProviderBookingLocation({
            data: {
              bookingId,
              latitude,
              longitude,
              accuracyMeters: accuracy,
              headingDegrees: heading,
              speedMps: speed,
            },
          }).then(() => {
            setLiveLocationError("");
            setSharingLiveLocation(true);
          }).catch((error: unknown) => {
            setLiveLocationError(error instanceof Error ? error.message : "The GPS point could not be saved.");
          });
        },
        (error) => {
          setLiveLocationError(
            error.code === error.PERMISSION_DENIED
              ? "Location permission was denied. Enable location permission in your browser to share live tracking."
              : "Could not read your GPS location. Check device location settings and try again.",
          );
          stopBrowserLocationWatch();
        },
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
      );
    } catch {
      setLiveLocationError("The browser could not start live location sharing.");
    }
  }

  useEffect(() => {
    const canShare = liveBooking && ["on_the_way", "arrived", "service_started"].includes(liveBooking.status);
    if (!canShare && watchIdRef.current !== null) {
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
      setSharingLiveLocation(false);
      void stopCurrentProviderBookingLocation({ data: { bookingId } }).catch(() => undefined);
    }
  }, [liveBooking?.status, bookingId]);

  async function sendLiveChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const messageText = chatDraft.trim();
    if (!messageText || !liveBooking) return;
    setSendingChatMessage(true);
    setLiveError("");
    try {
      await sendCurrentBookingMessage({
        data: { bookingId, messageText },
      });
      setChatDraft("");
      await refreshLiveBooking();
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "Your message could not be sent.");
    } finally {
      setSendingChatMessage(false);
    }
  }

  async function issueLiveStartCode() {
    setLiveBusy(true);
    setLiveError("");
    try {
      const result = await issueCurrentBookingStartCode({ data: { bookingId } });
      setIssuedCode({ code: result.code, expiresAt: result.expiresAt });
      setVerificationAttemptsLeft(null);
      await refreshLiveBooking();
      toast.success("Show this one-time code to your assigned provider.");
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "The service-start code could not be issued.");
    } finally {
      setLiveBusy(false);
    }
  }

  async function verifyLiveStartCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLiveBusy(true);
    setLiveError("");
    try {
      const result = await verifyCurrentBookingStartCode({ data: { bookingId, code } });
      if (result.started) {
        setCode("");
        setVerificationAttemptsLeft(null);
        toast.success("Code verified. Work is now marked as started.");
        setIssuedCode(null);
        await refreshLiveBooking();
      } else {
        setVerificationAttemptsLeft(result.attemptsRemaining);
        setLiveError(result.attemptsRemaining > 0
          ? "That code does not match. " + result.attemptsRemaining + " attempt(s) remain."
          : "No attempts remain. Ask the customer to request a replacement code after the cooldown.");
      }
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "The code could not be verified.");
    } finally {
      setLiveBusy(false);
    }
  }

  async function updateLiveProviderStatus(status: "on_the_way" | "arrived" | "service_completed") {
    setLiveBusy(true);
    setLiveError("");
    try {
      await updateCurrentProviderBookingStatus({ data: { bookingId, status } });
      setIssuedCode(null);
      await refreshLiveBooking();
      toast.success(LIVE_STATUS_LABEL[status === "on_the_way" ? "on_the_way" : status === "arrived" ? "arrived" : "service_completed"]);
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "Booking status could not be updated.");
    } finally {
      setLiveBusy(false);
    }
  }

  async function submitLiveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!liveBooking || !liveBooking.permissions.isCustomer) return;
    setSubmittingReview(true);
    setLiveError("");
    try {
      await submitCurrentProviderReview({
        data: { bookingId, rating: reviewRating, reviewText: reviewText.trim() },
      });
      setReviewText("");
      await refreshLiveBooking();
      toast.success("Your provider review has been saved.");
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "Your review could not be saved.");
    } finally {
      setSubmittingReview(false);
    }
  }

  async function performParticipantAction(action: "cancelled" | "disputed") {
    if (reason.trim().length < 5) {
      setLiveError("Please enter a reason with at least five characters.");
      return;
    }
    setLiveBusy(true);
    setLiveError("");
    try {
      await updateCurrentBookingParticipantAction({ data: { bookingId, action, reason } });
      await refreshLiveBooking();
      setReason("");
      toast.success(action === "cancelled" ? "Booking cancelled." : "Dispute recorded for review.");
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "This booking action could not be completed.");
    } finally {
      setLiveBusy(false);
    }
  }

  if (authEnabled) {
    if (liveLoading) {
      return <main className="mx-auto max-w-3xl px-4 py-16 text-sm text-muted">Loading secure booking details…</main>;
    }
    if (!liveBooking || (!liveBooking.permissions.isCustomer && !liveBooking.permissions.isProvider)) {
      return (
        <main className="mx-auto max-w-xl px-4 py-16">
          <h1 className="font-display text-3xl font-bold">Booking unavailable</h1>
          <p className="mt-2 text-sm text-muted">{liveError || "This booking does not exist or is not assigned to your signed-in account."}</p>
          <Link to="/" className="mt-4 inline-block font-semibold">Back to home</Link>
        </main>
      );
    }

    const serviceName = getService(liveBooking.serviceId)?.name ?? liveBooking.serviceId;
    const mapMarkers = [
      { id: "site", lat: liveBooking.site.latitude, lng: liveBooking.site.longitude, label: "Work site", kind: "site" as const },
      ...(liveBooking.liveLocation
        ? [{ id: "live-provider", lat: liveBooking.liveLocation.latitude, lng: liveBooking.liveLocation.longitude, label: "Provider live location", kind: "vehicle" as const }]
        : liveBooking.provider.baseLatitude !== null && liveBooking.provider.baseLongitude !== null
          ? [{ id: "provider-base", lat: liveBooking.provider.baseLatitude, lng: liveBooking.provider.baseLongitude, label: liveBooking.provider.name + " · business base", kind: "provider" as const }]
          : []),
    ];
    const isLiveCustomer = liveBooking.permissions.isCustomer;
    const isLiveProvider = liveBooking.permissions.isProvider;
    const isLiveAssignedOperator = liveBooking.permissions.isAssignedOperator;
    const canShareLiveLocation = isLiveProvider || isLiveAssignedOperator;
    const canCancel = ["confirmed", "on_the_way"].includes(liveBooking.status);
    const canDispute = ["arrived", "service_started", "service_completed"].includes(liveBooking.status);

    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-field">MakeService booking</p>
            <h1 className="mt-1 font-display text-3xl font-bold">{LIVE_STATUS_LABEL[liveBooking.status]}</h1>
            <p className="mt-1 text-sm text-muted">{serviceName} · {liveBooking.provider.name} · {liveBooking.site.label}</p>
            <p className="mt-1 font-mono text-xs text-muted">{liveBooking.publicReference}</p>
          </div>
          <Button variant="secondary" disabled={liveBusy} onClick={() => setLiveRefreshKey((key) => key + 1)}>Refresh status</Button>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <section className="min-w-0">
            <div className="rounded-3xl border border-line bg-card p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Accepted quotation</p>
                  <h2 className="mt-1 font-display text-3xl font-bold">{inr(liveBooking.amountPaise / 100)}</h2>
                </div>
                <span className="rounded-full bg-field-soft px-3 py-1.5 text-xs font-semibold text-field">{LIVE_STATUS_LABEL[liveBooking.status]}</span>
              </div>
              {liveBooking.terms.note && <p className="mt-3 text-sm leading-5">{liveBooking.terms.note}</p>}
              {liveBooking.terms.inclusions.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-semibold">Included</p>
                  <ul className="mt-1 grid gap-1 text-sm text-muted">{liveBooking.terms.inclusions.map((item, index) => <li key={index}>• {item}</li>)}</ul>
                </div>
              )}
              {liveBooking.terms.exclusions.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-semibold">Excluded</p>
                  <ul className="mt-1 grid gap-1 text-sm text-muted">{liveBooking.terms.exclusions.map((item, index) => <li key={index}>• {item}</li>)}</ul>
                </div>
              )}
              {liveBooking.terms.extraCharges.length > 0 && (
                <div className="mt-3 rounded-xl bg-paper p-3">
                  <p className="text-sm font-semibold">Additional charges</p>
                  {liveBooking.terms.extraCharges.map((item, index) => (
                    <p key={index} className="mt-1 flex justify-between gap-3 text-sm"><span>{item.label}</span><span>{inr(item.amountPaise / 100)}</span></p>
                  ))}
                </div>
              )}
              {liveBooking.terms.cancellationTerms && (
                <div className="mt-3 rounded-xl bg-paper p-3 text-sm leading-5">
                  <p className="font-semibold">Cancellation terms</p>
                  <p className="mt-1">{liveBooking.terms.cancellationTerms}</p>
                </div>
              )}
              <p className="mt-3 text-xs text-muted">Payment is not collected or recorded on this booking page. Use only the official MakeService checkout when it becomes available.</p>
            </div>

            <div className="mt-4 h-72 overflow-hidden rounded-2xl border border-line">
              <MapCanvas center={{ ...liveBooking.site, lat: liveBooking.site.latitude, lng: liveBooking.site.longitude }} markers={mapMarkers} />
            </div>
            <p className="mt-2 rounded-xl bg-paper p-3 text-xs leading-5 text-muted">
              {liveBooking.liveLocation
                ? "The vehicle marker is the most recent provider GPS update. GPS expires automatically if updates stop. Last received: " + new Date(liveBooking.liveLocation.recordedAt).toLocaleTimeString("en-IN") + "."
                : "No live GPS update is available. The provider marker, when shown, is only the registered business base location."}
            </p>

            <section className="mt-4 rounded-2xl border border-line bg-card p-5">
              <h2 className="font-display text-xl font-bold">Assigned machine & operator</h2>
              {liveBooking.assignment.asset ? (
                <p className="mt-2 text-sm">
                  <span className="font-semibold">Machine:</span> {liveBooking.assignment.asset.assetType} · {liveBooking.assignment.asset.make} {liveBooking.assignment.asset.model}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted">No machine assignment is recorded for this booking.</p>
              )}
              {liveBooking.assignment.operator ? (
                <p className="mt-1 text-sm">
                  <span className="font-semibold">Operator:</span> {liveBooking.assignment.operator.fullName} · {liveBooking.assignment.operator.roleTitle}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">No operator assignment is recorded for this booking.</p>
              )}
              <p className="mt-2 text-xs text-muted">The assigned machine and approved operator are reserved for this booking while it is active.</p>
            </section>

            <section className="mt-4 rounded-2xl border border-line bg-card p-5">
              <h2 className="font-display text-xl font-bold">Work site</h2>
              <p className="mt-2 text-sm leading-5 text-muted">{liveBooking.site.address}, {liveBooking.site.area}, {liveBooking.site.city}, {liveBooking.site.state}</p>
              {liveBooking.site.pincode && <p className="text-sm text-muted">PIN {liveBooking.site.pincode}</p>}
              {liveBooking.site.landmark && <p className="text-sm text-muted">Landmark: {liveBooking.site.landmark}</p>}
            </section>

            <section className="mt-4 rounded-2xl border border-line bg-card p-5">
              <h2 className="font-display text-xl font-bold">Booking timeline</h2>
              <ol className="mt-3 grid gap-3">
                {liveBooking.events.map((event) => (
                  <li key={event.id} className="border-l-2 border-line pl-3">
                    <p className="text-sm font-semibold">{LIVE_STATUS_LABEL[event.toStatus as LiveBooking["status"]] ?? event.eventType.replaceAll("_", " ")}</p>
                    <p className="text-xs text-muted">{whenClock(new Date(event.createdAt).getTime())}</p>
                    {event.note && <p className="mt-1 text-sm text-muted">{event.note}</p>}
                  </li>
                ))}
              </ol>
            </section>

            <section className="mt-4 rounded-2xl border border-line bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-xl font-bold">Booking chat</h2>
                  <p className="mt-1 text-xs text-muted">Text-only chat with the customer or assigned provider. Phone numbers are not shared here.</p>
                </div>
                <span className="text-xs text-muted">{liveBooking.messages.length} message(s)</span>
              </div>
              <div className="mt-4 grid max-h-80 gap-2 overflow-y-auto pr-1">
                {liveBooking.messages.length === 0 ? (
                  <p className="rounded-xl bg-paper p-3 text-sm text-muted">
                    No messages yet. Use this chat to coordinate the booked service.
                  </p>
                ) : liveBooking.messages.map((message) => (
                  <div key={message.id} className={cn("max-w-[88%] rounded-2xl p-3", message.isMine ? "ml-auto bg-field-soft/60" : "mr-auto bg-paper")}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold">{message.isMine ? "You" : message.senderRole === "customer" ? "Customer" : "Provider"}</p>
                      <p className="text-[11px] text-muted">{whenClock(new Date(message.createdAt).getTime())}</p>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5">{message.messageText}</p>
                  </div>
                ))}
              </div>
              {liveBooking.status === "cancelled" ? (
                <p className="mt-3 rounded-xl bg-paper p-3 text-xs text-muted">Messaging is closed for a cancelled booking.</p>
              ) : (
                <form onSubmit={(event) => void sendLiveChatMessage(event)} className="mt-3 grid gap-2">
                  <textarea
                    value={chatDraft}
                    onChange={(event) => setChatDraft(event.target.value.slice(0, 2000))}
                    maxLength={2000}
                    rows={3}
                    placeholder="Write a message to the other booking participant…"
                    className="w-full rounded-xl border border-line bg-white p-3 text-sm"
                    aria-label="Booking chat message"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted">{chatDraft.length}/2000 · 12 messages/minute</span>
                    <Button type="submit" size="sm" disabled={sendingChatMessage || chatDraft.trim().length === 0}>
                      {sendingChatMessage ? "Sending…" : "Send message"}
                    </Button>
                  </div>
                </form>
              )}
            </section>
          </section>

          <aside className="grid content-start gap-4">
            {isLiveCustomer && liveBooking.status === "arrived" && (
              <section className="rounded-2xl border border-line bg-card p-5">
                <h2 className="font-display text-xl font-bold">Service-start code</h2>
                {issuedCode ? (
                  <div className="mt-3 rounded-2xl border border-field/20 bg-field-soft/40 p-4">
                    <p className="text-xs font-semibold text-field">Show this code to your assigned provider</p>
                    <p className="mt-2 text-center font-display text-4xl font-bold tracking-[0.35em]">{issuedCode.code}</p>
                    <p className="mt-2 text-center text-xs text-muted">Expires {new Date(issuedCode.expiresAt).toLocaleTimeString("en-IN")}. This code is shown once and is not stored as plain text.</p>
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-sm leading-5 text-muted">
                      The provider has marked arrival. Generate a one-time four-digit code and show it directly to the provider only when you are ready for work to start.
                    </p>
                    {liveBooking.startCode.hasActiveCode && <p className="mt-2 text-xs text-muted">A code has already been issued. It cannot be displayed again after leaving this page; you can request a replacement after the cooldown.</p>}
                    <p className="mt-2 text-xs text-muted">{liveBooking.startCode.issueCount} of {liveBooking.startCode.maxIssues} code issues used.</p>
                    <Button className="mt-3 w-full" disabled={liveBusy || liveBooking.startCode.issueCount >= liveBooking.startCode.maxIssues} onClick={() => void issueLiveStartCode()}>
                      {liveBusy ? "Generating…" : liveBooking.startCode.hasActiveCode ? "Issue replacement code" : "Generate start code"}
                    </Button>
                  </>
                )}
              </section>
            )}

            {isLiveProvider && liveBooking.status === "arrived" && (
              <section className="rounded-2xl border border-line bg-card p-5">
                <h2 className="font-display text-xl font-bold">Verify customer start code</h2>
                <p className="mt-2 text-sm leading-5 text-muted">Ask the customer to show the current four-digit code. Work cannot start until the server verifies it.</p>
                <form className="mt-3 grid gap-3" onSubmit={(event) => void verifyLiveStartCode(event)}>
                  <input
                    value={code}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={4}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
                    className="h-14 rounded-xl border border-line bg-white px-3 text-center font-display text-3xl tracking-[0.4em]"
                    placeholder="••••"
                    aria-label="Customer service-start code"
                  />
                  {verificationAttemptsLeft !== null && <p className="text-xs text-muted">{verificationAttemptsLeft} attempt(s) remaining.</p>}
                  <Button type="submit" disabled={liveBusy || code.length !== 4}>{liveBusy ? "Verifying…" : "Verify code & start work"}</Button>
                </form>
              </section>
            )}

            {canShareLiveLocation && ["on_the_way", "arrived", "service_started"].includes(liveBooking.status) && (
              <section className="rounded-2xl border border-line bg-card p-5">
                <h2 className="font-display text-xl font-bold">Live GPS sharing</h2>
                <p className="mt-2 text-sm leading-5 text-muted">
                  Sharing sends this device's current GPS point for the assigned booking only. Points expire automatically after two minutes if updates stop.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", sharingLiveLocation ? "bg-field-soft text-field" : "bg-paper text-muted")}>
                    {sharingLiveLocation ? "This device is sharing location" : liveBooking.liveLocation ? "A recent GPS point is available" : "No active GPS point"}
                  </span>
                  {sharingLiveLocation ? (
                    <Button variant="secondary" disabled={liveBusy} onClick={() => void stopLiveLocationSharing()}>Stop sharing</Button>
                  ) : (
                    <Button disabled={liveBusy} onClick={startLiveLocationSharing}>Start sharing location</Button>
                  )}
                </div>
                {liveLocationError && <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">{liveLocationError}</p>}
                {liveBooking.liveLocation && (
                  <p className="mt-3 text-xs text-muted">
                    Last GPS point: {new Date(liveBooking.liveLocation.recordedAt).toLocaleTimeString("en-IN")} · accuracy ±{Math.round(liveBooking.liveLocation.accuracyMeters ?? 0)} m
                  </p>
                )}
              </section>
            )}

            {isLiveProvider && (
              <section className="rounded-2xl border border-line bg-card p-5">
                <h2 className="font-display text-xl font-bold">Provider actions</h2>
                <p className="mt-2 text-sm leading-5 text-muted">Only the owner of the assigned provider business can advance booking status.</p>
                <div className="mt-3 grid gap-2">
                  {liveBooking.status === "confirmed" && <Button disabled={liveBusy} onClick={() => void updateLiveProviderStatus("on_the_way")}>Mark on the way</Button>}
                  {liveBooking.status === "on_the_way" && <Button disabled={liveBusy} onClick={() => void updateLiveProviderStatus("arrived")}>Mark arrived</Button>}
                  {liveBooking.status === "service_started" && <Button disabled={liveBusy} onClick={() => void updateLiveProviderStatus("service_completed")}>Mark work completed</Button>}
                  {!["confirmed", "on_the_way", "arrived", "service_started"].includes(liveBooking.status) && <p className="text-sm text-muted">No provider status action is available at this stage.</p>}
                </div>
              </section>
            )}

            {isLiveCustomer && (liveBooking.review || ["service_completed", "paid"].includes(liveBooking.status)) && (
              <section className="rounded-2xl border border-line bg-card p-5">
                <h2 className="font-display text-xl font-bold">Provider review</h2>
                {liveBooking.review ? (
                  <>
                    <div className="mt-3 flex items-center gap-1" aria-label={`Your rating: ${liveBooking.review.rating} out of 5`}>
                      {Array.from({ length: 5 }, (_, index) => (
                        <Star key={index} className="size-5 text-gold" fill={index < liveBooking.review!.rating ? "currentColor" : "none"} />
                      ))}
                      <span className="ml-2 text-sm font-semibold">{liveBooking.review.rating}/5</span>
                    </div>
                    {liveBooking.review.reviewText && <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-muted">{liveBooking.review.reviewText}</p>}
                    <p className="mt-2 text-xs text-muted">Your review has been submitted.</p>
                  </>
                ) : (
                  <form className="mt-3 grid gap-3" onSubmit={(event) => void submitLiveReview(event)}>
                    <p className="text-sm text-muted">The work is complete. Rate the provider's service and leave a note for future customers.</p>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <button
                          key={rating}
                          type="button"
                          onClick={() => setReviewRating(rating)}
                          aria-label={`Rate ${rating} out of 5`}
                          aria-pressed={reviewRating === rating}
                          className="rounded-md p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          <Star className="size-7 text-gold" fill={rating <= reviewRating ? "currentColor" : "none"} />
                        </button>
                      ))}
                      <span className="ml-2 text-sm font-semibold">{reviewRating}/5</span>
                    </div>
                    <textarea
                      value={reviewText}
                      onChange={(event) => setReviewText(event.target.value.slice(0, 1000))}
                      maxLength={1000}
                      rows={3}
                      placeholder="Share your experience (optional)"
                      aria-label="Provider review"
                      className="w-full rounded-xl border border-line bg-white p-3 text-sm"
                    />
                    <Button type="submit" disabled={submittingReview}>
                      {submittingReview ? "Submitting review…" : "Submit review"}
                    </Button>
                  </form>
                )}
              </section>
            )}

            {(isLiveCustomer || isLiveProvider) && (["confirmed", "on_the_way"].includes(liveBooking.status) || ["arrived", "service_started", "service_completed"].includes(liveBooking.status)) && (
              <section className="rounded-2xl border border-line bg-card p-5">
                <h2 className="font-display text-xl font-bold">Need help?</h2>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={1000}
                  className="mt-3 min-h-20 w-full rounded-xl border border-line bg-white p-3 text-sm"
                  placeholder="Explain the reason (at least five characters)."
                />
                {canCancel && <Button variant="danger" className="mt-2 w-full" disabled={liveBusy || reason.trim().length < 5} onClick={() => void performParticipantAction("cancelled")}>Cancel booking</Button>}
                {canDispute && <Button variant="danger" className="mt-2 w-full" disabled={liveBusy || reason.trim().length < 5} onClick={() => void performParticipantAction("disputed")}>Raise a dispute</Button>}
              </section>
            )}

            {(liveBooking.status === "cancelled" || liveBooking.status === "disputed") && (
              <section className="rounded-2xl border border-line bg-card p-5">
                <h2 className="font-display text-xl font-bold">{LIVE_STATUS_LABEL[liveBooking.status]}</h2>
                <p className="mt-2 text-sm leading-5 text-muted">{liveBooking.cancellationReason || liveBooking.disputeReason || "This booking is closed."}</p>
              </section>
            )}

            {liveError && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{liveError}</p>}
            <Button variant="secondary" onClick={() => setLiveRefreshKey((key) => key + 1)}>Refresh booking</Button>
            <Button variant="ghost" asChild><Link to="/">Back to home</Link></Button>
          </aside>
        </div>
      </main>
    );
  }

  if (!booking || (!isCustomer && !isOperator)) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <h1 className="font-display text-3xl font-bold">Booking unavailable</h1>
        <p className="mt-2 text-sm text-muted">Sign in as the customer or the assigned operator to view this booking.</p>
        <Link to="/account" className="mt-3 inline-block font-semibold">Account sign in</Link>
      </div>
    );
  }

  const provider = providers.find((p) => p.id === booking.providerId);
  const service = getService(booking.serviceId);
  const labels = STATUS_LABEL[lang];
  const step = HAPPY.indexOf(booking.status);
  const vehicle = !provider
    ? booking.site
    : booking.status === "CONFIRMED"
      ? provider
      : booking.status === "ON_THE_WAY"
        ? midway(provider, booking.site)
        : booking.site;
  const markers: MapMarker[] = [
    { id: "site", lat: booking.site.lat, lng: booking.site.lng, label: "Site", kind: "site" },
    {
      id: "rig",
      lat: vehicle.lat,
      lng: vehicle.lng,
      label: booking.status === "ON_THE_WAY" ? "Estimated" : provider?.name.split(" ")[0] || "Rig",
      kind: booking.status === "ON_THE_WAY" || booking.status === "CONFIRMED" ? "vehicle" : "provider",
    },
  ];

  function act(result: { ok: boolean; error?: string }) {
    if (!result.ok) toast.error(result.error);
  }

  function openOperator() {
    if (!isOperator) {
      toast.error("Only the assigned operator can manage this booking.");
      return;
    }
    setPane("operator");
  }
  function openCustomer() {
    if (!isCustomer) {
      toast.error("Only the customer who made this booking can manage it.");
      return;
    }
    setPane("customer");
  }
  const minutesLeft = booking.codeExpiresAt ? Math.max(0, Math.ceil((booking.codeExpiresAt - Date.now()) / 60000)) : 0;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-muted">{booking.code}</div>
            <h1 className="font-display text-4xl font-bold tracking-tight">{labels[booking.status] ?? booking.status}</h1>
            <p className="mt-1 text-sm text-muted">
              {service?.name} · {provider?.name} · {booking.site.label}
            </p>
          </div>
          <StatusPill status={booking.status} />
        </div>
        <ol className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {HAPPY.map((status, i) => {
            const done = booking.status === "CANCELLED" || booking.status === "DISPUTED" ? false : step >= i;
            return (
              <li key={status} className="text-xs font-semibold">
                <span
                  className={cn(
                    "mb-1 grid size-6 place-items-center rounded-full",
                    done ? "bg-field text-on-field" : "bg-card text-muted",
                  )}
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={done ? "text-ink" : "text-muted"}>{labels[status]}</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-5 h-72">
          <MapCanvas center={booking.site} markers={markers} />
        </div>
        <p className="mt-2 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-950">
          Tracking status: {booking.status === "CONFIRMED" ? "Provider has confirmed the booking." : booking.status === "ON_THE_WAY" ? "Provider marked themselves on the way." : booking.status === "ARRIVED" ? "Provider marked arrival; verify the start code before work." : booking.status === "SERVICE_STARTED" ? "Work has started after code verification." : booking.status === "SERVICE_COMPLETED" || booking.status === "PAID" ? "Work marked complete." : labels[booking.status] ?? booking.status}.
          The map position is an estimate in this prototype, not live GPS. Live vehicle tracking requires provider location sharing and a production backend.
        </p>
        {(booking.status === "CANCELLED" || booking.status === "DISPUTED") && (
          <p className="mt-3 rounded-2xl bg-danger-soft p-4 text-sm text-danger">
            {booking.status === "DISPUTED" ? booking.disputeReason : booking.cancelReason || "Cancelled."} A reviewer
            would take a dispute in production. Here it stays closed.
          </p>
        )}
        <h2 className="mt-6 font-display text-xl font-bold">Activity</h2>
        <ol className="mt-2 grid gap-2">
          {booking.audit.map((row) => (
            <li key={row.at + row.to} className="rounded-xl bg-card px-3 py-2 text-sm">
              <span className="font-semibold">{labels[row.to] ?? row.to}</span>
              <span className="text-muted"> · {row.actor} · {whenClock(row.at)}</span>
              {row.note && <span className="block text-muted">{row.note}</span>}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid content-start gap-4">
        <div className="flex rounded-2xl bg-card p-1">
          <button
            type="button"
            onClick={openCustomer}
            className={cn("h-11 flex-1 rounded-xl text-sm font-semibold", pane === "customer" ? "bg-ink text-on-ink" : "", !isCustomer && "cursor-not-allowed opacity-50")}
            disabled={!isCustomer}
          >
            Customer
          </button>
          <button
            type="button"
            onClick={openOperator}
            className={cn("h-11 flex-1 rounded-xl text-sm font-semibold", pane === "operator" ? "bg-ink text-on-ink" : "", !isOperator && "cursor-not-allowed opacity-50")}
            disabled={!isOperator}
          >
            Operator
          </button>
        </div>

        {pane === "customer" ? (
          <section className="rounded-3xl border border-line bg-card p-5">
            <h2 className="font-display text-2xl font-bold">{inr(booking.amount)}</h2>
            <p className="text-sm text-muted">{booking.summary}</p>
            {booking.quoteEtaMin != null && (
              <p className="mt-1 text-sm text-muted">Provider arrival estimate at quote time: about {booking.quoteEtaMin} minutes. This is an estimate, not live tracking.</p>
            )}
            {booking.quoteIncludes?.length ? (
              <div className="mt-3">
                <p className="text-sm font-semibold">Included in the accepted offer</p>
                <ul className="mt-1 grid gap-1 text-sm text-muted">
                  {booking.quoteIncludes.map((item) => <li key={item}>• {item}</li>)}
                </ul>
              </div>
            ) : null}
            {booking.quoteNote && (
              <p className="mt-2 rounded-xl bg-paper p-3 text-sm leading-5">Provider note: {booking.quoteNote}</p>
            )}
            {booking.status !== "CANCELLED" && booking.status !== "DISPUTED" && provider && (
              <a
                href={`tel:${provider.phone}`}
                className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-field px-4 text-sm font-semibold text-on-field hover:bg-ink"
              >
                Call operator · {provider.phone}
              </a>
            )}
            <ul className="mt-3 grid gap-1 text-sm text-muted">
              {requirementLines(booking.serviceId, booking.requirements).map((row) => (
                <li key={row.label}>
                  {row.label}: {row.value}
                </li>
              ))}
              <li>When: {booking.whenLabel}</li>
            </ul>
            <p className="mt-3 text-xs text-muted">{booking.terms}</p>
            {booking.siteImages?.length ? (
              <div className="mt-4">
                <div className="mb-2 text-sm font-semibold">Work-site photos</div>
                <div className="grid grid-cols-3 gap-2">
                  {booking.siteImages.map((image, index) => (
                    <img key={image.slice(-36)} src={image} alt={`Work-site photo ${index + 1}`} className="h-24 w-full rounded-xl border border-line object-cover" />
                  ))}
                </div>
              </div>
            ) : null}

            {booking.status === "ARRIVED" && booking.startCode && (
              <div className="mt-4 rounded-2xl bg-paper p-4">
                <div className="text-sm font-semibold">Show this code to the operator</div>
                <div className="mt-2 flex gap-2">
                  {booking.startCode.split("").map((d, i) => (
                    <span key={i} className="otp-digit grid place-items-center">
                      {d}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">
                  Expires in about {minutesLeft} min. {OTP_NOTE}
                </p>
                <Button variant="secondary" className="mt-3" onClick={() => act(regenerateCode(booking.id))}>
                  New code
                </Button>
              </div>
            )}

            {booking.status === "SERVICE_COMPLETED" && (
              <div className="mt-4">
                {!showPay ? (
                  <Button className="w-full" onClick={() => setShowPay(true)}>
                    Pay {inr(booking.amount)}
                  </Button>
                ) : (
                  <div className="grid gap-2">
                    <p className="text-sm">Preview only. No money moves. This is the record a payment webhook would write.</p>
                    {["UPI", "Card", "Netbanking", "Cash to operator"].map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setMethod(item)}
                        className={cn(
                          "h-11 rounded-xl border px-3 text-left text-sm font-semibold",
                          method === item ? "border-ink bg-ink text-on-ink" : "border-line",
                        )}
                      >
                        {item}
                      </button>
                    ))}
                    <Button
                      onClick={() => {
                        const result = pay(booking.id, method);
                        act(result);
                        if (result.ok) {
                          toast.success("Payment recorded.");
                          setShowPay(false);
                        }
                      }}
                    >
                      Confirm {method}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {(booking.status === "SERVICE_COMPLETED" || booking.status === "PAID") && !booking.review && (
              <form
                className="mt-4 grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const result = review(booking.id, stars, comment);
                  act(result);
                  if (result.ok) toast.success("Thanks. That review is on the operator.");
                }}
              >
                <div className="font-semibold">Rate {provider?.name}</div>
                <p className="text-xs text-muted">You can leave feedback once the provider marks the work complete.</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setStars(n)} aria-label={`${n} stars`}>
                      <Star className="size-7 text-gold" fill={n <= stars ? "currentColor" : "none"} />
                    </button>
                  ))}
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="What should the next customer know?"
                  className="min-h-20 rounded-xl border border-line p-3 text-base outline-none"
                />
                <Button type="submit">Submit review</Button>
              </form>
            )}
            {booking.review && (
              <p className="mt-4 text-sm font-semibold text-field">You rated this {booking.review.stars} stars.</p>
            )}
            {booking.payment && (
              <p className="mt-2 text-xs text-muted">
                {booking.payment.method} · {booking.payment.ref}
              </p>
            )}

            {(booking.status === "CONFIRMED" || booking.status === "ON_THE_WAY") && (
              <div className="mt-4 grid gap-2">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for cancelling, optional"
                  className="min-h-16 rounded-xl border border-line p-3 text-sm outline-none"
                />
                <Button variant="danger" onClick={() => act(transition(booking.id, "CANCELLED", reason))}>
                  Cancel booking
                </Button>
              </div>
            )}
            {(booking.status === "ARRIVED" || booking.status === "SERVICE_STARTED" || booking.status === "SERVICE_COMPLETED") && (
              <div className="mt-4 grid gap-2">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="What should a reviewer see?"
                  className="min-h-16 rounded-xl border border-line p-3 text-sm outline-none"
                />
                <Button variant="danger" onClick={() => act(transition(booking.id, "DISPUTED", reason))}>
                  Raise a dispute
                </Button>
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-3xl border border-line bg-card p-5">
            <h2 className="font-display text-2xl font-bold">{provider?.name}</h2>
            <p className="text-sm text-muted">
              Only the assigned operator can update this job. Status changes are restricted to this operator session.
            </p>
            {booking.status !== "CANCELLED" && booking.status !== "DISPUTED" && (
              <a
                href={`tel:${booking.customerPhone}`}
                className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-field px-4 text-sm font-semibold text-on-field hover:bg-ink"
              >
                Call customer · {booking.customerPhone}
              </a>
            )}
            <div className="mt-4 grid gap-2">
              {booking.status === "CONFIRMED" && (
                <Button onClick={() => act(transition(booking.id, "ON_THE_WAY"))}>Mark on the way</Button>
              )}
              {booking.status === "ON_THE_WAY" && (
                <Button onClick={() => act(transition(booking.id, "ARRIVED"))}>Mark arrived</Button>
              )}
              {booking.status === "ARRIVED" && (
                <form
                  className="grid gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const result = verifyCode(booking.id, code);
                    act(result);
                    if (result.ok) {
                      toast.success("Code matched. Work has started.");
                      setCode("");
                    }
                  }}
                >
                  <label className="text-sm font-semibold">Enter the customer’s start code</label>
                  <input
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    className="h-12 rounded-xl border border-line px-3 text-center font-display text-2xl tracking-widest outline-none"
                    placeholder="••••"
                  />
                  <p className="text-xs text-muted">
                    {5 - booking.codeAttempts} attempts left. The digits stay on the customer tab.
                  </p>
                  <Button type="submit">Start work</Button>
                </form>
              )}
              {booking.status === "SERVICE_STARTED" && (
                <Button onClick={() => act(transition(booking.id, "SERVICE_COMPLETED"))}>Mark work done</Button>
              )}
              {booking.status === "SERVICE_COMPLETED" && (
                <p className="text-sm text-muted">Waiting for the customer to record payment.</p>
              )}
              {booking.status === "PAID" && <p className="text-sm font-semibold text-field">Paid. This job is closed.</p>}
              {(booking.status === "CONFIRMED" || booking.status === "ON_THE_WAY") && (
                <Button variant="danger" onClick={() => act(transition(booking.id, "CANCELLED", "Operator cancelled"))}>
                  Cancel trip
                </Button>
              )}
              {(booking.status === "ARRIVED" || booking.status === "SERVICE_STARTED") && (
                <Button variant="danger" onClick={() => act(transition(booking.id, "DISPUTED", reason || "Operator raised a dispute"))}>
                  Raise a dispute
                </Button>
              )}
            </div>
          </section>
        )}

        <ChatBox messages={booking.messages} onSend={(text) => sendMessage("booking", booking.id, text)} />
      </div>
    </div>
  );
}

const OTP_NOTE = "In production the server stores only a hash and shows the code once.";
