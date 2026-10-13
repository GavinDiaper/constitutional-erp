import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";
import { calculateTax, determineTaxByCode, persistTaxLine, getTaxLinesForEntity } from "../../tax/taxService";
import { createAndPostTaxAwareJournal } from "../../tax/taxPostingService";
import { createAndPostP2PJournal, reversePostedJournal } from "../../p2p/accounting/p2pPostingService";


type InvoiceState = "Draft" | "Posted" | "Paid" | "Reconciled" | "Cancelled";

interface InvoiceLineRow {
  invoice_line_id: string;
  invoice_id: string;
  order_line_id: string | null;
  sku: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  tax_code_id: string | null;
  tax_applicability: string | null;
  tax_rate_percent: number | null;
  tax_amount: number;
  line_payable: number;
  created_at: string;
}

const transitions: Record<InvoiceState, InvoiceState[]> = {
  Draft: ["Posted", "Cancelled"],
  Posted: ["Paid", "Cancelled"],
  Paid: ["Reconciled"],
  Reconciled: [],
  Cancelled: []
};

function now(): string {
  return new Date().toISOString();
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getInvoiceById(invoiceId: string) {
  const row = db.prepare("SELECT * FROM o2c_invoice WHERE invoice_id = ?").get(invoiceId) as
    | {
        invoice_id: string;
        order_id: string;
        state: InvoiceState;
        order_amount: number;
        tax_amount: number;
        total_payable: number;
        amount_due: number;
        amount_paid: number;
        project_milestone_id: string | null;
        accounting_journal_id: string | null;
        version: number;
      }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Invoice not found");
  }

  return row;
}

export function listInvoices() {
  return db.prepare("SELECT * FROM o2c_invoice ORDER BY created_at DESC LIMIT 100").all();
}

export function listInvoiceLines(invoiceId: string): InvoiceLineRow[] {
  getInvoiceById(invoiceId);
  return db.prepare(
    `SELECT
       invoice_line_id,
       invoice_id,
       order_line_id,
       sku,
       quantity,
       unit_price,
       line_total,
       tax_code_id,
       tax_applicability,
       tax_rate_percent,
       tax_amount,
       line_payable,
       created_at
     FROM o2c_invoice_line
     WHERE invoice_id = ?
     ORDER BY created_at ASC`
  ).all(invoiceId) as InvoiceLineRow[];
}

function assertTransition(fromState: InvoiceState, toState: InvoiceState) {
  if (!transitions[fromState].includes(toState)) {
    throw new HttpError(409, "invalid_transition", `Cannot transition invoice from ${fromState} to ${toState}`);
  }
}

export function generateInvoice(orderId: string, options?: { taxCodeId?: string; countryCode?: string }) {
  const order = db.prepare("SELECT * FROM o2c_sales_order WHERE order_id = ?").get(orderId) as
    | {
        order_id: string;
        total_amount: number;
        currency_code: string;
        legal_entity_id: string | null;
        state: string;
        billing_state: string;
        version: number;
      }
    | undefined;

  if (!order) {
    throw new HttpError(404, "not_found", "Sales order not found");
  }

  if (order.state !== "Shipped") {
    throw new HttpError(409, "invalid_transition", "Order must be Shipped before invoicing");
  }

  const hasServiceSku = db.prepare(
    `SELECT 1 AS found FROM o2c_sales_order_line l
     JOIN inv_sku s ON s.sku_id = l.sku OR s.sku_code = l.sku
     WHERE l.order_id = ? AND s.sku_type = 'service' LIMIT 1`
  ).get(orderId);
  if (hasServiceSku) {
    throw new HttpError(409, "milestone_billing_required", "Service order lines must be invoiced through approved project milestones");
  }

  const serviceLine = db.prepare(
    `SELECT 1 AS found FROM o2c_sales_order_line l
     JOIN inv_sku s ON s.sku_id = l.sku OR s.sku_code = l.sku
     WHERE l.order_id = ? AND s.sku_type = 'service' LIMIT 1`
  ).get(orderId);
  if (serviceLine) {
    throw new HttpError(409, "milestone_billing_required", "Service order lines must be invoiced through approved project milestones");
  }

  const invoiceId = newId("INV-");
  const timestamp = now();
  const invoiceDate = new Date().toISOString().slice(0, 10);
  const lineRows = db.prepare(
    `SELECT
       order_line_id,
       sku,
       quantity,
       unit_price,
       line_total,
       tax_code_id
     FROM o2c_sales_order_line
     WHERE order_id = ?
     ORDER BY created_at ASC`
  ).all(orderId) as Array<{
    order_line_id: string;
    sku: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    tax_code_id: string | null;
  }>;

  const computedOrderAmount = lineRows.reduce((sum, line) => sum + line.line_total, 0);
  const orderAmount = computedOrderAmount > 0 ? computedOrderAmount : order.total_amount;
  let totalTaxAmount = 0;
  const calculatedLineTaxes: Array<{
    orderLineId: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    taxDetermination: NonNullable<ReturnType<typeof determineTaxByCode>>;
    taxableAmount: number;
    taxAmount: number;
  }> = [];

  for (const line of lineRows) {
    if (!line.tax_code_id) {
      continue;
    }

    const taxDetermination = determineTaxByCode({
      taxCodeId: line.tax_code_id,
      countryCode: options?.countryCode ?? "AE",
      invoiceDate
    });

    if (!taxDetermination) {
      continue;
    }

    const taxCalc = calculateTax(line.line_total, taxDetermination.ratePercent, taxDetermination.inclusiveFlag);
    totalTaxAmount += taxCalc.taxAmount;
    calculatedLineTaxes.push({
      orderLineId: line.order_line_id,
      sku: line.sku,
      quantity: line.quantity,
      unitPrice: line.unit_price,
      lineTotal: line.line_total,
      taxDetermination,
      taxableAmount: taxCalc.taxableAmount,
      taxAmount: taxCalc.taxAmount
    });
  }

  // Backward-compatible fallback: header-level tax code if no line-level tax codes were selected.
  let headerTaxDetermination: ReturnType<typeof determineTaxByCode> = null;
  if (calculatedLineTaxes.length === 0 && options?.taxCodeId) {
    headerTaxDetermination = determineTaxByCode({
      taxCodeId: options.taxCodeId,
      countryCode: options.countryCode ?? "AE",
      invoiceDate
    });

    if (headerTaxDetermination) {
      const taxCalc = calculateTax(order.total_amount, headerTaxDetermination.ratePercent, headerTaxDetermination.inclusiveFlag);
      totalTaxAmount = taxCalc.taxAmount;
    }
  }

  const totalPayable = orderAmount + totalTaxAmount;
  const amountDue = totalPayable;


  transaction(() => {
    db.prepare(
      `INSERT INTO o2c_invoice(
        invoice_id,
        order_id,
        state,
        order_amount,
        tax_amount,
        total_payable,
        amount_due,
        amount_paid,
        version,
        created_at,
        updated_at
       ) VALUES (?, ?, 'Draft', ?, ?, ?, ?, 0, 1, ?, ?)`
      ).run(invoiceId, orderId, orderAmount, totalTaxAmount, totalPayable, amountDue, timestamp, timestamp);

    db.prepare("UPDATE o2c_sales_order SET state = 'Invoiced', billing_state = 'Invoiced', version = version + 1, updated_at = ? WHERE order_id = ?")
      .run(timestamp, orderId);

    appendEvent({
		entityId: orderId,
		entityType: "SalesOrder",
		eventType: "order.invoiced",
		version: order.version + 1,
		payload: { invoiceId }
	});

    appendEvent({
      entityId: invoiceId,
      entityType: "Invoice",
      eventType: "ar-invoice.generated",
      version: 1,
      payload: { orderId, orderAmount, taxAmount: totalTaxAmount, totalPayable, amountDue }
    });

    const insertInvoiceLine = db.prepare(
      `INSERT INTO o2c_invoice_line(
         invoice_line_id,
         invoice_id,
         order_line_id,
         sku,
         quantity,
         unit_price,
         line_total,
         tax_code_id,
         tax_applicability,
         tax_rate_percent,
         tax_amount,
         line_payable,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const calculatedByOrderLine = new Map(
      calculatedLineTaxes.map((item) => [item.orderLineId, item] as const)
    );

    for (const line of lineRows) {
      const calculated = calculatedByOrderLine.get(line.order_line_id);
      const lineTax = calculated?.taxAmount ?? 0;
      const linePayable = line.line_total + lineTax;
      insertInvoiceLine.run(
        newId("INVL-"),
        invoiceId,
        line.order_line_id,
        line.sku,
        line.quantity,
        line.unit_price,
        line.line_total,
        calculated?.taxDetermination.taxCodeId ?? line.tax_code_id,
        calculated?.taxDetermination.taxApplicability ?? null,
        calculated?.taxDetermination.ratePercent ?? null,
        lineTax,
        linePayable,
        timestamp
      );
    }
  });

  for (const lineTax of calculatedLineTaxes) {
    persistTaxLine({
      sourceDomain: "o2c",
      sourceEntityType: "Invoice",
      sourceEntityId: invoiceId,
      legalEntityId: order.legal_entity_id ?? undefined,
      taxRegimeId: lineTax.taxDetermination.taxRegimeId,
      taxJurisdictionId: lineTax.taxDetermination.jurisdictionId ?? undefined,
      taxCodeId: lineTax.taxDetermination.taxCodeId,
      taxRateId: lineTax.taxDetermination.taxRateId ?? undefined,
      taxRuleId: lineTax.taxDetermination.taxRuleId ?? undefined,
      transactionType: "ar-invoice",
      taxApplicability: lineTax.taxDetermination.taxApplicability,
      taxableAmount: lineTax.taxableAmount,
      taxAmount: lineTax.taxAmount,
      currencyCode: order.currency_code ?? "USD"
    });
  }

  if (calculatedLineTaxes.length === 0 && headerTaxDetermination) {
    const taxCalc = calculateTax(order.total_amount, headerTaxDetermination.ratePercent, headerTaxDetermination.inclusiveFlag);
    persistTaxLine({
      sourceDomain: "o2c",
      sourceEntityType: "Invoice",
      sourceEntityId: invoiceId,
      legalEntityId: order.legal_entity_id ?? undefined,
      taxRegimeId: headerTaxDetermination.taxRegimeId,
      taxJurisdictionId: headerTaxDetermination.jurisdictionId ?? undefined,
      taxCodeId: headerTaxDetermination.taxCodeId,
      taxRateId: headerTaxDetermination.taxRateId ?? undefined,
      taxRuleId: headerTaxDetermination.taxRuleId ?? undefined,
      transactionType: "ar-invoice",
      taxApplicability: headerTaxDetermination.taxApplicability,
      taxableAmount: taxCalc.taxableAmount,
      taxAmount: taxCalc.taxAmount,
      currencyCode: order.currency_code ?? "USD"
    });
  }


  return getInvoiceById(invoiceId);
}

export function generateProjectMilestoneInvoice(
  projectId: string,
  milestoneId: string,
  actor?: EventActor,
  countryCode = "AE"
) {
  const context = db.prepare(
    `SELECT m.milestone_id, m.project_id, m.name AS milestone_name, m.phase_name,
            m.billing_amount, m.status AS milestone_status, m.ready_for_billing,
            m.contract_version_id, m.order_line_id, m.wbs_element_id, m.invoice_id,
            m.revenue_journal_id,
            p.customer_id AS project_customer_id, p.contract_version_id AS project_contract_version_id,
            o.order_id, o.customer_id AS order_customer_id, o.contract_version_id AS order_contract_version_id,
            o.state AS order_state, o.billing_state, o.total_amount AS order_total,
            o.currency_code, o.legal_entity_id,
            cv.currency_code AS contract_currency_code,
            l.sku, l.line_total AS order_line_total, l.tax_code_id,
            l.project_id AS line_project_id, l.wbs_element_id AS line_wbs_element_id,
            s.sku_type, g.is_ready AS gate_ready
     FROM proj_project_milestone m
     JOIN proj_project p ON p.project_id = m.project_id
     JOIN o2c_sales_order_line l ON l.order_line_id = m.order_line_id
     JOIN o2c_sales_order o ON o.order_id = l.order_id
    JOIN o2c_contract_version cv ON cv.contract_version_id = m.contract_version_id
     LEFT JOIN inv_sku s ON s.sku_id = l.sku OR s.sku_code = l.sku
     LEFT JOIN proj_stage_gate g ON g.project_id = m.project_id AND g.phase_name = m.phase_name
     WHERE m.project_id = ? AND m.milestone_id = ?`
  ).get(projectId, milestoneId) as {
    milestone_id: string;
    project_id: string;
    milestone_name: string;
    phase_name: string;
    billing_amount: number;
    milestone_status: string;
    ready_for_billing: number;
    contract_version_id: string | null;
    order_line_id: string;
    wbs_element_id: string;
    invoice_id: string | null;
    revenue_journal_id: string | null;
    project_customer_id: string | null;
    project_contract_version_id: string | null;
    order_id: string;
    order_customer_id: string;
    order_contract_version_id: string | null;
    order_state: string;
    billing_state: string;
    order_total: number;
    currency_code: string;
    contract_currency_code: string;
    legal_entity_id: string | null;
    sku: string;
    order_line_total: number;
    tax_code_id: string | null;
    line_project_id: string | null;
    line_wbs_element_id: string | null;
    sku_type: string | null;
    gate_ready: number | null;
  } | undefined;

  if (!context) {
    throw new HttpError(404, "not_found", "Linked project milestone not found");
  }
  if (context.invoice_id) {
    accountProjectMilestoneCompletion(context.milestone_id, context.invoice_id, context.billing_amount, actor);
    return getInvoiceById(context.invoice_id);
  }
  if (context.milestone_status !== "Approved" || !context.ready_for_billing || !context.gate_ready) {
    throw new HttpError(409, "stage_gate_locked", "Milestone and its stage gate must be approved before invoicing");
  }
  if (context.sku_type !== "service") {
    throw new HttpError(400, "invalid_request", "Milestone invoices can only be generated for service SKU lines");
  }
  if (!["Confirmed", "Allocated", "Shipped"].includes(context.order_state)) {
    throw new HttpError(409, "invalid_transition", "Service order must be confirmed before milestone invoicing");
  }
  if (context.project_customer_id !== context.order_customer_id ||
      context.project_contract_version_id !== context.contract_version_id ||
      context.order_contract_version_id !== context.contract_version_id ||
      context.line_project_id !== projectId || context.line_wbs_element_id !== context.wbs_element_id) {
    throw new HttpError(409, "milestone_mapping_mismatch", "Milestone links no longer match the service order line");
  }
  if (context.currency_code !== context.contract_currency_code) {
    throw new HttpError(409, "contract_currency_mismatch", "Service order currency does not match the approved contract version");
  }
  const physicalLine = db.prepare(
    `SELECT 1 AS found FROM o2c_sales_order_line l
     LEFT JOIN inv_sku s ON s.sku_id = l.sku OR s.sku_code = l.sku
     WHERE l.order_id = ? AND COALESCE(s.sku_type, 'physical') <> 'service' LIMIT 1`
  ).get(context.order_id);
  if (physicalLine) {
    throw new HttpError(409, "mixed_order_milestone_billing_unsupported", "Milestone invoicing currently requires an order containing only service SKU lines");
  }

  const previouslyInvoiced = (db.prepare(
    `SELECT COALESCE(SUM(il.line_total), 0) AS amount
     FROM o2c_invoice_line il
     JOIN o2c_invoice i ON i.invoice_id = il.invoice_id
     WHERE il.order_line_id = ? AND i.state <> 'Cancelled'`
  ).get(context.order_line_id) as { amount: number }).amount;
  if (roundMoney(previouslyInvoiced + context.billing_amount) > roundMoney(context.order_line_total)) {
    throw new HttpError(409, "milestone_amount_exceeds_line", "Milestone invoice would exceed the remaining service order line value");
  }

  const previouslyBilledOnContract = (db.prepare(
    `SELECT COALESCE(SUM(i.order_amount), 0) AS amount
     FROM o2c_invoice i
     JOIN o2c_sales_order o ON o.order_id = i.order_id
     WHERE o.contract_version_id = ? AND i.state <> 'Cancelled'`
  ).get(context.contract_version_id) as { amount: number }).amount;
  const contract = db.prepare(
    "SELECT contract_value FROM o2c_contract_version WHERE contract_version_id = ?"
  ).get(context.contract_version_id) as { contract_value: number } | undefined;
  if (!contract || roundMoney(previouslyBilledOnContract + context.billing_amount) > roundMoney(contract.contract_value)) {
    throw new HttpError(409, "milestone_amount_exceeds_contract", "Milestone invoice would exceed the remaining contract value");
  }

  const amount = roundMoney(context.billing_amount);
  if (amount <= 0) {
    throw new HttpError(400, "invalid_request", "Milestone billing amount must be greater than zero");
  }
  const invoiceId = newId("INV-");
  const timestamp = now();
  const invoiceDate = timestamp.slice(0, 10);
  const taxDetermination = context.tax_code_id
    ? determineTaxByCode({ taxCodeId: context.tax_code_id, countryCode, invoiceDate })
    : null;
  const tax = taxDetermination
    ? calculateTax(amount, taxDetermination.ratePercent, taxDetermination.inclusiveFlag)
    : { taxableAmount: amount, taxAmount: 0 };
  const totalPayable = roundMoney(amount + tax.taxAmount);
  const invoiceVersion = 1;
  let existingInvoiceId: string | null = null;

  transaction(() => {
    const stillUnlinked = db.prepare(
      "SELECT invoice_id FROM proj_project_milestone WHERE project_id = ? AND milestone_id = ? AND invoice_id IS NULL"
    ).get(projectId, milestoneId);
    if (!stillUnlinked) {
      const current = db.prepare("SELECT invoice_id FROM proj_project_milestone WHERE project_id = ? AND milestone_id = ?")
        .get(projectId, milestoneId) as { invoice_id: string | null } | undefined;
      if (current?.invoice_id) {
        existingInvoiceId = current.invoice_id;
        return;
      }
      throw new HttpError(409, "milestone_invoice_conflict", "Milestone invoice was created concurrently");
    }

    db.prepare(
      `INSERT INTO o2c_invoice(
         invoice_id, order_id, project_milestone_id, state, order_amount, tax_amount,
         total_payable, amount_due, amount_paid, version, created_at, updated_at
       ) VALUES (?, ?, ?, 'Draft', ?, ?, ?, ?, 0, 1, ?, ?)`
    ).run(invoiceId, context.order_id, milestoneId, amount, tax.taxAmount, totalPayable, totalPayable, timestamp, timestamp);

    db.prepare(
      `INSERT INTO o2c_invoice_line(
         invoice_line_id, invoice_id, order_line_id, sku, quantity, unit_price, line_total,
         tax_code_id, tax_applicability, tax_rate_percent, tax_amount, line_payable, created_at
       ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newId("INVL-"), invoiceId, context.order_line_id, context.sku,
      amount, amount,
      taxDetermination?.taxCodeId ?? context.tax_code_id,
      taxDetermination?.taxApplicability ?? null,
      taxDetermination?.ratePercent ?? null,
      tax.taxAmount,
      totalPayable,
      timestamp
    );

    db.prepare(
      "UPDATE proj_project_milestone SET invoice_id = ?, billed_amount = ?, updated_at = ? WHERE project_id = ? AND milestone_id = ? AND invoice_id IS NULL"
    ).run(invoiceId, amount, timestamp, projectId, milestoneId);

    const billedOrderTotal = (db.prepare(
      `SELECT COALESCE(SUM(i.order_amount), 0) AS amount FROM o2c_invoice i
       WHERE i.order_id = ? AND i.state <> 'Cancelled'`
    ).get(context.order_id) as { amount: number }).amount;
    const billingState = roundMoney(billedOrderTotal) >= roundMoney(context.order_total)
      ? "Invoiced"
      : "PartiallyInvoiced";
    const orderVersion = (db.prepare("SELECT version FROM o2c_sales_order WHERE order_id = ?")
      .get(context.order_id) as { version: number }).version + 1;
    db.prepare("UPDATE o2c_sales_order SET billing_state = ?, version = ?, updated_at = ? WHERE order_id = ?")
      .run(billingState, orderVersion, timestamp, context.order_id);

    appendEvent({
      entityId: context.order_id,
      entityType: "SalesOrder",
      eventType: "order.milestone_invoice_created",
      version: orderVersion,
      actor,
      payload: { invoiceId, milestoneId, orderLineId: context.order_line_id, billingAmount: amount, billingState }
    });
    appendEvent({
      entityId: invoiceId,
      entityType: "Invoice",
      eventType: "ar-invoice.milestone_generated",
      version: invoiceVersion,
      actor,
      payload: { orderId: context.order_id, milestoneId, orderLineId: context.order_line_id, orderAmount: amount, taxAmount: tax.taxAmount, totalPayable }
    });
  });

  if (existingInvoiceId) {
    accountProjectMilestoneCompletion(milestoneId, existingInvoiceId, amount, actor);
    return getInvoiceById(existingInvoiceId);
  }

  accountProjectMilestoneCompletion(milestoneId, invoiceId, amount, actor);

  if (taxDetermination && tax.taxAmount > 0) {
    persistTaxLine({
      sourceDomain: "o2c",
      sourceEntityType: "Invoice",
      sourceEntityId: invoiceId,
      legalEntityId: context.legal_entity_id ?? undefined,
      taxRegimeId: taxDetermination.taxRegimeId,
      taxJurisdictionId: taxDetermination.jurisdictionId ?? undefined,
      taxCodeId: taxDetermination.taxCodeId,
      taxRateId: taxDetermination.taxRateId ?? undefined,
      taxRuleId: taxDetermination.taxRuleId ?? undefined,
      transactionType: "ar-invoice",
      taxApplicability: taxDetermination.taxApplicability,
      taxableAmount: tax.taxableAmount,
      taxAmount: tax.taxAmount,
      currencyCode: context.currency_code
    });
  }
  return getInvoiceById(invoiceId);
}

function accountProjectMilestoneCompletion(milestoneId: string, invoiceId: string, amount: number, actor?: EventActor): void {
  transaction(() => {
    const milestone = db.prepare(
      `SELECT m.revenue_journal_id, m.wip_release_journal_id, m.wip_released_amount,
              m.billing_amount, m.contract_version_id, m.phase_name, m.status,
              p.project_id, p.organization_id, p.default_wip_account_id, p.default_close_account_id,
              w.wip_id, w.wip_labor_balance, w.wip_total_balance,
              c.contract_value
       FROM proj_project_milestone m
       JOIN proj_project p ON p.project_id = m.project_id
       LEFT JOIN proj_wip w ON w.project_id = p.project_id
       LEFT JOIN o2c_contract_version c ON c.contract_version_id = m.contract_version_id
       WHERE m.milestone_id = ?`
    ).get(milestoneId) as {
      revenue_journal_id: string | null;
      wip_release_journal_id: string | null;
      wip_released_amount: number;
      billing_amount: number;
      contract_version_id: string | null;
      phase_name: string;
      status: string;
      project_id: string;
      organization_id: string;
      default_wip_account_id: string;
      default_close_account_id: string;
      wip_id: string | null;
      wip_labor_balance: number | null;
      wip_total_balance: number | null;
      contract_value: number | null;
    } | undefined;
    if (!milestone) throw new HttpError(404, "not_found", "Project milestone not found");
    const timestamp = now();
    if (!milestone.revenue_journal_id) {
      const posting = createAndPostP2PJournal({
        amount: roundMoney(Math.min(amount, milestone.billing_amount)),
        debitAccountCode: "SYS-130-ASSET-UNBILLED-AR",
        creditAccountCode: "SYS-400-REV-SALES",
        description: `Milestone revenue accrual ${milestoneId}`,
        memo: `Earned revenue for project milestone ${milestoneId}`,
        referenceEntityType: "Invoice",
        referenceEntityId: invoiceId
      }, actor);
      db.prepare("UPDATE proj_project_milestone SET revenue_journal_id = ?, updated_at = ? WHERE milestone_id = ? AND revenue_journal_id IS NULL")
        .run(posting.journalId, timestamp, milestoneId);
    }

    if (milestone.status === "Approved" && milestone.wip_id && milestone.contract_version_id &&
        milestone.contract_value && milestone.contract_value > 0 && !milestone.wip_release_journal_id) {
      const completedBilling = (db.prepare(
        `SELECT COALESCE(SUM(billing_amount), 0) AS amount FROM proj_project_milestone
         WHERE project_id = ? AND contract_version_id = ? AND status IN ('Approved', 'Completed')`
      ).get(milestone.project_id, milestone.contract_version_id) as { amount: number }).amount;
      const totalProjectLabor = (db.prepare(
        "SELECT COALESCE(SUM(total_cost), 0) AS amount FROM proj_labor_entry WHERE project_id = ?"
      ).get(milestone.project_id) as { amount: number }).amount;
      const previouslyReleased = (db.prepare(
        `SELECT COALESCE(SUM(wip_released_amount), 0) AS amount FROM proj_project_milestone
         WHERE project_id = ? AND contract_version_id = ?`
      ).get(milestone.project_id, milestone.contract_version_id) as { amount: number }).amount;
      const targetReleased = roundMoney(totalProjectLabor * Math.min(1, completedBilling / milestone.contract_value));
      const availableWip = Math.min(Number(milestone.wip_labor_balance ?? 0), Number(milestone.wip_total_balance ?? 0));
      const releaseAmount = roundMoney(Math.min(availableWip, Math.max(0, targetReleased - previouslyReleased)));
      if (releaseAmount > 0) {
        const closeAccount = db.prepare("SELECT account_code FROM r2r_account WHERE account_id = ?")
          .get(milestone.default_close_account_id) as { account_code: string } | undefined;
        const wipAccount = db.prepare("SELECT account_code FROM r2r_account WHERE account_id = ?")
          .get(milestone.default_wip_account_id) as { account_code: string } | undefined;
        if (!closeAccount || !wipAccount) throw new HttpError(409, "missing_account", "Project close or WIP account is not configured");
        const releaseJournal = createAndPostP2PJournal({
          amount: releaseAmount,
          debitAccountCode: closeAccount.account_code,
          creditAccountCode: wipAccount.account_code,
          description: `Project WIP release for milestone ${milestoneId}`,
          memo: `WIP release on milestone completion ${milestoneId}`,
          referenceEntityType: "ProjectMilestone",
          referenceEntityId: milestoneId
        }, actor);
        db.prepare(
          `UPDATE proj_wip SET wip_labor_balance = MAX(0, wip_labor_balance - ?),
             wip_total_balance = MAX(0, wip_total_balance - ?), version = version + 1
           WHERE wip_id = ?`
        ).run(releaseAmount, releaseAmount, milestone.wip_id);
        db.prepare(
          `UPDATE proj_project SET wip_labor_balance = MAX(0, wip_labor_balance - ?),
             wip_total_balance = MAX(0, wip_total_balance - ?), version = version + 1, last_event_at = ?
           WHERE project_id = ?`
        ).run(releaseAmount, releaseAmount, timestamp, milestone.project_id);
        db.prepare(
          `UPDATE proj_project_milestone SET wip_release_journal_id = ?, wip_released_amount = ?, updated_at = ?
           WHERE milestone_id = ? AND wip_release_journal_id IS NULL`
        ).run(releaseJournal.journalId, releaseAmount, timestamp, milestoneId);
      }
    }
  });
}

export function updateInvoiceState(invoiceId: string, toState: InvoiceState, actor?: EventActor) {
  return _doInvoiceTransition(invoiceId, toState, actor);
}

function _doInvoiceTransition(invoiceId: string, toState: InvoiceState, actor?: EventActor) {
  const invoice = getInvoiceById(invoiceId);
  assertTransition(invoice.state, toState);
  if (toState === "Cancelled" && invoice.amount_paid > 0) {
    throw new HttpError(409, "invoice_has_payments", "An invoice with applied payments cannot be cancelled");
  }

  const nextVersion = invoice.version + 1;
  const timestamp = now();

  transaction(() => {
    let reversalJournalId: string | null = null;
    if (toState === "Cancelled" && invoice.accounting_journal_id) {
      reversalJournalId = reversePostedJournal(
        invoice.accounting_journal_id,
        `Reversal of AR invoice ${invoiceId}`,
        actor
      ).journalId;
    }
    db.prepare("UPDATE o2c_invoice SET state = ?, reversal_journal_id = COALESCE(?, reversal_journal_id), version = ?, updated_at = ? WHERE invoice_id = ?")
      .run(toState, reversalJournalId, nextVersion, timestamp, invoiceId);

    appendEvent({
      entityId: invoiceId,
      entityType: "Invoice",
      eventType: `ar-invoice.${toState.toLowerCase()}`,
      version: nextVersion,
      actor,
      payload: { from: invoice.state, to: toState, reversalJournalId }
    });
  });

  return getInvoiceById(invoiceId);
}

export function postARInvoice(invoiceId: string, actor?: EventActor) {
  const invoice = getInvoiceById(invoiceId);
  if (invoice.accounting_journal_id) return invoice;
  if (invoice.state !== "Draft") throw new HttpError(409, "invalid_transition", "Only a Draft invoice can be posted");
  const timestamp = now();
  transaction(() => {
    const posting = createAndPostTaxAwareJournal({
      eventType: invoice.project_milestone_id ? "ar-invoice.milestone_posted" : "ar-invoice.posted",
      baseAmount: invoice.order_amount,
      debitAccountCode: "SYS-110-ASSET-AR",
      creditAccountCode: invoice.project_milestone_id ? "SYS-130-ASSET-UNBILLED-AR" : "SYS-400-REV-SALES",
      sourceEntityId: invoiceId,
      sourceEntityType: "Invoice",
      description: invoice.project_milestone_id
        ? `Milestone invoice reclassification: ${invoiceId}`
        : `AR Invoice posted: ${invoiceId}`,
      transactionType: "ar-invoice"
    }, actor);
    const nextVersion = invoice.version + 1;
    db.prepare("UPDATE o2c_invoice SET state = 'Posted', accounting_journal_id = ?, version = ?, updated_at = ? WHERE invoice_id = ? AND state = 'Draft'")
      .run(posting.journalId, nextVersion, timestamp, invoiceId);
    appendEvent({
      entityId: invoiceId,
      entityType: "Invoice",
      eventType: "ar-invoice.posted",
      version: nextVersion,
      actor,
      payload: { journalId: posting.journalId, projectMilestoneId: invoice.project_milestone_id ?? null }
    });
  });
  return getInvoiceById(invoiceId);
}


export function cancelARInvoice(invoiceId: string, actor?: EventActor) {
  const invoice = getInvoiceById(invoiceId);
  const cancelled = _doInvoiceTransition(invoiceId, "Cancelled", actor);
  if (invoice.project_milestone_id) {
    const timestamp = now();
    const billedAmount = (db.prepare(
      `SELECT COALESCE(SUM(order_amount), 0) AS amount FROM o2c_invoice
       WHERE order_id = ? AND state <> 'Cancelled'`
    ).get(invoice.order_id) as { amount: number }).amount;
    const order = db.prepare("SELECT total_amount, billing_state, version FROM o2c_sales_order WHERE order_id = ?")
      .get(invoice.order_id) as { total_amount: number; billing_state: string; version: number } | undefined;
    if (order) {
      const nextBillingState = billedAmount <= 0
        ? "Unbilled"
        : billedAmount >= order.total_amount
          ? "Invoiced"
          : "PartiallyInvoiced";
      transaction(() => {
        db.prepare(
          "UPDATE proj_project_milestone SET invoice_id = NULL, billed_amount = 0, updated_at = ? WHERE invoice_id = ?"
        ).run(timestamp, invoiceId);
        if (nextBillingState !== order.billing_state) {
          const nextVersion = order.version + 1;
          db.prepare("UPDATE o2c_sales_order SET billing_state = ?, version = ?, updated_at = ? WHERE order_id = ?")
            .run(nextBillingState, nextVersion, timestamp, invoice.order_id);
          appendEvent({
            entityId: invoice.order_id,
            entityType: "SalesOrder",
            eventType: "order.milestone_invoice_cancelled",
            version: nextVersion,
            actor,
            payload: { invoiceId, billingState: nextBillingState }
          });
        }
      });
    }
  }
  return cancelled;
}

export function addInvoicePayment(invoiceId: string, amount: number) {
  const invoice = getInvoiceById(invoiceId);
  const timestamp = now();

  const nextPaidAmount = invoice.amount_paid + amount;
  const nextState = nextPaidAmount >= invoice.amount_due ? "Paid" : invoice.state;
  const nextVersion = invoice.version + 1;

  transaction(() => {
    db.prepare("UPDATE o2c_invoice SET amount_paid = ?, state = ?, version = ?, updated_at = ? WHERE invoice_id = ?")
      .run(nextPaidAmount, nextState, nextVersion, timestamp, invoiceId);

    appendEvent({
      entityId: invoiceId,
      entityType: "Invoice",
      eventType: "ar-invoice.payment_applied",
      version: nextVersion,
      payload: { amount, amountPaid: nextPaidAmount, amountDue: invoice.amount_due }
    });
  });

  return getInvoiceById(invoiceId);
}
