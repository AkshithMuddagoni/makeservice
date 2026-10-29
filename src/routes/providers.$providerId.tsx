import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BadgeCheck, MapPin, MessageCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Stars, requirementLines } from "@/components/fieldly/bits";
import { Button } from "@/components/ui/button";
import { getService, isEligible, verificationLines } from "@/lib/fieldly/catalog";
import { formatKm, kmBetween, travelMinutes } from "@/lib/fieldly/geo";
import { inr, maskPhone } from "@/lib/fieldly/format";
import { priceJob } from "@/lib/fieldly/pricing";
import { useFieldly, useProviders } from "@/lib/fieldly/store";

export const Route = createFileRoute("/providers/$providerId")({
  validateSearch: (search: Record<string, unknown>) => ({
    service: typeof search.service === "string" ? search.service : "",
  }),
  component: ProviderPage,
});

function ProviderPage() {
  const { providerId } = Route.useParams();
  const { service: serviceQuery } = Route.useSearch();
  const navigate = useNavigate();
  const providers = useProviders();
  const provider = providers.find((p) => p.id === providerId);
  const site = useFieldly((s) => s.site);
  const draft = useFieldly((s) => s.draft);
  const session = useFieldly((s) => s.session);
  const customer = useFieldly((s) => s.customer);
  const bookings = useFieldly((s) => s.bookings);
  const createRequest = useFieldly((s) => s.createRequest);
  const resumeCustomer = useFieldly((s) => s.resumeCustomer);
  const [picked, setPicked] = useState(serviceQuery || provider?.services[0] || "");
  const [detailsConfirmed, setDetailsConfirmed] = useState(false);

  if (!provider) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="font-display text-3xl font-bold">Operator not found.</h1>
        <Link to="/" className="mt-3 inline-block font-semibold">
          Home
        </Link>
      </div>
    );
  }

  const serviceId = provider.services.includes(picked) ? picked : provider.services[0];
  const service = getService(serviceId);
  const km = site ? kmBetween(site, provider) : null;
  const hasMatchingDraft = Boolean(draft && draft.serviceId === serviceId);
  const req = hasMatchingDraft ? draft!.requirements : {};
  const selectedImages = hasMatchingDraft ? draft!.siteImages ?? [] : [];
  const priced = service ? priceJob(service.id, provider, req) : null;
  const eligible = service ? isEligible(provider, service.id) && provider.online && km != null && km <= service.radiusKm : false;
  const known =
    bookings.some((b) => b.providerId === provider.id && b.customerPhone === (customer?.phone || session?.phone)) ||
    false;
  const lines = verificationLines(provider);
  const liveReviews = bookings
    .filter((b) => b.providerId === provider.id && b.review)
    .map((b) => ({
      name: b.customerName,
      stars: b.review!.stars,
      text: b.review!.text || "Rated without a comment.",
      ago: "from your bookings",
    }));

  async function request() {
    if (!hasMatchingDraft) {
      void navigate({ to: "/services/$slug", params: { slug: serviceId } });
      return;
    }
    if (!detailsConfirmed) {
      toast.error("Review the requirements and confirm before sending your request.");
      return;
    }
    if (!session || session.role !== "customer") {
      if (customer && resumeCustomer()) {
        /* switched back to the customer who will own the request */
      } else {
        toast.error("Sign in to request a quote.");
        void navigate({ to: "/account" });
        return;
      }
    }
    const result = createRequest({ serviceId, providerId: provider!.id, detailsConsent: true });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    void navigate({ to: "/requests/$requestId", params: { requestId: result.id! } });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link to="/" className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ArrowLeft className="size-4" /> Back
      </Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-4xl font-bold tracking-tight">{provider.name}</h1>
                {eligible && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-field-soft px-2 py-1 text-xs font-semibold text-field">
                    <BadgeCheck className="size-3.5" /> Eligible
                  </span>
                )}
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                <Stars value={provider.rating} />
                <span>
                  {provider.rating.toFixed(1)} · {provider.reviewCount + liveReviews.length} reviews
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {provider.area}, {provider.city}
                  {km != null ? ` · ${formatKm(km)} · ${travelMinutes(km)} min` : ""}
                </span>
              </p>
              <p className="mt-3 max-w-2xl text-sm text-muted">{provider.bio}</p>
              <p className="mt-2 text-sm">
                Replies in about {provider.replyMin} min · {provider.years} years · {provider.jobs} jobs ·{" "}
                {provider.languages.join(", ")}
              </p>
              <p className="mt-2 text-sm font-semibold">
                Phone {known ? provider.phone : maskPhone(provider.phone)}
                {!known && <span className="font-normal text-muted"> · shown in full after you book</span>}
              </p>
            </div>
          </div>

          <section className="mt-6">
            <h2 className="font-display text-xl font-bold">What was checked</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {lines.map((line) => (
                <div key={line.title} className="rounded-2xl border border-line bg-card p-4">
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted">{line.title}</div>
                  <div className={line.ok ? "mt-1 font-semibold text-field" : "mt-1 font-semibold text-danger"}>
                    {line.ok ? "Checked" : "Not checked"}
                  </div>
                  <p className="mt-1 text-sm text-muted">{line.detail}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">
              A rig badge is not permission to drill. Telangana WALTA and other state rules still apply to the site
              owner.
            </p>
          </section>

          <section className="mt-6">
            <h2 className="font-display text-xl font-bold">Equipment</h2>
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card">
              {provider.machines.map((m) => (
                <li key={m} className="px-4 py-3 text-sm font-semibold">
                  {m}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6">
            <h2 className="font-display text-xl font-bold">Reviews</h2>
            <div className="mt-3 grid gap-3">
              {[...liveReviews, ...provider.reviews].map((review) => (
                <article key={review.name + review.text} className="rounded-2xl border border-line bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{review.name}</span>
                    <Stars value={review.stars} />
                  </div>
                  <p className="mt-2 text-sm text-muted">{review.text}</p>
                  <p className="mt-1 text-xs text-muted">{review.ago}</p>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="h-fit rounded-3xl border border-line bg-card p-5 lg:sticky lg:top-20">
          <p className="text-xs font-semibold uppercase tracking-widest text-field">Quote</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {provider.services.map((id) => {
              const svc = getService(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPicked(id)}
                  className={
                    id === serviceId
                      ? "h-9 rounded-full bg-ink px-3 text-xs font-semibold text-on-ink"
                      : "h-9 rounded-full border border-line px-3 text-xs font-semibold"
                  }
                >
                  {svc?.name ?? id}
                </button>
              );
            })}
          </div>
          {priced && (
            <>
              <div className="mt-4 font-display text-3xl font-bold">
                {priced.amount > 0 ? inr(priced.amount) : "Quote after inspection"}
              </div>
              <p className="text-sm text-muted">{priced.summary}</p>
              <ul className="mt-3 grid gap-1 text-sm">
                {priced.includes.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
              {hasMatchingDraft && draft && (
                <section className="mt-4 rounded-2xl border border-line bg-white p-4">
                  <h3 className="font-display text-lg font-bold">Review your service request</h3>
                  <p className="mt-1 text-xs text-muted">
                    {service?.name} · {draft.whenLabel} · {site?.address || site?.label}
                  </p>
                  <ul className="mt-3 grid gap-2 text-sm">
                    {requirementLines(serviceId, draft.requirements).map((row) => (
                      <li key={row.label} className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b border-line/70 pb-2">
                        <span className="text-muted">{row.label}</span>
                        <span className="text-right font-semibold">{row.value}</span>
                      </li>
                    ))}
                  </ul>
                  {draft.notes && (
                    <p className="mt-3 text-sm"><span className="font-semibold">Operator note:</span> {draft.notes}</p>
                  )}
                  {selectedImages.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {selectedImages.map((image, index) => (
                        <img key={image.slice(-36)} src={image} alt={`Site photo ${index + 1}`} className="h-20 w-full rounded-lg border border-line object-cover" />
                      ))}
                    </div>
                  )}
                </section>
              )}
              <p className="mt-3 text-xs text-muted">{priced.note}</p>
            </>
          )}
          {!eligible && (
            <p className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">
              Not eligible for this service until identity, equipment
              {serviceId === "borewell" ? " and a WALTA rig number" : ""} are on file.
            </p>
          )}
          {hasMatchingDraft && (
            <label className="mt-4 flex items-start gap-3 rounded-2xl border border-line bg-white p-3 text-sm leading-5">
              <input
                type="checkbox"
                checked={detailsConfirmed}
                onChange={(event) => setDetailsConfirmed(event.target.checked)}
                className="mt-1 size-4 shrink-0 accent-emerald-600"
              />
              <span>
                I have reviewed the selected service, work-site location, requirements, date, notes and optional photos. I agree to share these details with <strong>{provider.name}</strong> for this request. I understand that the price and schedule are not final until I review the provider's quote, and I will confirm any permits or safety requirements that apply.
              </span>
            </label>
          )}
          {serviceId === "borewell" && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-950">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              Borewell drilling must follow applicable local permissions and groundwater rules. A provider profile or rig verification is not official permission to drill.
            </p>
          )}
          <Button className="mt-4 w-full" size="lg" disabled={!eligible || (hasMatchingDraft && !detailsConfirmed)} onClick={() => void request()}>
            {hasMatchingDraft ? "Send request to this provider" : "Add job details"}
          </Button>
          <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-muted">
            <MessageCircle className="size-3.5" />
            This request goes only to this provider. Chat and contact options unlock after the provider responds.
          </p>
        </aside>
      </div>
    </div>
  );
}
