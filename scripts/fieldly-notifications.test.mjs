import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationFiles = [
  "migrations/auth/0001_auth.sql",
  "migrations/auth/0002_phone_number_fields.sql",
  "migrations/auth/0003_rate_limit.sql",
  "migrations/auth/0004_lock_down_auth_data_access.sql",
  "migrations/fieldly/0001_fieldly_core.sql",
  "migrations/fieldly/0002_lock_down_browser_data_access.sql",
  "migrations/fieldly/0005_provider_onboarding.sql",
  "migrations/fieldly/0006_lock_down_migration_ledger.sql",
  "migrations/fieldly/0007_index_foreign_keys.sql",
  "migrations/fieldly/0008_create_private_documents_bucket.sql",
  "migrations/fieldly/0009_booking_start_code_issuance.sql",
  "migrations/fieldly/0010_booking_start_code_issue_limit.sql",
  "migrations/fieldly/0011_provider_document_upload_sessions.sql",
  "migrations/fieldly/0012_provider_operator_roster.sql",
  "migrations/fieldly/0013_index_provider_document_upload_session_foreign_keys.sql",
  "migrations/fieldly/0014_index_provider_operator_asset_foreign_keys.sql",
  "migrations/fieldly/0015_booking_dispute_resolution.sql",
  "migrations/fieldly/0016_notifications_and_location_retention.sql",
  "migrations/fieldly/0017_index_bookings_dispute_resolved_by.sql",
  "migrations/fieldly/0018_booking_resource_assignment.sql",
  "migrations/fieldly/0019_index_booking_assigned_operator_asset_fk.sql",
  "migrations/fieldly/0021_provider_document_upload_cleanup.sql",
  "migrations/fieldly/0022_notify_customer_of_quote_revisions.sql",
];

async function createMigratedDatabase() {
  const db = new PGlite();
  await db.waitReady;
  try {
    for (const migration of migrationFiles) {
      await db.exec(await readFile(join(root, migration), "utf8"));
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

async function seedNotificationScenario(db) {
  await db.query(
    "insert into public.\"user\" (id, name, email, \"emailVerified\") values " +
    "('customer-test', 'Test Customer', 'customer@example.test', false), " +
    "('provider-test', 'Test Provider', 'provider@example.test', false)",
  );

  const business = await db.query(
    "insert into public.provider_businesses " +
    "(owner_user_id, legal_name, trading_name, business_type, address_line, district, city, state, pincode) " +
    "values ('provider-test', 'Example Provider Services', 'Example Provider', " +
    "'sole_proprietorship', '1 Test Road', 'Warangal', 'Warangal', 'Telangana', '506001') " +
    "returning id::text as id",
  );
  const businessId = business.rows[0].id;

  // The insert and subsequent status transition must each create one
  // provider-application event; a profile-only edit must not create another.
  await db.query(
    "update public.provider_businesses set verification_status = 'submitted', " +
    "updated_at = updated_at + interval '1 second' where id = $1::uuid",
    [businessId],
  );

  const request = await db.query(
    "insert into public.job_requests " +
    "(customer_user_id, service_id, site_label, site_address, city, state, latitude, longitude, details_consent_at) " +
    "values ('customer-test', 'borewell_drilling', 'Test Site', '2 Test Avenue', " +
    "'Warangal', 'Telangana', 17.9689, 79.5941, now()) returning id::text as id",
  );
  const requestId = request.rows[0].id;

  await db.query(
    "insert into public.job_request_targets (request_id, business_id) values ($1::uuid, $2::uuid)",
    [requestId, businessId],
  );

  const quote = await db.query(
    "insert into public.provider_quotes (request_id, business_id, amount_paise, note) " +
    "values ($1::uuid, $2::uuid, 1250000, 'Includes mobilisation and drilling') " +
    "returning id::text as id",
    [requestId, businessId],
  );
  const quoteId = quote.rows[0].id;

  // The quote trigger fires for INSERT and UPDATE. Its event key must make
  // the update idempotent rather than generating a second quote notification.
  await db.query(
    "update public.provider_quotes set note = 'Updated quote detail', " +
    "updated_at = updated_at + interval '1 second' where id = $1::uuid",
    [quoteId],
  );

  // Timestamp-only writes must not create another notification for the same quote version.
  await db.query(
    "update public.provider_quotes set updated_at = updated_at + interval '1 second' " +
    "where id = $1::uuid",
    [quoteId],
  );

  const booking = await db.query(
    "insert into public.bookings " +
    "(public_reference, request_id, quote_id, customer_user_id, business_id, service_id, amount_paise, site_snapshot) " +
    "values ('MS-NOTIFY-TEST-001', $1::uuid, $2::uuid, 'customer-test', $3::uuid, " +
    "'borewell_drilling', 1250000, '{\"siteLabel\":\"Test Site\",\"city\":\"Warangal\"}'::jsonb) " +
    "returning id::text as id",
    [requestId, quoteId, businessId],
  );
  const bookingId = booking.rows[0].id;

  // Acceptance is not another customer-facing quote revision.
  await db.query(
    "update public.provider_quotes set status = 'accepted', " +
    "updated_at = updated_at + interval '1 second' where id = $1::uuid",
    [quoteId],
  );

  await db.query("update public.bookings set status = 'on_the_way' where id = $1::uuid", [bookingId]);

  // Opening a dispute changes booking status and dispute status together.
  // The dispute trigger must avoid duplicating the booking-status event.
  await db.query(
    "update public.bookings set status = 'disputed', dispute_status = 'open' where id = $1::uuid",
    [bookingId],
  );
  await db.query(
    "update public.bookings set dispute_status = 'under_review' where id = $1::uuid",
    [bookingId],
  );

  await db.query(
    "insert into public.booking_messages (booking_id, sender_user_id, message_text) " +
    "values ($1::uuid, 'customer-test', 'Please confirm the arrival time.')",
    [bookingId],
  );
  await db.query(
    "insert into public.booking_messages (booking_id, sender_user_id, message_text) " +
    "values ($1::uuid, 'provider-test', 'The operator is on the way.')",
    [bookingId],
  );

  await db.query(
    "update public.provider_businesses set area = 'Test Area', " +
    "updated_at = updated_at + interval '1 second' where id = $1::uuid",
    [businessId],
  );

  return { requestId, bookingId };
}

test("notification triggers target correct participants and deduplicate event updates", async () => {
  const db = await createMigratedDatabase();
  try {
    const { requestId, bookingId } = await seedNotificationScenario(db);
    const result = await db.query(
      "select notification_type, recipient_user_id, count(*)::int as count " +
      "from public.fieldly_notifications group by notification_type, recipient_user_id " +
      "order by notification_type, recipient_user_id",
    );
    const actual = new Map(
      result.rows.map((row) => [
        row.notification_type + ":" + row.recipient_user_id,
        Number(row.count),
      ]),
    );
    const expected = new Map([
      ["provider_application:provider-test", 2],
      ["request_received:provider-test", 1],
      ["quote_received:customer-test", 2],
      ["booking_created:customer-test", 1],
      ["booking_created:provider-test", 1],
      ["booking_status:customer-test", 3],
      ["booking_status:provider-test", 3],
      ["booking_message:customer-test", 1],
      ["booking_message:provider-test", 1],
    ]);
    assert.deepEqual([...actual.entries()].sort(), [...expected.entries()].sort());

    const quoteNotifications = await db.query(
      "select title from public.fieldly_notifications " +
      "where notification_type = 'quote_received' order by title",
    );
    assert.deepEqual(
      quoteNotifications.rows.map((row) => row.title),
      ["A provider sent you a quote", "A provider updated their quote"],
    );

    const duplicates = await db.query(
      "select event_key from public.fieldly_notifications " +
      "group by event_key having count(*) > 1",
    );
    assert.equal(duplicates.rows.length, 0, "notification event keys must be unique");

    const requestEvents = await db.query(
      "select recipient_user_id, target_type, target_id::text as target_id " +
      "from public.fieldly_notifications where notification_type = 'request_received'",
    );
    assert.equal(requestEvents.rows.length, 1);
    assert.equal(requestEvents.rows[0].recipient_user_id, "provider-test");
    assert.equal(requestEvents.rows[0].target_type, "request");
    assert.equal(requestEvents.rows[0].target_id, requestId);

    const bookingEvents = await db.query(
      "select recipient_user_id, target_type, target_id::text as target_id " +
      "from public.fieldly_notifications where target_type = 'booking'",
    );
    assert.equal(bookingEvents.rows.length, 10);
    for (const row of bookingEvents.rows) {
      assert.ok(["customer-test", "provider-test"].includes(row.recipient_user_id));
      assert.equal(row.target_id, bookingId);
    }
  } finally {
    await db.close();
  }
});

test("booking-message events notify only the other participant", async () => {
  const db = await createMigratedDatabase();
  try {
    await seedNotificationScenario(db);
    const messages = await db.query(
      "select recipient_user_id, body from public.fieldly_notifications " +
      "where notification_type = 'booking_message'",
    );
    assert.deepEqual(
      messages.rows.map((row) => row.recipient_user_id).sort(),
      ["customer-test", "provider-test"],
    );
    assert.equal(messages.rows.length, 2);
    assert.ok(messages.rows.every((row) => row.body.includes("MS-NOTIFY-TEST-001")));
  } finally {
    await db.close();
  }
});
