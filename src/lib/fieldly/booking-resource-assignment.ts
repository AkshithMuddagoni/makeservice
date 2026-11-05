/**
 * A machine/operator is reserved while a booking is confirmed, travelling,
 * arrived, or being worked. A disputed booking holds resources until the
 * dispute itself reaches a terminal outcome, even though its booking status
 * remains "disputed" after the case closes.
 *
 * service_completed releases physical resources while payment is pending.
 * Keep the SQL predicates in marketplace-queries.ts, repository.server.ts,
 * and migration 0018 in sync with this lifecycle.
 */
export const BOOKING_RESOURCE_RESERVED_STATUSES = [
  "confirmed",
  "on_the_way",
  "arrived",
  "service_started",
] as const;

export const CLOSED_DISPUTE_STATUSES = [
  "resolved_customer",
  "resolved_provider",
  "closed_no_action",
] as const;

export type BookingResourceReservedStatus =
  (typeof BOOKING_RESOURCE_RESERVED_STATUSES)[number];

const RESERVED_STATUS_SET: ReadonlySet<string> = new Set(
  BOOKING_RESOURCE_RESERVED_STATUSES,
);
const CLOSED_DISPUTE_STATUS_SET: ReadonlySet<string> = new Set(
  CLOSED_DISPUTE_STATUSES,
);

export function isBookingResourceReserved(
  status: string,
  disputeStatus: string | null = null,
): boolean {
  if (RESERVED_STATUS_SET.has(status)) return true;
  if (status !== "disputed") return false;
  return disputeStatus === null || !CLOSED_DISPUTE_STATUS_SET.has(disputeStatus);
}
