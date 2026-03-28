import { Interface } from "node:readline/promises";

export const DOMAIN_MENU = {
  "P2P": "Procure-to-Pay",
  "O2C": "Order-to-Cash",
  "H2R": "Hire-to-Retire",
  "R2R": "Record-to-Report"
};

export type DomainKey = keyof typeof DOMAIN_MENU;

export const AGGREGATE_TYPES: Record<DomainKey, string[]> = {
  "P2P": ["requisition", "purchase-order", "supplier-invoice", "ap-payment"],
  "O2C": ["quote", "sales-order", "ar-invoice", "ar-payment"],
  "H2R": ["employee", "leave-request"],
  "R2R": ["journal", "fiscal-period"]
};

export function normalizeDomain(input: string): DomainKey | undefined {
  const candidate = input.trim().toUpperCase();
  if (candidate in DOMAIN_MENU) {
    return candidate as DomainKey;
  }

  return undefined;
}

export function getSupportedAggregateTypes(domain: string): string[] {
  const normalized = normalizeDomain(domain);
  return normalized ? AGGREGATE_TYPES[normalized] : [];
}

export function isSupportedAggregateType(domain: string, aggregateType: string): boolean {
  const normalizedType = aggregateType.trim().toLowerCase();
  return getSupportedAggregateTypes(domain).some((item) => item.toLowerCase() === normalizedType);
}

export async function selectDomain(rl: Interface): Promise<string> {
  const domains = Object.entries(DOMAIN_MENU);
  
  console.log("\nSelect Domain:");
  domains.forEach((d, i) => {
    console.log(`  ${i + 1}) ${d[0]} - ${d[1]}`);
  });
  
  while (true) {
    const choice = await rl.question("Enter domain number (1-4): ");
    const index = parseInt(choice) - 1;
    
    if (index >= 0 && index < domains.length) {
      const selected = domains[index][0];
      console.log(`✓ Domain set to ${selected}\n`);
      return selected;
    }
    
    console.log("Invalid choice. Please enter 1-4.");
  }
}

export async function selectAggregateType(rl: Interface, domain: string): Promise<string> {
  const types = getSupportedAggregateTypes(domain);
  
  if (types.length === 0) {
    console.log(`No aggregate types found for domain ${domain}`);
    return "";
  }
  
  console.log(`\nSelect Aggregate Type for ${domain}:`);
  types.forEach((t, i) => {
    console.log(`  ${i + 1}) ${t}`);
  });
  
  while (true) {
    const choice = await rl.question(`Enter aggregate type number (1-${types.length}): `);
    const index = parseInt(choice) - 1;
    
    if (index >= 0 && index < types.length) {
      const selected = types[index];
      console.log(`✓ Aggregate type set to ${selected}\n`);
      return selected;
    }
    
    console.log(`Invalid choice. Please enter 1-${types.length}.`);
  }
}

export async function selectActor(rl: Interface): Promise<string> {
  const suggestions = [
    "principal.system",
    "principal.p2p-tier1",
    "principal.p2p-tier3",
    "principal.o2c-tier2",
    "principal.h2r-tier2",
    "principal.r2r-tier3"
  ];
  
  console.log("\nEnter Actor ID (suggestions: " + suggestions.join(", ") + ")");
  const actor = await rl.question("Actor ID: ");
  
  if (actor.trim()) {
    console.log(`✓ Actor set to ${actor}\n`);
    return actor;
  }
  
  console.log("Actor ID cannot be empty.");
  return selectActor(rl);
}

export async function selectAggregateId(rl: Interface, aggregateType: string): Promise<string> {
  const id = await rl.question(`Enter ${aggregateType} ID (e.g., SO-001, PO-2024-001): `);
  
  if (id.trim()) {
    console.log(`✓ Aggregate ID set to ${id}\n`);
    return id;
  }
  
  console.log("Aggregate ID cannot be empty.");
  return selectAggregateId(rl, aggregateType);
}

export function printDomainInfo(): void {
  console.log("\n=== Domains & Aggregate Types ===\n");
  
  Object.entries(AGGREGATE_TYPES).forEach(([domain, types]) => {
    const description = DOMAIN_MENU[domain as DomainKey];
    console.log(`${domain} (${description})`);
    console.log(`  Types: ${types.join(", ")}`);
  });
  
  console.log("");
}
