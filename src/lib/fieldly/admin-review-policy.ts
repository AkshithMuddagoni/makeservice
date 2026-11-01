export type ProviderReviewStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "needs_information"
  | "approved"
  | "rejected"
  | "suspended";

export type AdminReviewDecision =
  | "under_review"
  | "needs_information"
  | "rejected"
  | "approved";

const ALLOWED_DECISIONS: Record<ProviderReviewStatus, readonly AdminReviewDecision[]> = {
  draft: [],
  submitted: ["under_review", "needs_information", "rejected", "approved"],
  under_review: ["needs_information", "rejected", "approved"],
  needs_information: ["under_review", "rejected"],
  approved: [],
  rejected: [],
  suspended: [],
};

/**
 * Pure policy shared by the admin UI tests and the server repository.
 * Approval is deliberately blocked until every required checklist item has
 * a verified or formally not-applicable status. A checklist is not evidence:
 * secure document upload/review must happen before this gate can pass.
 */
export function assertAdminReviewDecisionAllowed(
  currentStatus: ProviderReviewStatus,
  decision: AdminReviewDecision,
  pendingRequiredDocuments: number,
): void {
  if (!ALLOWED_DECISIONS[currentStatus].includes(decision)) {
    throw new Error(`Cannot move a ${currentStatus} application to ${decision}.`);
  }
  if (pendingRequiredDocuments < 0) {
    throw new Error("Pending document count cannot be negative.");
  }
  if (decision === "approved" && pendingRequiredDocuments > 0) {
    throw new Error(
      "Approval is blocked until all required documents are securely uploaded and verified.",
    );
  }
}

/** Request-info and rejection decisions must always carry a review reason. */
export function assertAdminReviewReason(
  decision: AdminReviewDecision,
  note: string,
): void {
  if (
    (decision === "needs_information" || decision === "rejected") &&
    note.trim().length < 8
  ) {
    throw new Error("Add a review reason of at least 8 characters.");
  }
  if (note.length > 2000) {
    throw new Error("Review notes cannot exceed 2,000 characters.");
  }
}
