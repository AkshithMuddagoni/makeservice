import { Link, createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/fieldly/bits";
import { t } from "@/lib/fieldly/i18n";
import { useFieldly } from "@/lib/fieldly/store";
import { z } from "zod";

export const Route = createFileRoute("/account")({ component: AccountPage });

const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number starting 6–9.");

function AccountPage() {
  const lang = useFieldly((s) => s.lang);
  const session = useFieldly((s) => s.session);
  const customer = useFieldly((s) => s.customer);
  const signInCustomer = useFieldly((s) => s.signInCustomer);
  const signOut = useFieldly((s) => s.signOut);
  const resumeCustomer = useFieldly((s) => s.resumeCustomer);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [fails, setFails] = useState(0);

  function send(e: FormEvent) {
    e.preventDefault();
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the number.");
      return;
    }
    setSent(true);
    toast.success("Preview code is 482609.");
  }

  function verify(e: FormEvent) {
    e.preventDefault();
    if (code.trim() !== "482609") {
      const next = fails + 1;
      setFails(next);
      toast.error(next >= 5 ? "Too many tries. Request the code again." : "That code is wrong. Use 482609.");
      if (next >= 5) setSent(false);
      return;
    }
    signInCustomer(phone, name || "Customer");
    toast.success("Signed in.");
  }

  if (session || customer) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <h1 className="font-display text-4xl font-bold">{t(lang, "account_title")}</h1>
        <div className="mt-6 rounded-3xl border border-line bg-card p-5">
          <div className="text-sm text-muted">Signed in</div>
          <div className="font-display text-2xl font-bold">{session?.name ?? customer?.name}</div>
          <div className="text-sm">{session?.phone ?? customer?.phone}</div>
          <div className="mt-1 text-sm text-muted">
            {session?.role === "provider" ? `Operating ${session.name}` : "Customer"}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {session?.role === "provider" && (
              <Button variant="secondary" onClick={() => resumeCustomer() || toast.error("Sign in as a customer first.")}>
                Back to customer
              </Button>
            )}
            <Button asChild variant="secondary">
              <Link to="/bookings">{t(lang, "nav_bookings")}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/desk">{t(lang, "nav_desk")}</Link>
            </Button>
            <Button variant="danger" onClick={signOut}>
              {t(lang, "sign_out")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-10">
      <form onSubmit={sent ? verify : send} className="w-full rounded-3xl border border-line bg-card p-6">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-ink font-display text-xl font-bold text-on-ink">
          F
        </div>
        <h1 className="mt-4 text-center font-display text-3xl font-bold">Sign in</h1>
        <p className="mt-2 text-center text-sm text-muted">
          {t(lang, "no_sms")} {t(lang, "demo_code")} <span className="font-semibold text-ink">482609</span>
        </p>
        {!sent ? (
          <div className="mt-5 grid gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className={controlClass}
            />
            <input
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="Mobile number"
              className={controlClass}
            />
            <Button type="submit" size="lg">
              Get code
            </Button>
          </div>
        ) : (
          <div className="mt-5 grid gap-3">
            <input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="482609"
              className={controlClass + " text-center font-display text-2xl tracking-widest"}
            />
            <Button type="submit" size="lg">
              {t(lang, "continue")}
            </Button>
            <button type="button" className="text-sm font-semibold text-muted" onClick={() => setSent(false)}>
              Change number
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
