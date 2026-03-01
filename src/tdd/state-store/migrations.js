let STATE_SCHEMA_MIGRATIONS = [
  {
    version: 1,
    name: 'core_report_state',
    sql: `
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS comparisons (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        initial_status TEXT,
        signature TEXT,
        baseline TEXT,
        current TEXT,
        diff TEXT,
        properties_json TEXT NOT NULL,
        threshold REAL,
        min_cluster_size INTEGER,
        diff_percentage REAL,
        diff_count INTEGER,
        reason TEXT,
        total_pixels INTEGER,
        aa_pixels_ignored INTEGER,
        aa_percentage REAL,
        height_diff INTEGER,
        error TEXT,
        original_name TEXT,
        has_diff_clusters INTEGER NOT NULL DEFAULT 0,
        has_confirmed_regions INTEGER NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_comparisons_status
        ON comparisons(status);

      CREATE INDEX IF NOT EXISTS idx_comparisons_signature
        ON comparisons(signature);

      CREATE TABLE IF NOT EXISTS comparison_details (
        id TEXT PRIMARY KEY REFERENCES comparisons(id) ON DELETE CASCADE,
        details_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'metadata_state',
    sql: `
      CREATE TABLE IF NOT EXISTS state_metadata (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `,
  },
];

export function applySchemaMigrations(db, output = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  let applied = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
    .all();
  let appliedVersions = new Set(applied.map(row => Number(row.version)));

  for (let migration of STATE_SCHEMA_MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    let transaction = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare(
        `
          INSERT INTO schema_migrations (version, name, applied_at)
          VALUES (?, ?, ?)
        `
      ).run(migration.version, migration.name, Date.now());
    });

    transaction();
    output.debug?.(
      'state',
      `applied migration v${migration.version}: ${migration.name}`
    );
  }
}
