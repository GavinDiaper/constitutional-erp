import { http } from "./http";

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
    entityType: "customers",
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
    entityType: "suppliers",
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
    entityType: "requisitions",
    processEntityType: "requisition",
    entityId: created.requisition_id,
    message: `Created requisition ${created.requisition_id}`,
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
    entityType: "employees",
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
];
