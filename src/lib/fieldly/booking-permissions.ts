export type BookingDetailPermissions = {
  isCustomer: boolean;
  isProvider: boolean;
  isAssignedOperator: boolean;
};

/**
 * The server only sets isAssignedOperator after matching the signed-in user
 * to the approved operator assigned to this booking. The UI must honor that
 * permission in the final render guard as well as during polling and GPS.
 */
export function canViewBookingDetail(permissions: BookingDetailPermissions): boolean {
  return permissions.isCustomer || permissions.isProvider || permissions.isAssignedOperator;
}
