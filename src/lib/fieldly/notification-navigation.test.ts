import assert from "node:assert/strict";
import { test } from "node:test";
import { getFieldlyNotificationHref } from "./notification-navigation.ts";

test("provider request-arrival notifications open the provider inbox", () => {
  assert.equal(
    getFieldlyNotificationHref({
      notificationType: "request_received",
      targetType: "request",
      targetId: "request-123",
    }),
    "/desk",
  );
});

test("customer quote notifications open the customer-owned request detail", () => {
  assert.equal(
    getFieldlyNotificationHref({
      notificationType: "quote_received",
      targetType: "request",
      targetId: "request-456",
    }),
    "/requests/request-456",
  );
});

test("booking notifications open the booking detail for either participant", () => {
  assert.equal(
    getFieldlyNotificationHref({
      notificationType: "booking_status",
      targetType: "booking",
      targetId: "booking-789",
    }),
    "/bookings/booking-789",
  );
});

test("provider application notifications open the provider desk", () => {
  assert.equal(
    getFieldlyNotificationHref({
      notificationType: "provider_application",
      targetType: "provider_application",
      targetId: "business-012",
    }),
    "/desk",
  );
});
