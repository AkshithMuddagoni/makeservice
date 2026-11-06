export type FieldlyNotificationRouteTarget = {
  notificationType: string;
  targetType: "request" | "booking" | "provider_application";
  targetId: string;
};

/**
 * Route provider request-arrival events to the provider inbox. The request
 * detail page is deliberately customer-owned and must not receive provider
 * notifications. Quote notifications belong to the customer request page.
 */
export function getFieldlyNotificationHref(item: FieldlyNotificationRouteTarget): string {
  if (item.targetType === "booking") return "/bookings/" + item.targetId;
  if (item.notificationType === "request_received") return "/desk";
  if (item.targetType === "request") return "/requests/" + item.targetId;
  return "/desk";
}
