import { db, transaction } from "../../db/connection";
import { appendEvent, EventActor } from "../../events/eventStore";
import { HttpError } from "../../utils/errors";
import { newId } from "../../utils/id";

function now(): string {
  return new Date().toISOString();
}

export function listProjectWbsElements(projectId: string) {
  const project = db.prepare("SELECT project_id FROM proj_project WHERE project_id = ?").get(projectId);
  if (!project) {
    throw new HttpError(404, "not_found", "Project not found");
  }
  return db.prepare(
    `SELECT wbs_element_id AS wbsElementId, project_id AS projectId,
            contract_version_id AS contractVersionId, parent_wbs_element_id AS parentWbsElementId,
            wbs_code AS wbsCode, name, phase_name AS phaseName,
            deliverable_sku_id AS deliverableSkuId, status, version,
            created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
     FROM proj_wbs_element
     WHERE project_id = ?
     ORDER BY CASE WHEN parent_wbs_element_id IS NULL THEN 0 ELSE 1 END, wbs_code ASC`
  ).all(projectId);
}

export function createProjectWbsElement(projectId: string, input: {
  parentWbsElementId?: string;
  wbsCode: string;
  name: string;
  phaseName?: string;
  deliverableSkuId?: string;
}, actor?: EventActor) {
  if (!input.wbsCode?.trim() || !input.name?.trim()) {
    throw new HttpError(400, "invalid_request", "wbsCode and name are required");
  }
  const project = db.prepare(
    "SELECT project_id, project_type, contract_version_id FROM proj_project WHERE project_id = ?"
  ).get(projectId) as {
    project_id: string;
    project_type: string;
    contract_version_id: string | null;
  } | undefined;
  if (!project) {
    throw new HttpError(404, "not_found", "Project not found");
  }

  const parentId = input.parentWbsElementId ?? (db.prepare(
    "SELECT wbs_element_id FROM proj_wbs_element WHERE project_id = ? AND parent_wbs_element_id IS NULL"
  ).get(projectId) as { wbs_element_id: string } | undefined)?.wbs_element_id;
  if (!parentId) {
    throw new HttpError(409, "wbs_root_missing", "Project has no WBS root element");
  }
  const parent = db.prepare(
    "SELECT wbs_element_id, contract_version_id FROM proj_wbs_element WHERE project_id = ? AND wbs_element_id = ?"
  ).get(projectId, parentId) as { wbs_element_id: string; contract_version_id: string | null } | undefined;
  if (!parent) {
    throw new HttpError(404, "not_found", "Parent WBS element not found for project");
  }

  if (input.deliverableSkuId) {
    const sku = db.prepare("SELECT sku_type FROM inv_sku WHERE sku_id = ?").get(input.deliverableSkuId) as
      | { sku_type: string }
      | undefined;
    if (!sku) {
      throw new HttpError(404, "not_found", "Deliverable SKU not found");
    }
    if (project.project_type === "Service" && sku.sku_type !== "service") {
      throw new HttpError(400, "invalid_request", "Service WBS deliverables must use a service SKU");
    }
  }

  const wbsElementId = newId("WBS-");
  const timestamp = now();
  const createdBy = actor?.id ?? "system";
  const contractVersionId = project.contract_version_id ?? parent.contract_version_id;
  try {
    transaction(() => {
      db.prepare(
        `INSERT INTO proj_wbs_element(
           wbs_element_id, project_id, contract_version_id, parent_wbs_element_id, wbs_code,
           name, phase_name, deliverable_sku_id, status, version, created_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Planned', 1, ?, ?, ?)`
      ).run(
        wbsElementId,
        projectId,
        contractVersionId,
        parentId,
        input.wbsCode.trim(),
        input.name.trim(),
        input.phaseName?.trim() || null,
        input.deliverableSkuId ?? null,
        createdBy,
        timestamp,
        timestamp
      );
      appendEvent({
        entityId: wbsElementId,
        entityType: "ProjectWbsElement",
        eventType: "proj.wbs_element_created",
        version: 1,
        actor,
        payload: {
          projectId,
          contractVersionId,
          parentWbsElementId: parentId,
          wbsCode: input.wbsCode.trim(),
          name: input.name.trim(),
          phaseName: input.phaseName ?? null,
          deliverableSkuId: input.deliverableSkuId ?? null
        }
      });
    });
  } catch (error) {
    if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new HttpError(409, "duplicate_wbs_code", `WBS code '${input.wbsCode}' already exists in this project`);
    }
    throw error;
  }

  return db.prepare(
    `SELECT wbs_element_id AS wbsElementId, project_id AS projectId,
            contract_version_id AS contractVersionId, parent_wbs_element_id AS parentWbsElementId,
            wbs_code AS wbsCode, name, phase_name AS phaseName,
            deliverable_sku_id AS deliverableSkuId, status, version,
            created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
     FROM proj_wbs_element WHERE wbs_element_id = ?`
  ).get(wbsElementId);
}