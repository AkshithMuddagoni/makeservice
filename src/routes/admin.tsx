import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, ArrowLeft, CheckCircle2, Clock3, FileCheck2, FileText, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient, authEnabled } from "@/lib/auth/client";
import {
  applyAdminProviderReviewDecision,
  getAdminProviderApplicationDetail,
  getAdminProviderDocumentDownloadUrl,
  getAdminProviderReviewQueue,
  reviewAdminProviderAsset,
  reviewAdminProviderDocument,
  reviewAdminProviderOperator,
  reviewAdminProviderService,
} from "@/lib/fieldly/account.functions";
import { SERVICE_ONBOARDING } from "@/lib/fieldly/provider-onboarding";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({ component: AdminRoutePage });

type Queue = Awaited<ReturnType<typeof getAdminProviderReviewQueue>>;
type QueueItem = Queue[number];
type ApplicationDetail = NonNullable<Awaited<ReturnType<typeof getAdminProviderApplicationDetail>>>;
type Decision = "under_review" | "needs_information" | "rejected" | "approved";

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\\b\\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status: string) {
  const value = status.toLowerCase();
  if (value === "approved" || value === "verified") return "bg-emerald-50 text-emerald-800";
  if (value === "rejected" || value === "suspended" || value === "expired") return "bg-red-50 text-red-800";
  if (value === "needs_information" || value === "pending" || value === "submitted") return "bg-amber-50 text-amber-900";
  return "bg-slate-100 text-slate-700";
}

function AdminRoutePage() {
  const { data: session, isPending } = authClient.useSession();

  if (!authEnabled) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-14">
        <ShieldCheck className="size-8 text-muted" />
        <h1 className="mt-3 font-display text-3xl font-bold">Admin access is disabled</h1>
        <p className="mt-2 text-sm leading-6 text-muted">The admin console requires production authentication. Sign-in must be enabled on the server before this page can be used.</p>
      </div>
    );
  }
  if (isPending) {
    return <div className="mx-auto max-w-5xl px-4 py-14 text-sm text-muted">Checking administrator session…</div>;
  }
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-14">
        <ShieldCheck className="size-8 text-muted" />
        <h1 className="mt-3 font-display text-3xl font-bold">Administrator sign-in required</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Sign in with your MakeService account. Access is granted only to accounts with the server-assigned administrator role.</p>
        <Button asChild className="mt-5"><Link to="/account">Sign in</Link></Button>
      </div>
    );
  }
  return <AdminWorkspace />;
}

function AdminWorkspace() {
  const [queue, setQueue] = useState<Queue>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [documentBusyId, setDocumentBusyId] = useState<string | null>(null);
  const [itemBusyId, setItemBusyId] = useState<string | null>(null);

  const loadQueue = useCallback(async (quiet = false) => {
    if (!quiet) setQueueLoading(true);
    setError("");
    try {
      const items = await getAdminProviderReviewQueue();
      setQueue(items);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not load the administrator queue.";
      setError(message);
      if (!quiet) toast.error(message);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (businessId: string) => {
    setSelectedId(businessId);
    setDetailLoading(true);
    setDetail(null);
    setNote("");
    try {
      const result = await getAdminProviderApplicationDetail({ data: { businessId } });
      if (!result) {
        toast.error("This provider application no longer exists.");
        setSelectedId(null);
        return;
      }
      setDetail(result);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not load application details.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const pendingDocs = useMemo(() => {
    if (!detail) return 0;
    return detail.documentRequirements.filter((requirement) => {
      if (!requirement.requiredForApproval || requirement.status === "not_applicable") return false;
      const verifiedFile = detail.uploadedDocuments.some(
        (document) => document.documentType === requirement.key && document.status === "verified",
      );
      return requirement.status !== "verified" || !verifiedFile;
    }).length;
  }, [detail]);

  async function decide(decision: Decision) {
    if (!detail || busy) return;
    if ((decision === "needs_information" || decision === "rejected") && note.trim().length < 8) {
      toast.error("Add a reason of at least 8 characters.");
      return;
    }
    if (decision === "approved" && pendingDocs > 0) {
      toast.error("Approval is blocked until required documents are uploaded and verified.");
      return;
    }
    setBusy(true);
    try {
      await applyAdminProviderReviewDecision({
        data: { businessId: detail.id, decision, note: note.trim() },
      });
      toast.success("Provider review decision saved and audit logged.");
      await Promise.all([loadQueue(true), loadDetail(detail.id)]);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save the review decision.");
    } finally {
      setBusy(false);
    }
  }

  async function openProviderDocument(documentId: string) {
    const tab = window.open("about:blank", "_blank");
    try {
      const result = await getAdminProviderDocumentDownloadUrl({ data: { documentId } });
      if (tab) {
        tab.opener = null;
        tab.location.href = result.signedUrl;
      } else {
        window.location.assign(result.signedUrl);
      }
    } catch (cause) {
      tab?.close();
      toast.error(cause instanceof Error ? cause.message : "Could not create a secure document link.");
    }
  }

  async function decideProviderDocument(documentId: string, decision: "verified" | "rejected") {
    if (!detail || documentBusyId) return;
    if (decision === "rejected" && note.trim().length < 8) {
      toast.error("Add a review reason of at least 8 characters before rejecting this document.");
      return;
    }
    setDocumentBusyId(documentId);
    try {
      await reviewAdminProviderDocument({
        data: { documentId, decision, note: note.trim() },
      });
      toast.success(decision === "verified"
        ? "Document verified and audit logged."
        : "Document rejected and audit logged.");
      await Promise.all([loadQueue(true), loadDetail(detail.id)]);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save the document review.");
    } finally {
      setDocumentBusyId(null);
    }
  }

  async function decideProviderItem(
    itemId: string,
    itemType: "service" | "asset" | "operator",
    decision: Decision,
  ) {
    if (!detail || itemBusyId) return;
    if ((decision === "needs_information" || decision === "rejected") && note.trim().length < 8) {
      toast.error("Add a reason of at least 8 characters.");
      return;
    }
    setItemBusyId(itemType + ":" + itemId);
    try {
      const data = { itemId, decision, note: note.trim() };
      if (itemType === "service") await reviewAdminProviderService({ data });
      else if (itemType === "asset") await reviewAdminProviderAsset({ data });
      else await reviewAdminProviderOperator({ data });
      toast.success((itemType === "service" ? "Service" : "Machine") + " review decision saved and audit logged.");
      await Promise.all([loadQueue(true), loadDetail(detail.id)]);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save the item review decision.");
    } finally {
      setItemBusyId(null);
    }
  }

  const submitted = queue.filter((item) => item.verificationStatus === "submitted").length;
  const reviewing = queue.filter((item) => item.verificationStatus === "under_review").length;
  const information = queue.filter((item) => item.verificationStatus === "needs_information").length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-field">MakeService administration</p>
          <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">Provider verification</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Review submitted business applications, services, machinery and verification requirements. Every decision is recorded in the admin audit log.</p>
        </div>
        <Button variant="secondary" onClick={() => void loadQueue()} disabled={queueLoading}>
          <RefreshCw className={cn("mr-2 size-4", queueLoading && "animate-spin")} />Refresh queue
        </Button>
      </header>

      <section className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryMetric label="New submissions" value={submitted} icon={FileText} />
        <SummaryMetric label="Under review" value={reviewing} icon={Clock3} />
        <SummaryMetric label="Need information" value={information} icon={AlertCircle} />
      </section>

      {error && (
        <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {error}
          {error.includes("Administrator access") && <p className="mt-2 text-xs">An administrator role must be assigned through a controlled database operation. It cannot be granted from this page.</p>}
          <button type="button" className="ml-2 font-semibold underline" onClick={() => void loadQueue()}>Retry</button>
        </div>
      )}

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="min-w-0 rounded-3xl border border-line bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold">Review queue</h2>
            <span className="rounded-full bg-paper px-2.5 py-1 text-xs font-semibold">{queue.length} pending</span>
          </div>
          {queueLoading ? (
            <p className="py-8 text-sm text-muted">Loading applications…</p>
          ) : !queue.length ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="mx-auto size-8 text-emerald-700" />
              <p className="mt-3 font-semibold">No applications awaiting review</p>
              <p className="mt-1 text-sm text-muted">New provider submissions will appear here.</p>
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              {queue.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  selected={selectedId === item.id}
                  onClick={() => void loadDetail(item.id)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="min-w-0">
          {!selectedId && (
            <div className="rounded-3xl border border-dashed border-line bg-card p-8 text-center">
              <ShieldCheck className="mx-auto size-8 text-muted" />
              <h2 className="mt-3 font-display text-xl font-bold">Select an application</h2>
              <p className="mt-1 text-sm text-muted">Business details, machine registrations and document status will appear here.</p>
            </div>
          )}
          {detailLoading && <div className="rounded-3xl border border-line bg-card p-8 text-sm text-muted">Loading application details…</div>}
          {detail && selectedId === detail.id && (
            <ReviewDetail
              detail={detail}
              note={note}
              onNoteChange={setNote}
              busy={busy}
              pendingDocs={pendingDocs}
              documentBusyId={documentBusyId}
              itemBusyId={itemBusyId}
              onOpenDocument={(documentId) => void openProviderDocument(documentId)}
              onDocumentDecision={(documentId, decision) => void decideProviderDocument(documentId, decision)}
              onItemDecision={(itemId, itemType, decision) => void decideProviderItem(itemId, itemType, decision)}
              onDecision={(decision) => void decide(decision)}
              onBack={() => { setSelectedId(null); setDetail(null); }}
            />
          )}
        </section>
      </div>

      <p className="mt-6 rounded-2xl bg-paper p-4 text-xs leading-5 text-muted">
        Security boundary: this page cannot grant administrator roles. Approval remains locked until every required checklist item has an actual verified document record. File paths and storage keys never reach the browser; document links are created only after a server-side administrator check and expire after five minutes.
      </p>
    </div>
  );
}

function SummaryMetric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Activity }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-3 sm:p-4">
      <Icon className="size-4 text-muted" />
      <p className="mt-2 font-display text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-[11px] leading-4 text-muted sm:text-xs">{label}</p>
    </div>
  );
}

function QueueCard({ item, selected, onClick }: { item: QueueItem; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("w-full rounded-2xl border p-3 text-left transition", selected ? "border-ink bg-paper" : "border-line hover:border-ink")}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-semibold">{item.tradeName}</span>
        <span className={cn("shrink-0 rounded-full px-2 py-1 text-[10px] font-bold", statusTone(item.verificationStatus))}>{statusLabel(item.verificationStatus)}</span>
      </div>
      <p className="mt-1 text-xs text-muted">{item.legalName}</p>
      <p className="mt-2 text-xs text-muted">{item.ownerFullName} · {item.city ?? item.district}, {item.state}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted">
        <span>{item.serviceCount} service(s)</span>
        <span>·</span>
        <span>{item.assetCount} machine(s)</span>
        <span>·</span>
        <span className={item.pendingRequiredDocumentCount ? "font-semibold text-amber-800" : "font-semibold text-emerald-800"}>{item.pendingRequiredDocumentCount} required document(s) pending</span>
      </div>
    </button>
  );
}

function ReviewDetail({
  detail, note, onNoteChange, busy, pendingDocs, documentBusyId, itemBusyId,
  onOpenDocument, onDocumentDecision, onItemDecision, onDecision, onBack,
}: {
  detail: ApplicationDetail;
  note: string;
  onNoteChange: (value: string) => void;
  busy: boolean;
  pendingDocs: number;
  documentBusyId: string | null;
  itemBusyId: string | null;
  onOpenDocument: (documentId: string) => void;
  onDocumentDecision: (documentId: string, decision: "verified" | "rejected") => void;
  onItemDecision: (itemId: string, itemType: "service" | "asset" | "operator", decision: Decision) => void;
  onDecision: (decision: Decision) => void;
  onBack: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-3xl border border-line bg-card">
      <header className="border-b border-line p-5">
        <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"><ArrowLeft className="size-3.5" />Back to queue</button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-field">Provider application</p>
            <h2 className="mt-1 font-display text-2xl font-bold">{detail.tradeName}</h2>
            <p className="mt-1 text-sm text-muted">{detail.legalName} · {detail.businessType.replaceAll("_", " ")}</p>
          </div>
          <span className={cn("rounded-full px-3 py-1.5 text-xs font-bold", statusTone(detail.verificationStatus))}>{statusLabel(detail.verificationStatus)}</span>
        </div>
      </header>

      <section className="grid gap-3 border-b border-line p-5 sm:grid-cols-2">
        <DetailField label="Owner" value={detail.ownerFullName} />
        <DetailField label="Business representative" value={detail.authorisedRepresentative ? "Authorised representative" : "Owner"} />
        <DetailField label="Address" value={detail.address} />
        <DetailField label="Area / city" value={[detail.area, detail.city ?? detail.district].filter(Boolean).join(", ")} />
        <DetailField label="District / state" value={detail.district + ", " + detail.state} />
        <DetailField label="Pincode" value={detail.pincode} />
        <DetailField label="GST" value={statusLabel(detail.gstStatus)} />
        <DetailField label="Turnover declaration" value={statusLabel(detail.aggregateTurnoverBand)} />
        <DetailField label="Udyam" value={detail.udyamProvided ? "Declared available" : "Not declared"} />
        <DetailField label="Experience" value={detail.yearsExperience + " years"} />
        <DetailField label="Languages" value={detail.languages.join(", ") || "Not provided"} />
        <DetailField label="Submitted" value={new Date(detail.createdAt).toLocaleString()} />
      </section>

      <section className="border-b border-line p-5">
        <h3 className="font-display text-lg font-bold">Business description</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{detail.bio || "No description provided."}</p>
      </section>

      <section className="border-b border-line p-5">
        <h3 className="font-display text-lg font-bold">Services ({detail.services.length})</h3>
        <div className="mt-3 grid gap-2">
          {detail.services.map((service) => (
            <div key={service.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="font-semibold">{SERVICE_ONBOARDING[service.serviceId]?.label ?? service.serviceId}</span>
                <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", statusTone(service.verificationStatus))}>{statusLabel(service.verificationStatus)}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">{service.selectedTasks.join(" · ")}</p>
              {!!Object.keys(service.specifications).length && <p className="mt-2 text-xs text-muted">{Object.entries(service.specifications).map(([key, value]) => key + ": " + value).join(" · ")}</p>}
              {service.reviewerNote && <p className="mt-2 text-xs text-muted">Reviewer note: {service.reviewerNote}</p>}
              <p className="mt-1 text-[11px] text-muted">{service.isListed ? "Listed" : "Not listed"} · {service.isAvailable ? "Available" : "Paused"}{service.reviewedAt ? " · Reviewed " + new Date(service.reviewedAt).toLocaleString() : ""}</p>
              {["draft", "submitted", "under_review", "needs_information"].includes(service.verificationStatus) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={itemBusyId !== null || !["draft", "submitted", "needs_information"].includes(service.verificationStatus)} onClick={() => onItemDecision(service.id, "service", "under_review")}>Start / resume review</Button>
                  <Button size="sm" variant="secondary" disabled={itemBusyId !== null || !["submitted", "under_review"].includes(service.verificationStatus) || note.trim().length < 8} onClick={() => onItemDecision(service.id, "service", "needs_information")}>Request information</Button>
                  <Button size="sm" variant="danger" disabled={itemBusyId !== null || note.trim().length < 8} onClick={() => onItemDecision(service.id, "service", "rejected")}>Reject service</Button>
                  <Button size="sm" disabled={itemBusyId !== null || !["submitted", "under_review"].includes(service.verificationStatus) || detail.verificationStatus !== "approved"} onClick={() => onItemDecision(service.id, "service", "approved")}>Approve service</Button>
                </div>
              )}
              {itemBusyId === "service:" + service.id && <p className="mt-2 text-xs text-muted">Saving service review…</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-line p-5">
        <h3 className="font-display text-lg font-bold">Machinery & equipment ({detail.assets.length})</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {detail.assets.map((asset) => (
            <div key={asset.id} className="rounded-xl border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-semibold">{asset.make} {asset.model}</p><p className="mt-1 text-xs text-muted">{asset.assetType}{asset.yearOfManufacture ? " · " + asset.yearOfManufacture : ""}</p></div>
                <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", statusTone(asset.verificationStatus))}>{statusLabel(asset.verificationStatus)}</span>
              </div>
              <p className="mt-2 text-xs text-muted">{statusLabel(asset.ownership)} · {statusLabel(asset.roadUse)}</p>
              <p className="mt-1 text-xs text-muted">For: {asset.serviceIds.map((id) => SERVICE_ONBOARDING[id]?.label ?? id).join(", ")}</p>
              {asset.registrationLast4 && <p className="mt-1 text-xs text-muted">Registration ending {asset.registrationLast4}</p>}
              {asset.reviewerNote && <p className="mt-2 text-xs text-muted">Reviewer note: {asset.reviewerNote}</p>}
              <p className="mt-1 text-[11px] text-muted">{asset.isAvailable ? "Available" : "Unavailable"}{asset.reviewedAt ? " · Reviewed " + new Date(asset.reviewedAt).toLocaleString() : ""}</p>
              {["draft", "submitted", "under_review", "needs_information"].includes(asset.verificationStatus) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={itemBusyId !== null || !["draft", "submitted", "needs_information"].includes(asset.verificationStatus)} onClick={() => onItemDecision(asset.id, "asset", "under_review")}>Start / resume review</Button>
                  <Button size="sm" variant="secondary" disabled={itemBusyId !== null || !["submitted", "under_review"].includes(asset.verificationStatus) || note.trim().length < 8} onClick={() => onItemDecision(asset.id, "asset", "needs_information")}>Request information</Button>
                  <Button size="sm" variant="danger" disabled={itemBusyId !== null || note.trim().length < 8} onClick={() => onItemDecision(asset.id, "asset", "rejected")}>Reject machine</Button>
                  <Button size="sm" disabled={itemBusyId !== null || !["submitted", "under_review"].includes(asset.verificationStatus) || detail.verificationStatus !== "approved"} onClick={() => onItemDecision(asset.id, "asset", "approved")}>Approve machine</Button>
                </div>
              )}
              {itemBusyId === "asset:" + asset.id && <p className="mt-2 text-xs text-muted">Saving machine review…</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-line p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg font-bold">Operators & drivers ({detail.operators.length})</h3>
          <span className="text-xs text-muted">Each operator is reviewed separately</span>
        </div>
        {detail.operators.length ? (
          <div className="mt-3 grid gap-3">
            {detail.operators.map((operator) => {
              const assignedAssets = detail.assets.filter((asset) => operator.assetIds.includes(asset.id));
              const operatorFiles = detail.uploadedDocuments.filter((file) => file.operatorId === operator.id);
              return (
                <div key={operator.id} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{operator.fullName}</p>
                      <p className="mt-1 text-xs text-muted">{operator.roleTitle} · {operator.experienceYears} years' experience{operator.phoneLast4 ? " · phone ending " + operator.phoneLast4 : ""}</p>
                    </div>
                    <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", statusTone(operator.verificationStatus))}>{statusLabel(operator.verificationStatus)}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Assigned machines: {assignedAssets.map((asset) => asset.make + " " + asset.model).join(", ") || "No machine assigned"}
                  </p>
                  {operator.reviewerNote && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Reviewer note: {operator.reviewerNote}</p>}
                  {operatorFiles.length > 0 && (
                    <div className="mt-3 grid gap-2">
                      {operatorFiles.map((file) => (
                        <div key={file.id} className="rounded-lg bg-paper p-3">
                          <p className="text-xs font-semibold">{file.documentType.replaceAll("_", " ")} · {file.originalFilename}</p>
                          <p className="mt-1 text-[11px] text-muted">{statusLabel(file.status)} · {Math.round(file.sizeBytes / 1024)} KB</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button size="sm" variant="secondary" onClick={() => onOpenDocument(file.id)}>Open secure download</Button>
                            {file.status === "uploaded" && (
                              <>
                                <Button size="sm" disabled={documentBusyId !== null} onClick={() => onDocumentDecision(file.id, "verified")}>Verify document</Button>
                                <Button size="sm" variant="danger" disabled={documentBusyId !== null} onClick={() => onDocumentDecision(file.id, "rejected")}>Reject document</Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {["draft", "submitted", "under_review", "needs_information"].includes(operator.verificationStatus) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" disabled={itemBusyId !== null || !["draft", "submitted", "needs_information"].includes(operator.verificationStatus)} onClick={() => onItemDecision(operator.id, "operator", "under_review")}>Start / resume review</Button>
                      <Button size="sm" variant="secondary" disabled={itemBusyId !== null || !["submitted", "under_review"].includes(operator.verificationStatus) || note.trim().length < 8} onClick={() => onItemDecision(operator.id, "operator", "needs_information")}>Request information</Button>
                      <Button size="sm" variant="danger" disabled={itemBusyId !== null || note.trim().length < 8} onClick={() => onItemDecision(operator.id, "operator", "rejected")}>Reject operator</Button>
                      <Button size="sm" disabled={itemBusyId !== null || !["submitted", "under_review"].includes(operator.verificationStatus) || detail.verificationStatus !== "approved"} onClick={() => onItemDecision(operator.id, "operator", "approved")}>Approve operator</Button>
                    </div>
                  )}
                  {itemBusyId === "operator:" + operator.id && <p className="mt-2 text-xs text-muted">Saving operator review…</p>}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-paper p-3 text-sm text-muted">No operator records have been submitted. Ask the provider to assign at least one named operator to each machine in the provider desk.</p>
        )}
      </section>

      <section className="border-b border-line p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg font-bold">Required verification documents</h3>
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", pendingDocs ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800")}>{pendingDocs} pending</span>
        </div>
        <div className="mt-3 grid gap-2">
          {detail.documentRequirements.map((requirement) => {
            const uploaded = detail.uploadedDocuments.filter((file) => file.documentType === requirement.key);
            const verified = uploaded.some((file) => file.status === "verified") && requirement.status === "verified";
            return (
              <div key={requirement.key} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{requirement.label}{requirement.requiredForApproval ? " *" : ""}</span>
                  <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", statusTone(requirement.status))}>{verified ? "Verified" : statusLabel(requirement.status)}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted">{requirement.description}</p>
                <p className="mt-1 text-[11px] text-muted">{requirement.secureOnly ? "Secure KYC verification required" : "Document evidence required"}{requirement.jobSpecific ? " · Job-specific" : ""}</p>
                {uploaded.map((file) => (
                  <div key={file.id} className="mt-3 rounded-lg bg-paper p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <FileCheck2 className="size-3.5" />
                      <span className="font-semibold text-ink">{file.originalFilename}</span>
                      <span>· {statusLabel(file.status)} · {Math.round(file.sizeBytes / 1024)} KB</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      {file.providerServiceId
                        ? "Service: " + (SERVICE_ONBOARDING[detail.services.find((item) => item.id === file.providerServiceId)?.serviceId ?? ""]?.label ?? "Registered service")
                        : file.assetId
                          ? "Machine: " + (() => { const asset = detail.assets.find((item) => item.id === file.assetId); return asset ? asset.make + " " + asset.model : "Registered machine"; })()
                          : file.operatorId
                            ? "Operator-specific document"
                            : "Business-level document"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => onOpenDocument(file.id)}>
                        Open secure download
                      </Button>
                      {file.status === "uploaded" && (
                        <>
                          <Button size="sm" disabled={documentBusyId !== null} onClick={() => onDocumentDecision(file.id, "verified")}>
                            Verify document
                          </Button>
                          <Button size="sm" variant="danger" disabled={documentBusyId !== null} onClick={() => onDocumentDecision(file.id, "rejected")}>
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          {!detail.documentRequirements.length && <p className="text-sm text-muted">No document checklist recorded.</p>}
        </div>
        <p className="mt-3 rounded-xl bg-paper p-3 text-xs leading-5 text-muted">Open links are five-minute, forced-download URLs. The file is malware-scanned before it enters this queue. Use the review note below when rejecting a document; approval remains blocked until all required evidence is verified.</p>
      </section>

      <section className="border-b border-line p-5">
        <h3 className="font-display text-lg font-bold">Review history</h3>
        {detail.audit.length ? (
          <div className="mt-3 grid gap-3">
            {detail.audit.map((event) => (
              <div key={event.id} className="border-l-2 border-line pl-3">
                <p className="text-sm font-semibold">{event.action.replaceAll("_", " ")}</p>
                {event.reason && <p className="mt-1 text-xs text-muted">{event.reason}</p>}
                <p className="mt-1 text-[11px] text-muted">{event.adminName} · {new Date(event.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        ) : <p className="mt-2 text-sm text-muted">No previous review decisions.</p>}
      </section>

      <section className="p-5">
        <label className="grid gap-1 text-sm font-semibold">
          Review note / reason
          <textarea value={note} onChange={(event) => onNoteChange(event.target.value)} maxLength={2000} rows={3} placeholder="Explain what needs correction, why the application is rejected, or add an internal review note." className="rounded-xl border border-line bg-card p-3 text-sm font-normal outline-none focus:border-ink" />
        </label>
        <p className="mt-2 text-xs text-muted">A note of at least 8 characters is required for information requests and rejection. All decisions are audit logged.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button variant="secondary" disabled={busy || !["submitted", "needs_information"].includes(detail.verificationStatus)} onClick={() => onDecision("under_review")}>
            <Clock3 className="mr-2 size-4" />Start / resume review
          </Button>
          <Button variant="secondary" disabled={busy || !["submitted", "under_review"].includes(detail.verificationStatus) || note.trim().length < 8} onClick={() => onDecision("needs_information")}>
            <AlertCircle className="mr-2 size-4" />Request information
          </Button>
          <Button variant="danger" disabled={busy || !["submitted", "under_review", "needs_information"].includes(detail.verificationStatus) || note.trim().length < 8} onClick={() => onDecision("rejected")}>
            <XCircle className="mr-2 size-4" />Reject application
          </Button>
          <Button disabled={busy || !["submitted", "under_review"].includes(detail.verificationStatus) || pendingDocs > 0} onClick={() => onDecision("approved")}>
            <CheckCircle2 className="mr-2 size-4" />Approve application
          </Button>
        </div>
        {pendingDocs > 0 && <p className="mt-3 text-xs font-semibold leading-5 text-amber-900">Approval locked: {pendingDocs} required item(s) do not yet have both a verified checklist status and a verified uploaded document.</p>}
        {busy && <p className="mt-3 text-xs text-muted">Saving review decision…</p>}
      </section>
    </article>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-1 break-words text-sm">{value}</p></div>;
}
