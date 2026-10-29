import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, ShieldCheck, Smartphone, X } from "lucide-react";
import { useFieldly } from "@/lib/fieldly/store";

type CustomerSignInDialogProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const PREVIEW_CODE = "482609";

export function CustomerSignInDialog({ open, onClose, onSuccess }: CustomerSignInDialogProps) {
  const signInCustomer = useFieldly((state) => state.signInCustomer);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [failures, setFailures] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    setName("");
    setPhone("");
    setCode("");
    setSent(false);
    setFailures(0);
    setError("");
  }, [open]);

  if (!open) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!sent) {
      const normalizedPhone = phone.replace(/\s+/g, "");
      if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
        setError("Enter a valid 10-digit Indian mobile number.");
        return;
      }
      setPhone(normalizedPhone);
      setSent(true);
      return;
    }

    if (code.trim() !== PREVIEW_CODE) {
      const nextFailures = failures + 1;
      setFailures(nextFailures);
      setError(nextFailures >= 5
        ? "Too many incorrect attempts. Request the preview code again."
        : "That code is incorrect. Use the preview code shown below.");
      if (nextFailures >= 5) {
        setSent(false);
        setCode("");
      }
      return;
    }

    signInCustomer(phone, name.trim() || "Customer");
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/65 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close sign-in dialog"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="fieldly-signin-title"
        aria-describedby="fieldly-signin-description"
        className="relative z-10 max-h-[94vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/70 bg-card p-5 shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-field-soft text-field">
              <Smartphone className="size-5" />
            </span>
            <div>
              <h2 id="fieldly-signin-title" className="font-display text-2xl font-extrabold tracking-tight">
                Sign in to continue
              </h2>
              <p id="fieldly-signin-description" className="mt-1 text-sm leading-5 text-muted">
                Sign in before entering the job details for this work site.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign-in"
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-paper text-ink hover:bg-field-soft"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 grid gap-3">
          <label className="grid gap-1.5 text-sm font-semibold">
            Your name <span className="font-normal text-muted">(optional)</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              placeholder="Your name"
              className="h-12 w-full rounded-xl border border-line bg-white px-3 font-normal outline-none focus:border-field focus:ring-2 focus:ring-field/15"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            Mobile number
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="numeric"
              autoComplete="tel-national"
              type="tel"
              required
              placeholder="10-digit mobile number"
              aria-label="Mobile number"
              className="h-12 w-full rounded-xl border border-line bg-white px-3 font-normal outline-none focus:border-field focus:ring-2 focus:ring-field/15"
            />
          </label>

          {sent && (
            <>
              <label className="grid gap-1.5 text-sm font-semibold">
                Verification code
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  placeholder="6-digit code"
                  aria-label="Verification code"
                  className="h-12 w-full rounded-xl border border-line bg-white px-3 font-normal tracking-[0.25em] outline-none focus:border-field focus:ring-2 focus:ring-field/15"
                />
              </label>
              <p className="rounded-xl bg-sky-50 px-3 py-2.5 text-xs leading-5 text-sky-950">
                Preview mode: use code <strong>{PREVIEW_CODE}</strong>. Real SMS delivery is not connected yet.
              </p>
            </>
          )}

          {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

          <button
            type="submit"
            className="mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 font-bold text-on-ink transition hover:bg-field"
          >
            {sent ? "Sign in and continue" : "Continue with mobile"}
            <ArrowRight className="size-4" />
          </button>
        </form>

        <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-field" />
          Your selected work-site location stays saved while you sign in.
        </p>
      </section>
    </div>
  );
}
