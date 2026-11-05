/**
 * A machine/operator is reserved while a booking is confirmed, travelling,
 * arrived, being worked, or under dispute.
 *
 * service_completed releases the physical resources even while payment remains
 * outstanding. A dispute raised after completion reserves them again until the
 * dispute is closed. Keep the matching list in migration 0018 in sync.
 */
export const BOOKING_RESOURCE_RESERVED_STATUSES = [
  "confirmed",
  "on_the_way",
  "arrived",
  "service_started",
  "disputed",
] as const;

export type BookingResourceReservedStatus =
  (typeof BOOKING_RESOURCE_RESERVED_STATUSES)[number];

const RESERVED_STATUS_SET: ReadonlySet<string> = new Set(
  BOOKING_RESOURCE_RESERVED_STATUSES,
);

export function isBookingResourceReserved(status: string): boolean {
  return RESERVED_STATUS_SET.has(status);
}

export const BOOKING_RESOURCE_RESERVED_STATUS_SQL =
  BOOKING_RESOURCE_RESERVED_STATUSES.map((status) => "'" + status + "'").join(", ");
