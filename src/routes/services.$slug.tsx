import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FieldList, missingFields, controlClass } from "@/components/fieldly/bits";
import { CustomerSignInDialog } from "@/components/fieldly/customer-sign-in-dialog";
import { ServiceIcon } from "@/components/fieldly/icons";
import { Button } from "@/components/ui/button";
import { WHEN_OPTIONS, getService } from "@/lib/fieldly/catalog";
import { t } from "@/lib/fieldly/i18n";
import { useFieldly } from "@/lib/fieldly/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/services/$slug")({ component: ServiceForm });

function ServiceForm() {
  const { slug } = Route.useParams();
  const service = getService(slug);
  const navigate = useNavigate();
  const lang = useFieldly((s) => s.lang);
  const site = useFieldly((s) => s.site);
  const session = useFieldly((s) => s.session);
  const [signInOpen, setSignInOpen] = useState(true);
  const draft = useFieldly((s) => s.draft);
  const setDraft = useFieldly((s) => s.setDraft);
  const initial = draft?.serviceId === slug ? draft : null;
  const [requirements, setRequirements] = useState<Record<string, string>>(initial?.requirements ?? {});
  const [whenChoice, setWhenChoice] = useState(
    initial && !WHEN_OPTIONS.includes(initial.whenLabel as (typeof WHEN_OPTIONS)[number]) && initial.whenLabel
      ? "Pick a date"
      : initial?.whenLabel || "",
  );
  const [date, setDate] = useState(
    initial && !WHEN_OPTIONS.includes(initial.whenLabel as (typeof WHEN_OPTIONS)[number]) ? initial.whenLabel : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  if (!service) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="font-display text-3xl font-bold">That service is not on Fieldly.</h1>
        <Link to="/" className="mt-4 inline-block font-semibold text-field">
          Back home
        </Link>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <h1 className="font-display text-3xl font-extrabold">Choose your work site first.</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Fieldly asks for your location before you select a service or enter job requirements.</p>
        <Button asChild className="mt-5">
          <Link to="/">Set work-site location</Link>
        </Button>
      </div>
    );
  }

  if (!session || session.role !== "customer") {
    return (
      <main className="mx-auto min-h-[60vh] max-w-2xl px-4 py-10">
        <section className="rounded-3xl border border-line bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-field">Location confirmed</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold">Sign in before entering job details.</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Your work site is saved. Sign in first, then continue with {service.name}.
          </p>
          <Button className="mt-5" onClick={() => setSignInOpen(true)}>Sign in and continue</Button>
        </section>
        <CustomerSignInDialog
          open={signInOpen}
          onClose={() => setSignInOpen(false)}
          onSuccess={() => setSignInOpen(false)}
        />
      </main>
    );
  }

  const whenLabel = whenChoice === "Pick a date" ? date : whenChoice;

  function submit() {
    if (!site) {
      toast.error("Set the work site first.");
      void navigate({ to: "/" });
      return;
    }
    const missing = missingFields(service!, requirements, whenLabel);
    if (missing.length) {
      toast.error(`Add ${missing[0]}.`);
      return;
    }
    setDraft({ serviceId: service!.id, requirements, whenLabel, notes });
    void navigate({ to: "/find/$slug", params: { slug: service!.id } });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ArrowLeft className="size-4" /> Home
      </Link>
      <div className="flex items-start gap-4">
        <span className="grid size-14 place-items-center rounded-2xl bg-card text-ink">
          <ServiceIcon name={service.icon} className="size-7" />
        </span>
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">{service.name}</h1>
          <p className="mt-1 text-muted">
            {site ? `${site.label}, ${site.area}` : "Set a work site to continue."} · {service.fromLabel}
          </p>
        </div>
      </div>
      <div className="mt-6 rounded-3xl border border-line bg-card p-5">
        <FieldList
          service={service}
          value={requirements}
          onChange={(key, next) => setRequirements((prev) => ({ ...prev, [key]: next }))}
        />
        <div className="mt-5 grid gap-2">
          <span className="text-sm font-semibold">When should they come?</span>
          <span className="flex flex-wrap gap-2">
            {WHEN_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setWhenChoice(opt)}
                className={cn(
                  "h-11 rounded-full border px-3 text-sm font-semibold",
                  whenChoice === opt ? "border-ink bg-ink text-on-ink" : "border-line bg-paper",
                )}
              >
                {opt}
              </button>
            ))}
          </span>
          {whenChoice === "Pick a date" && (
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={controlClass} />
          )}
        </div>
        <label className="mt-5 grid gap-2">
          <span className="text-sm font-semibold">Anything the operator should know?</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Gate code, overhead wires, crops already sown…"
            className="min-h-24 w-full rounded-xl border border-line bg-paper p-3 text-base outline-none focus-visible:border-ink"
          />
        </label>
        <Button className="mt-6 w-full" size="lg" onClick={submit}>
          {t(lang, "see_who")}
        </Button>
      </div>
    </div>
  );
}
