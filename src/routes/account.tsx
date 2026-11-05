import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient, authEnabled, signOut as signOutAuth } from "@/lib/auth/client";
import { acceptCurrentProviderOperatorInvite } from "@/lib/fieldly/account.functions";
import { CustomerSignInDialog } from "@/components/fieldly/customer-sign-in-dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { t } from "@/lib/fieldly/i18n";
import { useFieldly } from "@/lib/fieldly/store";

export const Route = createFileRoute("/account")({ component: AccountPage });

function AccountPage() {
  const navigate = useNavigate();
  const lang = useFieldly((state) => state.lang);
  const session = useFieldly((state) => state.session);
  const customer = useFieldly((state) => state.customer);
  const clearLocalSession = useFieldly((state) => state.signOut);
  const [signingOut, setSigningOut] = useState(false);
  const [operatorInviteToken, setOperatorInviteToken] = useState("");
  const [acceptingOperatorInvite, setAcceptingOperatorInvite] = useState(false);
  const [acceptedOperator, setAcceptedOperator] = useState<{ operatorName: string; businessName: string } | null>(null);
  const { data: authSession, isPending: authSessionPending } = authClient.useSession();
  const resumeCustomer = useFieldly((state) => state.resumeCustomer);

  useEffect(() => {
    const prefix = "#operator-invite=";
    if (!window.location.hash.startsWith(prefix)) return;
    const token = window.location.hash.slice(prefix.length);
    // The token stays in the URL fragment so it is not sent in HTTP requests.
    // Clear it from browser history as soon as the account page reads it.
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
      setOperatorInviteToken(token);
    } else {
      toast.error("This operator invitation link is invalid.");
    }
  }, []);

  async function acceptOperatorInvite() {
    if (!operatorInviteToken || acceptingOperatorInvite) return;
    setAcceptingOperatorInvite(true);
    try {
      const result = await acceptCurrentProviderOperatorInvite({
        data: { token: operatorInviteToken },
      });
      setAcceptedOperator({ operatorName: result.operatorName, businessName: result.businessName });
      setOperatorInviteToken("");
      toast.success("Your operator account is linked. Assigned bookings will appear in your bookings.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "This operator invitation could not be accepted.");
    } finally {
      setAcceptingOperatorInvite(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      if (authEnabled) {
        // Clear Better Auth's HttpOnly session (and preview bearer) first.
        // The callback clears the legacy local UI identity only after the
        // server confirms sign-out, so the page never falsely shows signed-out.
        await signOutAuth("/", clearLocalSession);
      } else {
        clearLocalSession();
        await navigate({ to: "/" });
      }
    } catch {
      toast.error("Sign-out failed. Your account is still signed in; please retry.");
      setSigningOut(false);
    }
  }

  if (!session && !customer && !authSession?.user) {
    if (authSessionPending) {
      return <div className="mx-auto max-w-xl px-4 py-10 text-sm text-muted">Checking your account…</div>;
    }
    return (
      <CustomerSignInDialog
        open
        onClose={() => void navigate({ to: "/" })}
        onSuccess={() => {
          toast.success("Signed in.");
          if (!operatorInviteToken) void navigate({ to: "/" });
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="font-display text-4xl font-bold">{t(lang, "account_title")}</h1>
      {operatorInviteToken && (
        <section className="mt-6 rounded-3xl border border-line bg-card p-5">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-field-soft p-2 text-field"><ShieldCheck className="size-5" /></span>
            <h2 className="font-display text-xl font-bold">Link your operator account</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted">
            This invitation is valid for one operator only. Accept it while signed in with the same verified Indian mobile number that your provider registered for you.
          </p>
          {!authSessionPending && !authSession?.user && (
            <p className="mt-3 rounded-xl bg-paper p-3 text-sm">
              Sign in to the MakeService account registered to your operator mobile number. The invitation remains available on this page.
            </p>
          )}
          {authSession?.user && !authSession.user.phoneNumberVerified && (
            <p className="mt-3 rounded-xl bg-paper p-3 text-sm">
              Mobile verification is required before this invitation can be accepted. Phone OTP remains a deferred launch step, so account linking stays locked until your number is verified.
            </p>
          )}
          <Button
            type="button"
            className="mt-4"
            disabled={!authEnabled || !authSession?.user || !authSession.user.phoneNumberVerified || acceptingOperatorInvite}
            onClick={() => void acceptOperatorInvite()}
          >
            {acceptingOperatorInvite ? "Linking account…" : "Accept operator invitation"}
          </Button>
        </section>
      )}

      {acceptedOperator && (
        <section className="mt-6 rounded-3xl border border-field/30 bg-field-soft p-5">
          <h2 className="font-display text-xl font-bold">Operator account linked</h2>
          <p className="mt-2 text-sm">
            {acceptedOperator.operatorName} · {acceptedOperator.businessName}
          </p>
          <p className="mt-1 text-sm text-muted">
            You can now open bookings assigned to this operator profile, exchange booking messages and share live location while the booking is active.
          </p>
          <Button asChild className="mt-4">
            <Link to="/bookings">View assigned bookings</Link>
          </Button>
        </section>
      )}

      <div className="mt-6 rounded-3xl border border-line bg-card p-5">
        <div className="text-sm text-muted">Signed in</div>
        <div className="font-display text-2xl font-bold">{session?.name ?? customer?.name ?? authSession?.user.name}</div>
        <div className="text-sm">{session?.phone ?? customer?.phone ?? (authSession?.user.phoneNumber || "Mobile number not added")}</div>
        <div className="mt-1 text-sm text-muted">
          {session?.role === "provider" ? `Operating ${session.name}` : "Customer"}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {session?.role === "provider" && (
            <Button
              variant="secondary"
              onClick={() => resumeCustomer() || toast.error("Sign in as a customer first.")}
            >
              Back to customer
            </Button>
          )}
          <Button asChild variant="secondary">
            <Link to="/bookings">{t(lang, "nav_bookings")}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/desk">{t(lang, "nav_desk")}</Link>
          </Button>
          <Button variant="danger" disabled={signingOut} onClick={() => void handleSignOut()}>
            {signingOut ? "Signing out…" : t(lang, "sign_out")}
          </Button>
        </div>
      </div>
    </div>
  );
}
