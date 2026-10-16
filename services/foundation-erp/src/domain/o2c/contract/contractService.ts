import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor, GovernanceContext } from "../../../events/eventStore";
import { HttpError } from "../../../utils/errors";
import { newId } from "../../../utils/id";

type ContractVersionInput = {
  contractValue: number;
  currencyCode: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  sowSnapshot?: Record<string, unknown>;
};

function now(): string {
  return new Date().toISOString();
}

export interface SowDeliverable {
  name: string;
  amount: number;
  description?: string;
}

// Value bands drive the risk level and minimum authority tier for approving a contract version.
export function contractApprovalGovernance(contractValue: number): Required<Pick<GovernanceContext, "riskLevel" | "requiredTier" | "governanceTag">> {
  if (contractValue > 100000) {
    return { riskLevel: "High", requiredTier: 4, governanceTag: "contract_version_approve" };
  }
  if (contractValue > 10000) {
    return { riskLevel: "Medium", requiredTier: 3, governanceTag: "contract_version_approve" };
  }
  return { riskLevel: "Low", requiredTier: 2, governanceTag: "contract_version_approve" };
}

function actorTier(actor?: EventActor): number {
  const parsed = Number(actor?.authorityTier);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseSowDeliverables(snapshot: unknown): SowDeliverable[] {
  let value = snapshot;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  const raw = (value as { deliverables?: unknown } | null)?.deliverables;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null && typeof d.name === "string")
    .map((d) => ({
      name: String(d.name).trim(),
      amount: Number(d.amount ?? 0),
      ...(typeof d.description === "string" ? { description: d.description } : {})
    }))
    .filter((d) => d.name.length > 0);
}

function validateVersion(input: ContractVersionInput): void {
  if (!Number.isFinite(input.contractValue) || input.contractValue < 0) {
    throw new HttpError(400, "invalid_request", "contractValue must be a non-negative number");
  }
  if (!/^[A-Z]{3}$/.test(input.currencyCode)) {
    throw new HttpError(400, "invalid_request", "currencyCode must be a three-letter uppercase code");
  }
  if (input.effectiveUntil && input.effectiveUntil < input.effectiveFrom) {
    throw new HttpError(400, "invalid_request", "effectiveUntil must not precede effectiveFrom");
  }
  const deliverables = parseSowDeliverables(input.sowSnapshot);
  const names = new Set<string>();
  let total = 0;
  for (const d of deliverables) {
    if (!Number.isFinite(d.amount) || d.amount < 0) {
      throw new HttpError(400, "invalid_request", `SoW deliverable '${d.name}' amount must be a non-negative number`);
    }
    if (names.has(d.name.toLowerCase())) {
      throw new HttpError(400, "invalid_request", `Duplicate SoW deliverable '${d.name}'`);
    }
    names.add(d.name.toLowerCase());
    total += d.amount;
  }
  if (Math.round(total * 100) > Math.round(input.contractValue * 100)) {
    throw new HttpError(400, "invalid_request", "SoW deliverable amounts exceed the contract value");
  }
}

export function assertApprovedContract(contractId: string, customerId: string | undefined, effectiveDate: string): string {
  if (!customerId) {
    throw new HttpError(400, "invalid_request", "customerId is required for Service projects");
  }
  const row = db.prepare(
        `SELECT c.customer_id, c.status AS contract_status, c.current_version,
          v.contract_version_id, v.status AS version_status, v.effective_from, v.effective_until
     FROM o2c_contract c
     LEFT JOIN o2c_contract_version v
       ON v.contract_id = c.contract_id AND v.version_number = c.current_version
     WHERE c.contract_id = ?`
  ).get(contractId) as {
    customer_id: string;
    contract_status: string;
    current_version: number | null;
    contract_version_id: string | null;
    version_status: string | null;
    effective_from: string | null;
    effective_until: string | null;
  } | undefined;
  if (!row) {
    throw new HttpError(404, "not_found", "Contract not found");
  }
  if (row.customer_id !== customerId) {
    throw new HttpError(409, "contract_customer_mismatch", "Contract customer does not match the Service project customer");
  }
  if (row.contract_status !== "Active" || row.version_status !== "Approved" || row.current_version === null) {
    throw new HttpError(409, "contract_not_approved", "Service projects require a contract with a current approved version");
  }
  if (effectiveDate < (row.effective_from ?? "") || (row.effective_until && effectiveDate > row.effective_until)) {
    throw new HttpError(409, "contract_not_effective", "Contract is not effective on the Service project start date");
  }
  if (!row.contract_version_id) {
    throw new HttpError(409, "contract_version_missing", "Contract has no current approved version");
  }
  return row.contract_version_id;
}

export function assertApprovedContractVersion(
  contractVersionId: string,
  customerId: string,
  effectiveDate: string,
  allowSuperseded = false
) {
  const row = db.prepare(
    `SELECT c.contract_id, c.customer_id, c.status AS contract_status, c.current_version,
            v.contract_version_id, v.version_number, v.status AS version_status,
            v.contract_value, v.currency_code, v.effective_from, v.effective_until
     FROM o2c_contract_version v
     JOIN o2c_contract c ON c.contract_id = v.contract_id
     WHERE v.contract_version_id = ?`
  ).get(contractVersionId) as {
    contract_id: string;
    customer_id: string;
    contract_status: string;
    current_version: number | null;
    contract_version_id: string;
    version_number: number;
    version_status: string;
    contract_value: number;
    currency_code: string;
    effective_from: string;
    effective_until: string | null;
  } | undefined;
  if (!row) {
    throw new HttpError(404, "not_found", "Contract version not found");
  }
  if (row.customer_id !== customerId) {
    throw new HttpError(409, "contract_customer_mismatch", "Contract customer does not match the sales order customer");
  }
  const isCurrentApproved = row.version_status === "Approved" && row.current_version === row.version_number;
  const isPinnedSuperseded = allowSuperseded && row.version_status === "Superseded";
  if (row.contract_status !== "Active" || (!isCurrentApproved && !isPinnedSuperseded)) {
    throw new HttpError(409, "contract_not_approved", "Sales orders require a valid approved contract version");
  }
  if (effectiveDate < row.effective_from || (row.effective_until && effectiveDate > row.effective_until)) {
    throw new HttpError(409, "contract_not_effective", "Contract version is not effective on the sales order date");
  }
  return row;
}

function getContractVersion(contractId: string, versionNumber: number) {
  const row = db.prepare(
    `SELECT c.contract_id, c.customer_id, c.external_reference, c.name, c.status AS contract_status,
            c.current_version, v.contract_version_id, v.version_number, v.status AS version_status,
            v.contract_value, v.currency_code, v.effective_from, v.effective_until, v.sow_snapshot,
            v.approved_by, v.approved_at, v.created_by, v.created_at
     FROM o2c_contract c
     JOIN o2c_contract_version v ON v.contract_id = c.contract_id
     WHERE c.contract_id = ? AND v.version_number = ?`
  ).get(contractId, versionNumber);
  if (!row) {
    throw new HttpError(404, "not_found", "Contract version not found");
  }
  return row;
}

export function createContract(input: {
  customerId: string;
  externalReference?: string;
  name: string;
  version: ContractVersionInput;
}, actor?: EventActor) {
  validateVersion(input.version);
  if (!input.name.trim()) {
    throw new HttpError(400, "invalid_request", "name is required and cannot be empty");
  }
  const customer = db.prepare("SELECT customer_id FROM o2c_customer WHERE customer_id = ?")
    .get(input.customerId);
  if (!customer) {
    throw new HttpError(404, "not_found", "Customer not found");
  }

  const contractId = newId("CON-");
  const contractVersionId = newId("CONV-");
  const timestamp = now();
  const createdBy = actor?.id ?? "system";
  const sowSnapshot = JSON.stringify(input.version.sowSnapshot ?? {});

  transaction(() => {
    db.prepare(
      `INSERT INTO o2c_contract(
         contract_id, customer_id, external_reference, name, status, current_version, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'Draft', NULL, ?, ?, ?)`
    ).run(contractId, input.customerId, input.externalReference ?? null, input.name.trim(), createdBy, timestamp, timestamp);

    db.prepare(
      `INSERT INTO o2c_contract_version(
         contract_version_id, contract_id, version_number, status, contract_value, currency_code,
         effective_from, effective_until, sow_snapshot, created_by, created_at
       ) VALUES (?, ?, 1, 'Draft', ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      contractVersionId,
      contractId,
      input.version.contractValue,
      input.version.currencyCode,
      input.version.effectiveFrom,
      input.version.effectiveUntil ?? null,
      sowSnapshot,
      createdBy,
      timestamp
    );

    appendEvent({
      entityId: contractId,
      entityType: "Contract",
      eventType: "contract.created",
      version: 1,
      actor,
      payload: {
        customerId: input.customerId,
        contractVersionId,
        versionNumber: 1,
        contractValue: input.version.contractValue,
        currencyCode: input.version.currencyCode
      }
    });
  });

  return getContractVersion(contractId, 1);
}

export function createContractAmendment(contractId: string, input: ContractVersionInput, actor?: EventActor) {
  validateVersion(input);
  const contract = db.prepare("SELECT * FROM o2c_contract WHERE contract_id = ?").get(contractId) as
    | { contract_id: string; status: string; current_version: number | null }
    | undefined;
  if (!contract) {
    throw new HttpError(404, "not_found", "Contract not found");
  }
  if (contract.status !== "Active" || contract.current_version === null) {
    throw new HttpError(409, "invalid_transition", "Only an active contract can be amended");
  }
  const draft = db.prepare(
    "SELECT contract_version_id FROM o2c_contract_version WHERE contract_id = ? AND status = 'Draft'"
  ).get(contractId);
  if (draft) {
    throw new HttpError(409, "draft_version_exists", "Approve or discard the existing draft version before creating an amendment");
  }

  const versionNumber = (db.prepare(
    "SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version FROM o2c_contract_version WHERE contract_id = ?"
  ).get(contractId) as { next_version: number }).next_version;
  const contractVersionId = newId("CONV-");
  const timestamp = now();
  const createdBy = actor?.id ?? "system";

  transaction(() => {
    db.prepare(
      `INSERT INTO o2c_contract_version(
         contract_version_id, contract_id, version_number, status, contract_value, currency_code,
         effective_from, effective_until, sow_snapshot, created_by, created_at
       ) VALUES (?, ?, ?, 'Draft', ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      contractVersionId,
      contractId,
      versionNumber,
      input.contractValue,
      input.currencyCode,
      input.effectiveFrom,
      input.effectiveUntil ?? null,
      JSON.stringify(input.sowSnapshot ?? {}),
      createdBy,
      timestamp
    );
    appendEvent({
      entityId: contractId,
      entityType: "Contract",
      eventType: "contract.amendment_created",
      version: versionNumber,
      actor,
      payload: { contractVersionId, versionNumber, contractValue: input.contractValue }
    });
  });

  return getContractVersion(contractId, versionNumber);
}

export function approveContractVersion(contractId: string, versionNumber: number, actor?: EventActor) {
  const version = getContractVersion(contractId, versionNumber) as {
    contract_id: string;
    contract_version_id: string;
    current_version: number | null;
    version_status: string;
    contract_value: number;
  };
  if (version.version_status !== "Draft") {
    throw new HttpError(409, "invalid_transition", `Cannot approve contract version in state ${version.version_status}`);
  }
  const governance = contractApprovalGovernance(version.contract_value);
  if (!actor?.meshAsserted && actorTier(actor) < governance.requiredTier) {
    throw new HttpError(
      403,
      "insufficient_authority",
      `Insufficient authority to approve a ${governance.riskLevel}-risk contract version (tier ${governance.requiredTier}+ required)`
    );
  }
  const timestamp = now();
  const approvedBy = actor?.id ?? "system";

  transaction(() => {
    if (version.current_version !== null) {
      db.prepare(
        "UPDATE o2c_contract_version SET status = 'Superseded' WHERE contract_id = ? AND version_number = ? AND status = 'Approved'"
      ).run(contractId, version.current_version);
    }
    db.prepare(
      `UPDATE o2c_contract_version
       SET status = 'Approved', approved_by = ?, approved_at = ?
       WHERE contract_id = ? AND version_number = ? AND status = 'Draft'`
    ).run(approvedBy, timestamp, contractId, versionNumber);
    db.prepare(
      "UPDATE o2c_contract SET status = 'Active', current_version = ?, updated_at = ? WHERE contract_id = ?"
    ).run(versionNumber, timestamp, contractId);
    appendEvent({
      entityId: contractId,
      entityType: "Contract",
      eventType: "contract.version_approved",
      version: versionNumber,
      actor,
      governance,
      payload: { contractVersionId: version.contract_version_id, versionNumber, approvedBy }
    });
  });

  return getContractVersion(contractId, versionNumber);
}

export function getContractById(contractId: string) {
  const contract = db.prepare("SELECT * FROM o2c_contract WHERE contract_id = ?").get(contractId);
  if (!contract) {
    throw new HttpError(404, "not_found", "Contract not found");
  }
  const versions = db.prepare(
    "SELECT * FROM o2c_contract_version WHERE contract_id = ? ORDER BY version_number DESC"
  ).all(contractId);
  const decorated = (versions as Array<{ status: string; contract_value: number }>).map((v) =>
    v.status === "Draft" ? { ...v, approval_governance: contractApprovalGovernance(v.contract_value) } : v
  );
  return { ...contract as object, versions: decorated };
}

export function listContracts(customerId?: string) {
  if (customerId) {
    return db.prepare("SELECT * FROM o2c_contract WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100")
      .all(customerId);
  }
  return db.prepare("SELECT * FROM o2c_contract ORDER BY created_at DESC LIMIT 100").all();
}

export function listSelectableContracts(customerId?: string) {
  const query = `SELECT c.contract_id AS contractId, c.customer_id AS customerId,
            c.external_reference AS externalReference, c.name,
            v.contract_version_id AS contractVersionId, v.version_number AS versionNumber,
            v.contract_value AS contractValue, v.currency_code AS currencyCode
     FROM o2c_contract c
     JOIN o2c_contract_version v
       ON v.contract_id = c.contract_id
      AND v.version_number = c.current_version
      AND v.status = 'Approved'
     WHERE c.status = 'Active'`;
  if (customerId) {
    return db.prepare(`${query} AND c.customer_id = ? ORDER BY c.name ASC LIMIT 500`).all(customerId);
  }
  return db.prepare(
    `${query} ORDER BY c.name ASC LIMIT 500`
  ).all();
}