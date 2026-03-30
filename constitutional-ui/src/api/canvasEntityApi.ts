import { listTableRows } from "./queryApi";
import { getProcessState } from "./processApi";

export interface CanvasEntityConfig {
  entityType: string;
  table: string;
  idField: string;
  label: string;
}

export interface CanvasEntityLink extends CanvasEntityConfig {
  entityId: string | null;
  processEntityType: string | null;
  processReady: boolean;
}

const PROCESS_ENTITY_BY_UI_ENTITY: Record<string, string | null> = {
  customers: null,
  quotes: "quote",
  orders: "sales-order",
  invoices: "ar-invoice",
  payments: "ar-payment",
  suppliers: "supplier",
  requisitions: "requisition",
  "purchase-orders": "purchase-order",
  journals: "journal",
  employees: "employee",
};

export function toProcessEntityType(uiEntityType: string): string | null {
  return PROCESS_ENTITY_BY_UI_ENTITY[uiEntityType] ?? null;
}

export const CANVAS_ENTITIES: CanvasEntityConfig[] = [
  { entityType: "customers", table: "o2c_customer", idField: "customer_id", label: "Customers" },
  { entityType: "quotes", table: "o2c_quote", idField: "quote_id", label: "Quotes" },
  { entityType: "orders", table: "o2c_sales_order", idField: "order_id", label: "Orders" },
  { entityType: "invoices", table: "o2c_invoice", idField: "invoice_id", label: "Invoices" },
  { entityType: "payments", table: "o2c_payment", idField: "payment_id", label: "Payments" },
  { entityType: "suppliers", table: "p2p_supplier", idField: "supplier_id", label: "Suppliers" },
  { entityType: "requisitions", table: "p2p_requisition", idField: "requisition_id", label: "Requisitions" },
  { entityType: "purchase-orders", table: "p2p_purchase_order", idField: "po_id", label: "Purchase Orders" },
  { entityType: "journals", table: "r2r_journal", idField: "journal_id", label: "Journals" },
  { entityType: "employees", table: "h2r_employee", idField: "employee_id", label: "Employees" },
];

export async function getCanvasEntityLinks(): Promise<CanvasEntityLink[]> {
  const results = await Promise.all(
    CANVAS_ENTITIES.map(async (cfg) => {
      try {
        const page = await listTableRows(cfg.table, 25, 0);
        const candidateIds = [...page.data]
          .reverse()
          .map((row) => String(row[cfg.idField] ?? ""))
          .filter((id) => id.length > 0);
        const entityId = candidateIds[0] ?? "";
        const processEntityType = toProcessEntityType(cfg.entityType);
        const hasId = Boolean(entityId);

        if (!hasId || !processEntityType) {
          return {
            ...cfg,
            entityId: entityId || null,
            processEntityType,
            processReady: false,
          };
        }

        // Query endpoint is unordered; walk recent ids and prefer one with live actions.
        let firstProcessReadyId: string | null = null;

        for (const id of candidateIds.slice(0, 5)) {
          try {
            const state = await getProcessState(processEntityType, id);
            if (!firstProcessReadyId) {
              firstProcessReadyId = id;
            }

            if (state.links.length > 0) {
              return {
                ...cfg,
                entityId: id,
                processEntityType,
                processReady: true,
              };
            }
          } catch {
            // Ignore stale records that do not exist in process state yet.
          }
        }

        if (firstProcessReadyId) {
          return {
            ...cfg,
            entityId: firstProcessReadyId,
            processEntityType,
            processReady: true,
          };
        }

        return {
          ...cfg,
          entityId,
          processEntityType,
          processReady: false,
        };
      } catch {
        return {
          ...cfg,
          entityId: null,
          processEntityType: toProcessEntityType(cfg.entityType),
          processReady: false,
        };
      }
    })
  );

  return results;
}
