import { AuthorityDomain } from "./types";

export interface GovernedOperation {
  domain: AuthorityDomain;
  resourceType: string;
  action: string;
  resourceId: string;
  backendPath: string;
}

const PROJECT_LIFECYCLE = new Set(["activate", "hold", "resume", "complete", "cancel", "advance-phase"]);

function singular(segment: string): string {
  return segment.endsWith("s") ? segment.slice(0, -1) : segment;
}

/**
 * Maps a Foundation write that is not a first-class Mesh resource route (nested or non-CRUD paths) to the
 * domain/resource/action that Authority and Governance evaluate. Returns null for paths that are not governed.
 */
export function findGovernedOperation(path: string, body: unknown): GovernedOperation | null {
  const clean = path.replace(/^\/+|\/+$/g, "");
  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  if (clean === "inv/movements") {
    const type = String(payload.movementType ?? "");
    const action = type === "adjustment" ? "adjust" : type === "cost_update" ? "cost_update" : "create";
    return { domain: "INV", resourceType: "inventory-movement", action, resourceId: "new", backendPath: "/inv/movements" };
  }

  const rate = /^h2r\/(vendor-rates|employee-cost-rates|authority-rules)$/.exec(clean);
  if (rate) {
    return { domain: "H2R", resourceType: singular(rate[1]), action: "create", resourceId: "new", backendPath: `/${clean}` };
  }

  if (clean === "timesheets/imports/preview") {
    return { domain: "H2R", resourceType: "timesheet-import", action: "import", resourceId: "new", backendPath: `/${clean}` };
  }
  const commit = /^timesheets\/imports\/([^/]+)\/commit$/.exec(clean);
  if (commit) {
    return { domain: "H2R", resourceType: "timesheet-import", action: "commit", resourceId: commit[1], backendPath: `/${clean}` };
  }

  const project = /^proj\/projects\/([^/]+)\/(.+)$/.exec(clean);
  if (project) {
    const [, projectId, sub] = project;
    const segments = sub.split("/");
    const backendPath = `/projects/${projectId}/${sub}`;
    if (segments.length === 1 && PROJECT_LIFECYCLE.has(segments[0])) {
      return { domain: "PROJ", resourceType: "project", action: segments[0], resourceId: projectId, backendPath };
    }
    return {
      domain: "PROJ",
      resourceType: singular(segments[0]),
      action: segments.length === 1 ? "create" : segments[segments.length - 1],
      resourceId: segments.length >= 2 ? segments[1] : projectId,
      backendPath
    };
  }

  return null;
}
