// @ts-check
/**
 * Migration bookkeeping shared by the two appliers — `scripts/migrate.mjs`
 * (deploy, `readdir`) and `src/lib/db.ts` (PGLite preview, `import.meta.glob`).
 *
 * Applied files are keyed by BASENAME across the explicitly included
 * `migrations/auth/`, `migrations/fieldly/`, and root migration folders.
 * Both the deploy migrator and PGLite glob include the auth and Fieldly folders.
 * Keep migration basenames unique across all included folders: the migration
 * ledger stores only the basename, not its directory.
 */

/**
 * The `_migrations` key for a migration path (or bare filename).
 * @param {string} path
 * @returns {string}
 */
export function migrationName(path) {
  // Node returns native path separators from readdir/join. Windows uses \\,
  // while Vite import.meta.glob paths use /. Normalize both before extracting
  // the basename so the migration ledger is portable across dev and Render.
  return path.split(/[\\\\/]/).pop() ?? path;
}

/**
 * Find legacy ledger entries that were stored as full Windows/POSIX paths.
 * @param {Iterable<string>} applied
 * @returns {Array<{ legacy: string, canonical: string }>}
 */
export function legacyMigrationNames(applied) {
  return [...applied]
    .map((legacy) => ({ legacy, canonical: migrationName(legacy) }))
    .filter(({ legacy, canonical }) => legacy !== canonical);
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isMigrationFile(path) {
  return path.endsWith(".sql");
}

/**
 * Migrations in `paths` that are not yet in `applied`, in apply order.
 * Non-`.sql` entries (a `readdir` also yields `migrations/auth/`) are dropped.
 * @param {Iterable<string>} paths
 * @param {Iterable<string>} applied
 * @returns {Array<{ name: string, path: string }>}
 */
export function pendingMigrations(paths, applied) {
  const done = new Set(applied);
  return [...paths]
    .filter(isMigrationFile)
    .map((path) => ({ name: migrationName(path), path }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(({ name }) => !done.has(name));
}
