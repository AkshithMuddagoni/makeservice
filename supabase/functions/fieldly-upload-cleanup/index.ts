import postgres from "postgres";

const BUCKET = "fieldly-private";
const PROVIDER_DOCUMENT_PREFIX = "provider-documents/";
const CRON_SECRET_NAME = "fieldly_provider_upload_cleanup_cron_secret";
const BATCH_SIZE = 100;
const STORAGE_TIMEOUT_MS = 20_000;

type SessionCandidate = {
  id: string;
  storage_bucket: string;
  storage_path: string;
  object_exists: boolean;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function constantTimeEquals(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

function isProviderDocumentPath(value: string): boolean {
  if (!value.startsWith(PROVIDER_DOCUMENT_PREFIX) || value.startsWith("/")) return false;
  if (value.includes("\\") || value.includes("\0")) return false;
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function getStorageSecretKey(): string | null {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, unknown>;
      const defaultKey = keys.default;
      if (typeof defaultKey === "string" && defaultKey.length > 20) return defaultKey;
      const anySecret = Object.values(keys).find((value) => typeof value === "string" && value.length > 20);
      if (typeof anySecret === "string") return anySecret;
    } catch {
      return null;
    }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return legacy && legacy.length > 20 ? legacy : null;
}

async function removeStorageObjects(
  supabaseUrl: string,
  secretKey: string,
  paths: string[],
): Promise<boolean> {
  if (paths.length === 0) return true;
  const base = new URL(supabaseUrl);
  if (base.protocol !== "https:") return false;

  let response: Response;
  try {
    response = await fetch(
      new URL(`/storage/v1/object/${BUCKET}`, base).toString(),
      {
        method: "DELETE",
        headers: {
          apikey: secretKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ prefixes: paths }),
        redirect: "error",
        signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
      },
    );
  } catch {
    return false;
  }
  return response.ok;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const storageSecretKey = getStorageSecretKey();
  if (!databaseUrl || !supabaseUrl || !storageSecretKey) {
    return json({ error: "cleanup_not_configured" }, 503);
  }

  let db: ReturnType<typeof postgres> | null = null;
  try {
    db = postgres(databaseUrl, {
      max: 1,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 5,
    });

    // The only caller is the Supabase pg_cron job. Its high-entropy token is stored
    // in Vault and compared here; the endpoint does not accept user credentials.
    const secrets = await db`
      select decrypted_secret
      from vault.decrypted_secrets
      where name = ${CRON_SECRET_NAME}
      limit 1
    `;
    const expectedSecret = secrets[0]?.decrypted_secret;
    const suppliedSecret = request.headers.get("x-fieldly-cleanup-secret") ?? "";
    if (
      typeof expectedSecret !== "string" ||
      expectedSecret.length < 32 ||
      !constantTimeEquals(suppliedSecret, expectedSecret)
    ) {
      return json({ error: "unauthorized" }, 401);
    }

    // Serialize cleanup runs across concurrent requests. Keep the advisory
    // transaction lock while Storage deletion and database marking are in flight.
    const summary = await db.begin(async (tx) => {
      const lockRows = await tx`
        select pg_try_advisory_xact_lock(hashtext('fieldly-provider-upload-cleanup')) as locked
      `;
      if (!lockRows[0]?.locked) {
        return { busy: true as const };
      }

      const sessions = await tx<SessionCandidate[]>`
        select
          s.id::text as id,
          s.storage_bucket,
          s.storage_path,
          exists (
            select 1
            from storage.objects o
            where o.bucket_id = s.storage_bucket
              and o.name = s.storage_path
              and o.archived_at is null
              and coalesce(o.is_delete_marker, false) = false
          ) as object_exists
        from public.provider_document_upload_sessions s
        where s.status in ('pending', 'expired', 'failed')
          and s.expires_at <= now()
          and s.storage_cleanup_completed_at is null
          and s.storage_cleanup_attempts < 10
          and not exists (
            select 1
            from public.provider_documents d
            where d.storage_bucket = s.storage_bucket
              and d.storage_path = s.storage_path
          )
        order by s.expires_at asc
        limit ${BATCH_SIZE}
        for update of s skip locked
      `;

      const validSessions = sessions.filter(
        (session) =>
          session.storage_bucket === BUCKET &&
          isProviderDocumentPath(session.storage_path),
      );
      const invalidSessionIds = sessions
        .filter((session) => !validSessions.includes(session))
        .map((session) => session.id);

      if (invalidSessionIds.length > 0) {
        await tx`
          update public.provider_document_upload_sessions
          set storage_cleanup_attempts = least(storage_cleanup_attempts + 1, 10),
              storage_cleanup_last_attempt_at = now()
          where id::text = any(${tx.array(invalidSessionIds)})
            and storage_cleanup_completed_at is null
        `;
      }

      const retryLimitRows = await tx<{ count: number }[]>`
        select count(*)::int as count
        from public.provider_document_upload_sessions s
        where s.storage_bucket = ${BUCKET}
          and s.status in ('pending', 'expired', 'failed')
          and s.expires_at <= now()
          and s.storage_cleanup_completed_at is null
          and s.storage_cleanup_attempts >= 10
          and not exists (
            select 1
            from public.provider_documents d
            where d.storage_bucket = s.storage_bucket
              and d.storage_path = s.storage_path
          )
      `;

      const missingObjectIds = validSessions
        .filter((session) => !session.object_exists)
        .map((session) => session.id);
      if (missingObjectIds.length > 0) {
        await tx`
          update public.provider_document_upload_sessions
          set status = case when status = 'pending' then 'expired' else status end,
              storage_cleanup_completed_at = now(),
              storage_cleanup_last_attempt_at = now()
          where id::text = any(${tx.array(missingObjectIds)})
            and storage_cleanup_completed_at is null
        `;
      }

      const sessionPaths = validSessions
        .filter((session) => session.object_exists)
        .map((session) => session.storage_path);
      const orphanLimit = Math.max(0, BATCH_SIZE - sessionPaths.length);
      const orphans = orphanLimit > 0
        ? await tx<{ storage_path: string }[]>`
            select o.name as storage_path
            from storage.objects o
            where o.bucket_id = ${BUCKET}
              and o.name like ${PROVIDER_DOCUMENT_PREFIX + "%"}
              and o.created_at <= now() - interval '24 hours'
              and o.archived_at is null
              and coalesce(o.is_delete_marker, false) = false
              and not exists (
                select 1 from public.provider_documents d
                where d.storage_bucket = o.bucket_id
                  and d.storage_path = o.name
              )
              and not exists (
                select 1 from public.provider_document_upload_sessions s
                where s.storage_bucket = o.bucket_id
                  and s.storage_path = o.name
              )
            order by o.created_at asc
            limit ${orphanLimit}
          `
        : [];

      const allPaths = [...new Set([...sessionPaths, ...orphans.map((row) => row.storage_path)])]
        .filter(isProviderDocumentPath)
        .slice(0, BATCH_SIZE);
      const storageRemoved = await removeStorageObjects(supabaseUrl, storageSecretKey, allPaths);

      const sessionIdsForBatch = validSessions
        .filter((session) => session.object_exists && allPaths.includes(session.storage_path))
        .map((session) => session.id);

      if (sessionIdsForBatch.length > 0) {
        if (storageRemoved) {
          await tx`
            update public.provider_document_upload_sessions
            set status = case when status = 'pending' then 'expired' else status end,
                storage_cleanup_attempts = least(storage_cleanup_attempts + 1, 10),
                storage_cleanup_last_attempt_at = now(),
                storage_cleanup_completed_at = now()
            where id::text = any(${tx.array(sessionIdsForBatch)})
              and storage_cleanup_completed_at is null
          `;
        } else {
          await tx`
            update public.provider_document_upload_sessions
            set status = case when status = 'pending' then 'expired' else status end,
                storage_cleanup_attempts = least(storage_cleanup_attempts + 1, 10),
                storage_cleanup_last_attempt_at = now()
            where id::text = any(${tx.array(sessionIdsForBatch)})
              and storage_cleanup_completed_at is null
          `;
        }
      }

      return {
        busy: false as const,
        success: storageRemoved,
        expiredSessionCandidates: sessions.length,
        sessionsAlreadyMissingObjects: missingObjectIds.length,
        sessionObjectsRemoved: storageRemoved ? sessionIdsForBatch.length : 0,
        orphanObjectsRemoved: storageRemoved
          ? Math.max(0, allPaths.length - sessionIdsForBatch.length)
          : 0,
        failedStorageBatch: !storageRemoved,
        invalidSessionPathsSkipped: invalidSessionIds.length,
        retryLimitReachedPaths: Number(retryLimitRows[0]?.count ?? 0),
      };
    });
    if (summary.busy) {
      return json({ success: false, busy: true }, 409);
    }

    return json(summary, summary.success ? 200 : 502);
  } catch {
    // Never return database errors, object paths, or credentials to the caller.
    return json({ error: "cleanup_failed" }, 500);
  } finally {
    if (db) await db.end({ timeout: 1 }).catch(() => undefined);
  }
});
