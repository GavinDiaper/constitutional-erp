const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const sourcePath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(repoRoot, "services", "foundation-erp", "foundation.db");
const targetPath = path.join(__dirname, "..", "erp-mapping-tool.db");

const migrationDir = path.join(__dirname, "..", "src", "db", "migrations");
const seedMigrations = [
  "047_erp_system_seed.sql",
  "048_migrate_erp_mapping_to_v2.sql",
  "049_seed_erp_process.sql",
  "050_erp_comparison_views.sql"
];

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Source DB not found: ${sourcePath}`);
}

if (!fs.existsSync(targetPath)) {
  throw new Error(`Target DB not found: ${targetPath}`);
}

const source = new Database(sourcePath, { readonly: true });
const target = new Database(targetPath);

const sourceHasLegacy = source
  .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='erp_mapping' LIMIT 1")
  .get();

if (!sourceHasLegacy) {
  source.close();
  target.close();
  throw new Error(`Source DB does not contain erp_mapping table: ${sourcePath}`);
}

const sync = target.transaction(() => {
  target.prepare("DELETE FROM erp_field_mapping").run();
  target.prepare("DELETE FROM erp_system_field").run();
  target.prepare("DELETE FROM erp_process_system_mapping").run();
  target.prepare("DELETE FROM erp_process_step").run();
  target.prepare("DELETE FROM erp_process").run();
  target.prepare("DELETE FROM erp_canonical_field").run();
  target.prepare("DELETE FROM erp_canonical_entity").run();
  target.prepare("DELETE FROM erp_system").run();
  target.prepare("DELETE FROM erp_mapping").run();

  const rows = source.prepare("SELECT * FROM erp_mapping").all();
  const insertLegacy = target.prepare(
    `INSERT INTO erp_mapping (
      mapping_id, domain, entity_name, canonical_field, oracle_field, sap_field, dynamics_field, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const row of rows) {
    insertLegacy.run(
      row.mapping_id,
      row.domain,
      row.entity_name,
      row.canonical_field,
      row.oracle_field,
      row.sap_field,
      row.dynamics_field,
      row.created_at,
      row.updated_at
    );
  }

  for (const fileName of seedMigrations) {
    const fullPath = path.join(migrationDir, fileName);
    const sql = fs.readFileSync(fullPath, "utf8");
    target.exec(sql);
  }

  return rows.length;
});

const importedLegacy = sync();
const counts = {
  legacy: target.prepare("SELECT COUNT(*) AS c FROM erp_mapping").get().c,
  systems: target.prepare("SELECT COUNT(*) AS c FROM erp_system").get().c,
  fields: target.prepare("SELECT COUNT(*) AS c FROM erp_canonical_field").get().c,
  mappings: target.prepare("SELECT COUNT(*) AS c FROM erp_field_mapping").get().c,
  processes: target.prepare("SELECT COUNT(*) AS c FROM erp_process").get().c
};

console.log(`Imported ${importedLegacy} legacy mapping rows from ${sourcePath}`);
console.log(`Target counts: legacy=${counts.legacy}, systems=${counts.systems}, fields=${counts.fields}, field_mappings=${counts.mappings}, processes=${counts.processes}`);

source.close();
target.close();
