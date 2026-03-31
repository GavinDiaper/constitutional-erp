import { http } from "./http";
import { listTableRows } from "./queryApi";

export interface InitialActionResult {
  entityType: string;
  processEntityType: string | null;
  entityId: string;
  message: string;
}

export interface InitialActionDefinition {
  id: string;
  label: string;
  description: string;
  run: () => Promise<InitialActionResult>;
}

function stamp() {
  return Date.now();
}

async function createCustomer(): Promise<InitialActionResult> {
  const payload = {
    customerName: `Canvas Customer ${stamp()}`,
    email: `canvas.customer.${stamp()}@example.com`,
  };

  const created = await http<{ customer_id: string }>("/api/v1/o2c/customers", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return {
    entityType: "customer",
    processEntityType: null,
    entityId: created.customer_id,
    message: `Created customer ${created.customer_id}`,
  };
}

async function createSupplier(): Promise<InitialActionResult> {
  const payload = {
    supplierName: `Canvas Supplier ${stamp()}`,
    email: `canvas.supplier.${stamp()}@example.com`,
  };

  const created = await http<{ supplier_id: string }>("/api/v1/p2p/suppliers", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return {
    entityType: "supplier",
    processEntityType: "supplier",
    entityId: created.supplier_id,
    message: `Created supplier ${created.supplier_id}`,
  };
}

async function createRequisition(): Promise<InitialActionResult> {
  const payload = {
    requester: "canvas.user",
  };

  const created = await http<{ requisition_id: string }>("/api/v1/p2p/requisitions", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return {
    entityType: "requisition",
    processEntityType: "requisition",
    entityId: created.requisition_id,
    message: `Created requisition ${created.requisition_id}`,
  };
}

async function createQuote(): Promise<InitialActionResult> {
  let customerId: string | null = null;
  try {
    const customers = await listTableRows("o2c_customer", 1, 0);
    if (customers.data[0]) {
      customerId = String(customers.data[0]["customer_id"] ?? "");
    }
  } catch {
    customerId = null;
  }

  if (!customerId) {
    const createdCustomer = await createCustomer();
    customerId = createdCustomer.entityId;
  }

  const created = await http<{ quote_id: string }>("/api/v1/o2c/quotes", {
    method: "POST",
    body: JSON.stringify({ customerId, currencyCode: "USD" }),
  });

  return {
    entityType: "quote",
    processEntityType: "quote",
    entityId: created.quote_id,
    message: `Created quote ${created.quote_id}`,
  };
}

async function createJournal(): Promise<InitialActionResult> {
  const periods = await listTableRows("r2r_fiscal_period", 1, 0);
  const fiscalPeriodId = periods.data[0]
    ? String(periods.data[0]["fiscal_period_id"] ?? "")
    : "";

  if (!fiscalPeriodId) {
    throw new Error("No fiscal period available to create journal");
  }

  const created = await http<{ journal_id: string }>("/api/v1/r2r/journals", {
    method: "POST",
    body: JSON.stringify({
      fiscalPeriodId,
      description: `Canvas Journal ${stamp()}`,
    }),
  });

  return {
    entityType: "journal",
    processEntityType: "journal",
    entityId: created.journal_id,
    message: `Created journal ${created.journal_id}`,
  };
}

async function createEmployee(): Promise<InitialActionResult> {
  const id = stamp();
  const payload = {
    name: `Canvas Employee ${id}`,
    email: `canvas.employee.${id}@example.com`,
  };

  const created = await http<{ employee_id: string }>("/api/v1/h2r/employees", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return {
    entityType: "employee",
    processEntityType: "employee",
    entityId: created.employee_id,
    message: `Created employee ${created.employee_id}`,
  };
}

export const INITIAL_ACTIONS: InitialActionDefinition[] = [
  {
    id: "create-customer",
    label: "Create Customer",
    description: "Bootstrap O2C customer records.",
    run: createCustomer,
  },
  {
    id: "create-quote",
    label: "Create Quote",
    description: "Create O2C quote (auto-creates customer if needed).",
    run: createQuote,
  },
  {
    id: "create-supplier",
    label: "Create Supplier",
    description: "Bootstrap P2P supplier records.",
    run: createSupplier,
  },
  {
    id: "create-requisition",
    label: "Create Requisition",
    description: "Create a Draft requisition with default requester.",
    run: createRequisition,
  },
  {
    id: "create-employee",
    label: "Create Employee",
    description: "Create an Active employee record.",
    run: createEmployee,
  },
  {
    id: "create-journal",
    label: "Create Journal",
    description: "Create Draft journal in first available fiscal period.",
    run: createJournal,
  },
];

export function getInitialActionById(id: string): InitialActionDefinition | undefined {
  return INITIAL_ACTIONS.find((x) => x.id === id);
}
