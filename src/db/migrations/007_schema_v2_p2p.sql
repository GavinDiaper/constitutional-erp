-- v2: P2P canonical field additions

-- Supplier: payment terms, tax ID, currency
ALTER TABLE p2p_supplier ADD COLUMN payment_terms TEXT;
ALTER TABLE p2p_supplier ADD COLUMN tax_id TEXT;
ALTER TABLE p2p_supplier ADD COLUMN currency_code TEXT;

-- Requisition: department, currency, needed-by date
ALTER TABLE p2p_requisition ADD COLUMN department TEXT;
ALTER TABLE p2p_requisition ADD COLUMN currency_code TEXT;
ALTER TABLE p2p_requisition ADD COLUMN needed_by_date TEXT;

-- PurchaseOrder: currency, delivery address
ALTER TABLE p2p_purchase_order ADD COLUMN currency_code TEXT;
ALTER TABLE p2p_purchase_order ADD COLUMN delivery_address TEXT;

-- SupplierInvoice: direct supplier link, dates, currency
ALTER TABLE p2p_supplier_invoice ADD COLUMN supplier_id TEXT REFERENCES p2p_supplier(supplier_id);
ALTER TABLE p2p_supplier_invoice ADD COLUMN invoice_date TEXT;
ALTER TABLE p2p_supplier_invoice ADD COLUMN due_date TEXT;
ALTER TABLE p2p_supplier_invoice ADD COLUMN currency_code TEXT;

-- APPayment: currency, payment date, method
ALTER TABLE p2p_ap_payment ADD COLUMN currency_code TEXT;
ALTER TABLE p2p_ap_payment ADD COLUMN payment_date TEXT;
ALTER TABLE p2p_ap_payment ADD COLUMN method TEXT;
