import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { CustomerSignInDialog } from "@/components/fieldly/customer-sign-in-dialog";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/fieldly/i18n";
import { useFieldly } from "@/lib/fieldly/store";

export const Route = createFileRoute("/account")({ component: AccountPage });

function AccountPage() {
  const navigate = useNavigate();
  const lang = useFieldly((state) => state.lang);
  const session = useFieldly((state) => state.session);
  const customer = useFieldly((state) => state.customer);
  const signOut = useFieldly((state) => state.signOut);
  const resumeCustomer = useFieldly((state) => state.resumeCustomer);

  if (!session && !customer) {
    return (
      <CustomerSignInDialog
        open
        onClose={() => void navigate({ to: "/" })}
        onSuccess={() => toast.success("Signed in.")}
      />
    );
  }

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
          <Button variant="danger" onClick={signOut}>
            {t(lang, "sign_out")}
          </Button>
        </div>
      </div>
    </div>
  );
}
