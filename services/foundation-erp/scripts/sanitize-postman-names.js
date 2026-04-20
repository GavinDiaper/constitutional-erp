const fs = require("node:fs");
const path = require("node:path");

const collectionPath = path.resolve(
  __dirname,
  "..",
  "postman",
  "FoundationERP.postman_collection.json"
);

const source = fs.readFileSync(collectionPath, "utf8");

let updated = 0;
const cleaned = source.replace(/("name"\s*:\s*")((?:\\.|[^"\\])*)(")/g, (m, p1, raw, p3) => {
  let decoded;
  try {
    decoded = JSON.parse(`"${raw}"`);
  } catch {
    return m;
  }

  // Keep labels terminal-safe: remove non-ASCII and collapse spacing.
  const normalized = decoded
    .normalize("NFKC")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\bTM\b/g, " ")
    .replace(/\.\.\./g, " ")
    .replace(/\b3\s+4\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized || normalized === decoded) {
    return m;
  }

  updated += 1;
  const reEncoded = JSON.stringify(normalized).slice(1, -1);
  return `${p1}${reEncoded}${p3}`;
});

if (updated === 0) {
  console.log("No corrupted name fields found.");
  process.exit(0);
}

fs.writeFileSync(collectionPath, cleaned, "utf8");
console.log(`Sanitized ${updated} name fields in ${collectionPath}`);
