import { McpFunctionDef } from "./catalog";

export const p2pFunctions: McpFunctionDef[] = [
  { name: "p2p_create_requisition", domain: "p2p", description: "Create requisition" },
  { name: "p2p_submit_requisition", domain: "p2p", description: "Submit requisition" },
  { name: "p2p_approve_requisition", domain: "p2p", description: "Approve requisition" },
  { name: "p2p_convert_requisition_to_po", domain: "p2p", description: "Convert requisition to PO" },
  { name: "p2p_create_supplier", domain: "p2p", description: "Create supplier" },
  { name: "p2p_create_po", domain: "p2p", description: "Create purchase order" },
  { name: "p2p_issue_po", domain: "p2p", description: "Issue purchase order" },
  { name: "p2p_acknowledge_po", domain: "p2p", description: "Acknowledge purchase order" },
  { name: "p2p_create_goods_receipt", domain: "p2p", description: "Create goods receipt" },
  { name: "p2p_receive_goods", domain: "p2p", description: "Receive goods" },
  { name: "p2p_accept_goods", domain: "p2p", description: "Accept goods" },
  { name: "p2p_create_supplier_invoice", domain: "p2p", description: "Create supplier invoice" },
  { name: "p2p_post_supplier_invoice", domain: "p2p", description: "Post supplier invoice" },
  { name: "p2p_create_ap_payment", domain: "p2p", description: "Create AP payment" },
  { name: "p2p_execute_ap_payment", domain: "p2p", description: "Execute AP payment" },
  { name: "p2p_reconcile_ap_payment", domain: "p2p", description: "Reconcile AP payment" }
];
