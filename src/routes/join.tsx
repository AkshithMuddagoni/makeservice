import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/fieldly/bits";
import { ServiceIcon } from "@/components/fieldly/icons";
import { SERVICES } from "@/lib/fieldly/catalog";
import { useFieldly } from "@/lib/fieldly/store";
import type { Provider } from "@/lib/fieldly/types";
import { cn } from "@/lib/utils";
import { z } from "zod";

export const Route = createFileRoute("/join")({ component: JoinPage });

const phoneSchema = z.string().regex(/^[6-9]\d{9}$/);

function JoinPage() {
  const navigate = useNavigate();
  const site = useFieldly((s) => s.site);
  const addProvider = useFieldly((s) => s.addProvider);
  const signInProvider = useFieldly((s) => s.signInProvider);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [services, setServices] = useState<string[]>(["jcb"]);
  const [equipment, setEquipment] = useState("");
  const [years, setYears] = useState("5");
  const [rate, setRate] = useState("1500");
  const [walta, setWalta] = useState("");
  const [papers, setPapers] = useState({ identity: true, equipment: true, insurance: false });
  const [created, setCreated] = useState<string | null>(null);

  function toggle(id: string) {
    setServices((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function submit() {
    if (name.trim().length < 3) return toast.error("Add the business name.");
    if (!phoneSchema.safeParse(phone).success) return toast.error("Enter a valid mobile number.");
    if (!services.length) return toast.error("Pick at least one service.");
    if (!equipment.trim()) return toast.error("Describe the machine.");
    const id = `yard_${phone}`;
    const numeric = Number(rate) || 1500;
    const rates: Provider["rates"] = {};
    for (const idService of services) {
      const unit =
        idService === "borewell" ? "ft" : idService === "tanker" || idService === "tipper" ? "trip" : idService === "tractor" || idService === "agri" ? "acre" : idService === "rental" ? "day" : "hr";
      rates[idService] = { rate: numeric, unit };
    }
    const provider: Provider = {
      id,
      phone,
      name: name.trim(),
      city: site?.city || "Warangal",
      area: site?.area || "Your yard",
      state: site?.state || "Telangana",
      lat: site?.lat ?? 17.978,
      lng: site?.lng ?? 79.575,
      services,
      equipment: equipment.trim(),
      machines: [equipment.trim()],
      years: Number(years) || 1,
      jobs: 0,
      rating: 5,
      reviewCount: 0,
      replyMin: 10,
      rates,
      // Document checkboxes are declarations in this preview, not verification.
      verified: {
        identity: false,
        equipment: false,
        insurance: false,
        walta: null,
      },
      approved: false,
      online: false,
      bio: "New listing. Customers see it after verification.",
      languages: ["Telugu", "Hindi"],
      reviews: [],
    };
    addProvider(provider);
    setCreated(id);
    setStep(4);
    toast.success("Listing saved on this device.");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-field">Step {Math.min(step, 3)} of 3</p>
      <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">List a machine</h1>
      <p className="mt-2 text-sm text-muted">
        Customers only see you after identity and equipment are checked
        {services.includes("borewell") ? ", and a WALTA rig number is on file for drilling" : ""}. Documents are not
        uploaded in this preview — tick what you would file.
      </p>

      {step === 1 && (
        <div className="mt-6 grid gap-3 rounded-3xl border border-line bg-card p-5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Business name" className={controlClass} />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="Mobile number"
            className={controlClass}
          />
          <p className="text-xs text-muted">
            Yard pin: {site ? `${site.label}, ${site.area}` : "not set — we’ll use central Warangal"}.{" "}
            <Link to="/" className="font-semibold">
              Change site
            </Link>
          </p>
          <Button onClick={() => (name.trim() && phone.length === 10 ? setStep(2) : toast.error("Name and mobile first."))}>
            Continue
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="mt-6 rounded-3xl border border-line bg-card p-5">
          <div className="grid gap-2 sm:grid-cols-2">
            {SERVICES.map((service) => {
              const on = services.includes(service.id);
              return (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => toggle(service.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-semibold",
                    on ? "border-ink bg-ink text-on-ink" : "border-line",
                  )}
                >
                  <ServiceIcon name={service.icon} className="size-4" />
                  {service.name}
                </button>
              );
            })}
          </div>
          <input
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            placeholder="Machine, for example JCB 3DX with breaker"
            className={controlClass + " mt-4"}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, ""))} className={controlClass} aria-label="Years" />
            <input value={rate} onChange={(e) => setRate(e.target.value.replace(/\D/g, ""))} className={controlClass} aria-label="Base rate" />
          </div>
          {services.includes("borewell") && (
            <input
              value={walta}
              onChange={(e) => setWalta(e.target.value)}
              placeholder="WALTA rig number"
              className={controlClass + " mt-3"}
            />
          )}
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={() => setStep(3)}>Continue</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-6 rounded-3xl border border-line bg-card p-5">
          <p className="text-sm font-semibold">Papers you would file</p>
          {(
            [
              ["identity", "Identity of the business and operator"],
              ["equipment", "Equipment inspection"],
              ["insurance", "Insurance"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="mt-3 flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={papers[key]}
                onChange={(e) => setPapers((p) => ({ ...p, [key]: e.target.checked }))}
                className="size-5"
              />
              {label}
            </label>
          ))}
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={submit}>Submit for review</Button>
          </div>
        </div>
      )}

      {step === 4 && created && (
        <div className="mt-6 rounded-3xl border border-line bg-card p-5">
          <h2 className="font-display text-2xl font-bold">Under review</h2>
          <p className="mt-2 text-sm text-muted">
            This listing is stored only in this browser for the preview. No documents were uploaded or independently
            checked, so the listing remains unapproved and is not shown to customers.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                signInProvider(created);
                toast.success("Preview desk opened. Your listing remains under review.");
                void navigate({ to: "/desk" });
              }}
            >
              Open preview desk
            </Button>
            <Button asChild variant="secondary">
              <Link to="/desk">Desk</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
