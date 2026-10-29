import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BadgeCheck, MapPin, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Stars, requirementLines } from "@/components/fieldly/bits";
import { Button } from "@/components/ui/button";
import { getService, isEligible, supportsServiceRequest, verificationLines } from "@/lib/fieldly/catalog";
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
  const req = draft?.serviceId === serviceId ? draft.requirements : {};
  const priced = service ? priceJob(service.id, provider, req) : null;
  const eligible = service ? isEligible(provider, service.id, req) && supportsServiceRequest(provider, service.id, req) && provider.online : false;
  const requiresManualQuote = serviceId === "borewell" &&
    Boolean(req.borewell_service) &&
    req.borewell_service !== "New borewell drilling";
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
    if (!session || session.role !== "customer") {
      if (customer && resumeCustomer()) {
        /* switched back to the customer who will own the request */
      } else {
        toast.error("Sign in to request a quote.");
        void navigate({ to: "/account" });
        return;
      }
    }
    if (!draft || draft.serviceId !== serviceId) {
      void navigate({ to: "/services/$slug", params: { slug: serviceId } });
      return;
    }
    const result = createRequest({ serviceId, providerId: provider!.id });
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
              <div className="mt-4 font-display text-3xl font-bold">{requiresManualQuote ? "Quote required" : inr(priced.amount)}</div>
              <p className="text-sm text-muted">{requiresManualQuote ? "The operator must send a specific price for this service." : priced.summary}</p>
              <ul className="mt-3 grid gap-1 text-sm">
                {priced.includes.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
              {draft?.serviceId === serviceId && (
                <>
                  <ul className="mt-3 grid gap-1 text-sm text-muted">
                    {requirementLines(serviceId, draft.requirements).map((row) => (
                      <li key={row.label}>
                        {row.label}: {row.value}
                      </li>
                    ))}
                    <li>When: {draft.whenLabel}</li>
                  </ul>
                  {draft.siteImages?.length ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-muted">Attached site photos ({draft.siteImages.length})</p>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {draft.siteImages.map((photo, index) => (
                          <img key={photo.name + index} src={photo.dataUrl} alt={photo.name} className="h-20 w-full rounded-lg object-cover" />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
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
          <Button className="mt-4 w-full" size="lg" disabled={!eligible} onClick={() => void request()}>
            {draft?.serviceId === serviceId ? "Request quotes" : "Add job details"}
          </Button>
          <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-muted">
            <MessageCircle className="size-3.5" />
            Up to three eligible operators can quote. You compare before accepting.
          </p>
        </aside>
      </div>
    </div>
  );
}
