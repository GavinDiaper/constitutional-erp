-- Seed canonical to ERP field mappings across all domains.
-- Additive and idempotent: uses INSERT OR IGNORE so replays are safe.

INSERT OR IGNORE INTO erp_mapping(mapping_id, domain, entity_name, canonical_field, oracle_field, sap_field, dynamics_field, created_at, updated_at)
VALUES
  -- O2C: Customer
  ('MAP-O2C-CUSTOMER-CUSTOMERID', 'O2C', 'Customer', 'customerId', 'HZ_PARTIES.PARTY_ID', 'KNA1-KUNNR', 'CustTable.AccountNum', datetime('now'), datetime('now')),
  ('MAP-O2C-CUSTOMER-CUSTOMERNAME', 'O2C', 'Customer', 'customerName', 'HZ_PARTIES.PARTY_NAME', 'KNA1-NAME1', 'CustTable.Name', datetime('now'), datetime('now')),
  ('MAP-O2C-CUSTOMER-EMAIL', 'O2C', 'Customer', 'email', 'HZ_CONTACT_POINTS.EMAIL_ADDRESS', 'ADR6-SMTP_ADDR', 'LogisticsElectronicAddress.Locator', datetime('now'), datetime('now')),
  ('MAP-O2C-CUSTOMER-STATUS', 'O2C', 'Customer', 'status', 'HZ_CUST_ACCOUNTS.STATUS', 'KNA1-AUFSD', 'CustTable.Blocked', datetime('now'), datetime('now')),
  ('MAP-O2C-CUSTOMER-BILLINGADDRESS', 'O2C', 'Customer', 'billingAddress', 'HZ_LOCATIONS.ADDRESS1', 'ADRC-STREET', 'LogisticsPostalAddress.Address', datetime('now'), datetime('now')),
  ('MAP-O2C-CUSTOMER-SHIPPINGADDRESS', 'O2C', 'Customer', 'shippingAddress', 'HZ_CUST_SITE_USES_ALL.SHIP_TO_FLAG', 'VBPA-PARVW(SH)', 'CustDeliveryPostalAddress.Address', datetime('now'), datetime('now')),

  -- O2C: Quote
  ('MAP-O2C-QUOTE-QUOTEID', 'O2C', 'Quote', 'quoteId', 'DOO_QUOTES_ALL.QUOTE_NUMBER', 'CRMD_ORDERADM_H-OBJECT_ID', 'SalesQuotationTable.QuotationId', datetime('now'), datetime('now')),
  ('MAP-O2C-QUOTE-CUSTOMERID', 'O2C', 'Quote', 'customerId', 'DOO_QUOTES_ALL.CUSTOMER_ID', 'CRMD_PARTNER-PARTNER_NO', 'SalesQuotationTable.InvoiceAccount', datetime('now'), datetime('now')),
  ('MAP-O2C-QUOTE-STATE', 'O2C', 'Quote', 'state', 'DOO_QUOTES_ALL.STATUS_CODE', 'CRMD_ORDERADM_H-STATUS', 'SalesQuotationTable.DocumentStatus', datetime('now'), datetime('now')),
  ('MAP-O2C-QUOTE-CURRENCYCODE', 'O2C', 'Quote', 'currencyCode', 'DOO_QUOTES_ALL.CURRENCY_CODE', 'VBAK-WAERK', 'SalesQuotationTable.CurrencyCode', datetime('now'), datetime('now')),
  ('MAP-O2C-QUOTE-TOTALAMOUNT', 'O2C', 'Quote', 'totalAmount', 'DOO_QUOTES_ALL.TOTAL_AMOUNT', 'KONV-KWERT(SUM)', 'SalesQuotationLine.LineAmount(SUM)', datetime('now'), datetime('now')),
  ('MAP-O2C-QUOTE-LEGALENTITYID', 'O2C', 'Quote', 'legalEntityId', 'FUN_ALL_BUSINESS_UNITS.BU_ID', 'T001-BUKRS', 'CompanyInfo.DataArea', datetime('now'), datetime('now')),

  -- O2C: SalesOrder
  ('MAP-O2C-SALESORDER-ORDERID', 'O2C', 'SalesOrder', 'orderId', 'DOO_HEADERS_ALL.HEADER_ID', 'VBAK-VBELN', 'SalesTable.SalesId', datetime('now'), datetime('now')),
  ('MAP-O2C-SALESORDER-QUOTEID', 'O2C', 'SalesOrder', 'quoteId', 'DOO_HEADERS_ALL.SOURCE_ORDER_NUMBER', 'VBFA-VBELV', 'SalesTable.QuotationId', datetime('now'), datetime('now')),
  ('MAP-O2C-SALESORDER-CUSTOMERID', 'O2C', 'SalesOrder', 'customerId', 'DOO_HEADERS_ALL.SOLD_TO_CUSTOMER_ID', 'VBAK-KUNNR', 'SalesTable.CustAccount', datetime('now'), datetime('now')),
  ('MAP-O2C-SALESORDER-STATE', 'O2C', 'SalesOrder', 'state', 'DOO_HEADERS_ALL.STATUS_CODE', 'VBUK-GBSTK', 'SalesTable.SalesStatus', datetime('now'), datetime('now')),
  ('MAP-O2C-SALESORDER-CURRENCYCODE', 'O2C', 'SalesOrder', 'currencyCode', 'DOO_HEADERS_ALL.TRANSACTIONAL_CURRENCY_CODE', 'VBAK-WAERK', 'SalesTable.CurrencyCode', datetime('now'), datetime('now')),
  ('MAP-O2C-SALESORDER-TOTALAMOUNT', 'O2C', 'SalesOrder', 'totalAmount', 'DOO_HEADERS_ALL.TOTAL_AMT', 'VBRP-NETWR(SUM)', 'SalesLine.LineAmount(SUM)', datetime('now'), datetime('now')),
  ('MAP-O2C-SALESORDER-LEGALENTITYID', 'O2C', 'SalesOrder', 'legalEntityId', 'FUN_ALL_BUSINESS_UNITS.BU_ID', 'VBAK-BUKRS_VF', 'CompanyInfo.DataArea', datetime('now'), datetime('now')),

  -- O2C: Invoice
  ('MAP-O2C-INVOICE-INVOICEID', 'O2C', 'Invoice', 'invoiceId', 'RA_CUSTOMER_TRX_ALL.CUSTOMER_TRX_ID', 'VBRK-VBELN', 'CustInvoiceJour.InvoiceId', datetime('now'), datetime('now')),
  ('MAP-O2C-INVOICE-ORDERID', 'O2C', 'Invoice', 'orderId', 'RA_CUSTOMER_TRX_LINES_ALL.SALES_ORDER', 'VBRP-AUBEL', 'CustInvoiceJour.SalesId', datetime('now'), datetime('now')),
  ('MAP-O2C-INVOICE-STATE', 'O2C', 'Invoice', 'state', 'RA_CUSTOMER_TRX_ALL.COMPLETE_FLAG', 'VBRK-FKSTO', 'CustInvoiceJour.InvoiceStatus', datetime('now'), datetime('now')),
  ('MAP-O2C-INVOICE-AMOUNTDUE', 'O2C', 'Invoice', 'amountDue', 'AR_PAYMENT_SCHEDULES_ALL.AMOUNT_DUE_REMAINING', 'BSID-DMBTR', 'CustTrans.AmountCur', datetime('now'), datetime('now')),
  ('MAP-O2C-INVOICE-AMOUNTPAID', 'O2C', 'Invoice', 'amountPaid', 'AR_RECEIVABLE_APPLICATIONS_ALL.AMOUNT_APPLIED', 'BSAD-DMBTR', 'CustSettlement.AmountSettledCur', datetime('now'), datetime('now')),
  ('MAP-O2C-INVOICE-CURRENCYCODE', 'O2C', 'Invoice', 'currencyCode', 'RA_CUSTOMER_TRX_ALL.INVOICE_CURRENCY_CODE', 'VBRK-WAERK', 'CustInvoiceJour.CurrencyCode', datetime('now'), datetime('now')),
  ('MAP-O2C-INVOICE-INVOICEDATE', 'O2C', 'Invoice', 'invoiceDate', 'RA_CUSTOMER_TRX_ALL.TRX_DATE', 'VBRK-FKDAT', 'CustInvoiceJour.InvoiceDate', datetime('now'), datetime('now')),
  ('MAP-O2C-INVOICE-DUEDATE', 'O2C', 'Invoice', 'dueDate', 'AR_PAYMENT_SCHEDULES_ALL.DUE_DATE', 'BSID-ZFBDT', 'CustTrans.DueDate', datetime('now'), datetime('now')),
  ('MAP-O2C-INVOICE-ORDERAMOUNT', 'O2C', 'Invoice', 'orderAmount', 'RA_CUSTOMER_TRX_LINES_ALL.EXTENDED_AMOUNT(SUM)', 'VBRP-NETWR(SUM)', 'CustInvoiceTrans.LineAmount(SUM)', datetime('now'), datetime('now')),
  ('MAP-O2C-INVOICE-TAXAMOUNT', 'O2C', 'Invoice', 'taxAmount', 'ZX_LINES.TAX_AMT(SUM)', 'VBRP-MWSBP(SUM)', 'TaxTrans.SourceTaxAmountCur(SUM)', datetime('now'), datetime('now')),
  ('MAP-O2C-INVOICE-TOTALPAYABLE', 'O2C', 'Invoice', 'totalPayable', 'RA_CUSTOMER_TRX_ALL.INVOICE_AMOUNT', 'VBRK-NETWR+MWSBK', 'CustInvoiceJour.InvoiceAmount', datetime('now'), datetime('now')),

  -- O2C: Payment
  ('MAP-O2C-PAYMENT-PAYMENTID', 'O2C', 'Payment', 'paymentId', 'AR_CASH_RECEIPTS_ALL.CASH_RECEIPT_ID', 'BSAD-AUGBL', 'CustSettlement.Voucher', datetime('now'), datetime('now')),
  ('MAP-O2C-PAYMENT-INVOICEID', 'O2C', 'Payment', 'invoiceId', 'AR_RECEIVABLE_APPLICATIONS_ALL.APPLIED_CUSTOMER_TRX_ID', 'BSAD-REBZG', 'CustSettlement.Invoice', datetime('now'), datetime('now')),
  ('MAP-O2C-PAYMENT-STATE', 'O2C', 'Payment', 'state', 'AR_CASH_RECEIPTS_ALL.STATUS', 'BSAD-AUGDT', 'CustSettlement.SettlementType', datetime('now'), datetime('now')),
  ('MAP-O2C-PAYMENT-AMOUNT', 'O2C', 'Payment', 'amount', 'AR_CASH_RECEIPTS_ALL.AMOUNT', 'BSAD-DMBTR', 'CustSettlement.SettleAmountCur', datetime('now'), datetime('now')),
  ('MAP-O2C-PAYMENT-CURRENCYCODE', 'O2C', 'Payment', 'currencyCode', 'AR_CASH_RECEIPTS_ALL.CURRENCY_CODE', 'BKPF-WAERS', 'CustSettlement.CurrencyCode', datetime('now'), datetime('now')),
  ('MAP-O2C-PAYMENT-PAYMENTDATE', 'O2C', 'Payment', 'paymentDate', 'AR_CASH_RECEIPTS_ALL.RECEIPT_DATE', 'BKPF-BUDAT', 'CustSettlement.TransDate', datetime('now'), datetime('now')),
  ('MAP-O2C-PAYMENT-METHOD', 'O2C', 'Payment', 'method', 'AR_CASH_RECEIPTS_ALL.RECEIPT_METHOD_ID', 'T042Z-ZLSCH', 'CustPaymModeTable.PaymMode', datetime('now'), datetime('now')),

  -- O2C: Shipment
  ('MAP-O2C-SHIPMENT-SHIPMENTID', 'O2C', 'Shipment', 'shipmentId', 'WSH_NEW_DELIVERIES.DELIVERY_ID', 'LIKP-VBELN', 'SalesParmTable.ParmId', datetime('now'), datetime('now')),
  ('MAP-O2C-SHIPMENT-ORDERID', 'O2C', 'Shipment', 'orderId', 'WSH_DELIVERY_ASSIGNMENTS.SOURCE_HEADER_ID', 'LIPS-VGBEL', 'SalesTable.SalesId', datetime('now'), datetime('now')),
  ('MAP-O2C-SHIPMENT-STATE', 'O2C', 'Shipment', 'state', 'WSH_NEW_DELIVERIES.STATUS_CODE', 'LIKp-WBSTK', 'WMSShipmentTable.ShipmentStatus', datetime('now'), datetime('now')),
  ('MAP-O2C-SHIPMENT-SHIPDATE', 'O2C', 'Shipment', 'shipDate', 'WSH_NEW_DELIVERIES.ACTUAL_SHIPMENT_DATE', 'LIKP-WADAT_IST', 'WMSShipmentTable.ShipDate', datetime('now'), datetime('now')),
  ('MAP-O2C-SHIPMENT-CARRIER', 'O2C', 'Shipment', 'carrier', 'WSH_CARRIERS.CARRIER_NAME', 'LIKP-LIFEX', 'LogisticsPostalAddress.CarrierCode', datetime('now'), datetime('now')),
  ('MAP-O2C-SHIPMENT-TRACKINGNUMBER', 'O2C', 'Shipment', 'trackingNumber', 'WSH_NEW_DELIVERIES.WAYBILL', 'VTTK-EXTI1', 'WMSShipmentTable.TrackingNumber', datetime('now'), datetime('now')),

  -- P2P: Supplier
  ('MAP-P2P-SUPPLIER-SUPPLIERID', 'P2P', 'Supplier', 'supplierId', 'POZ_SUPPLIERS.SEGMENT1', 'LFA1-LIFNR', 'VendTable.AccountNum', datetime('now'), datetime('now')),
  ('MAP-P2P-SUPPLIER-SUPPLIERNAME', 'P2P', 'Supplier', 'supplierName', 'POZ_SUPPLIERS.VENDOR_NAME', 'LFA1-NAME1', 'VendTable.Name', datetime('now'), datetime('now')),
  ('MAP-P2P-SUPPLIER-EMAIL', 'P2P', 'Supplier', 'email', 'POZ_SUPPLIER_CONTACT_EMAIL', 'ADR6-SMTP_ADDR', 'LogisticsElectronicAddress.Locator', datetime('now'), datetime('now')),
  ('MAP-P2P-SUPPLIER-STATUS', 'P2P', 'Supplier', 'status', 'POZ_SUPPLIERS.ENABLED_FLAG', 'LFA1-SPERR', 'VendTable.Blocked', datetime('now'), datetime('now')),
  ('MAP-P2P-SUPPLIER-PAYMENTTERMS', 'P2P', 'Supplier', 'paymentTerms', 'POZ_SUPPLIER_SITES_ALL.TERMS_ID', 'LFB1-ZTERM', 'VendTable.PaymTermId', datetime('now'), datetime('now')),
  ('MAP-P2P-SUPPLIER-TAXID', 'P2P', 'Supplier', 'taxId', 'ZX_PARTY_TAX_PROFILE.REP_REGISTRATION_NUMBER', 'LFA1-STCD1', 'TaxRegistrationNumTable.RegistrationNumber', datetime('now'), datetime('now')),
  ('MAP-P2P-SUPPLIER-CURRENCYCODE', 'P2P', 'Supplier', 'currencyCode', 'POZ_SUPPLIER_SITES_ALL.PAYMENT_CURRENCY_CODE', 'LFM1-WAERS', 'VendTable.Currency', datetime('now'), datetime('now')),

  -- P2P: Requisition
  ('MAP-P2P-REQUISITION-REQUISITIONID', 'P2P', 'Requisition', 'requisitionId', 'POR_REQUISITION_HEADERS_ALL.REQUISITION_HEADER_ID', 'EBAN-BANFN', 'PurchReqTable.PurchReqId', datetime('now'), datetime('now')),
  ('MAP-P2P-REQUISITION-REQUESTER', 'P2P', 'Requisition', 'requester', 'POR_REQUISITION_HEADERS_ALL.PREPARER_ID', 'EBAN-AFNAM', 'PurchReqTable.Requester', datetime('now'), datetime('now')),
  ('MAP-P2P-REQUISITION-STATE', 'P2P', 'Requisition', 'state', 'POR_REQUISITION_HEADERS_ALL.AUTHORIZATION_STATUS', 'EBAN-BANPR', 'PurchReqTable.RequisitionStatus', datetime('now'), datetime('now')),
  ('MAP-P2P-REQUISITION-TOTALAMOUNT', 'P2P', 'Requisition', 'totalAmount', 'POR_REQUISITION_LINES_ALL.AMOUNT(SUM)', 'EBAN-PREIS(SUM)', 'PurchReqLine.LineAmount(SUM)', datetime('now'), datetime('now')),
  ('MAP-P2P-REQUISITION-DEPARTMENT', 'P2P', 'Requisition', 'department', 'PER_DEPARTMENTS.DEPARTMENT_NAME', 'CSKS-KOSTL', 'OMOperatingUnit.Name', datetime('now'), datetime('now')),
  ('MAP-P2P-REQUISITION-CURRENCYCODE', 'P2P', 'Requisition', 'currencyCode', 'POR_REQUISITION_HEADERS_ALL.CURRENCY_CODE', 'EBAN-WAERS', 'PurchReqTable.CurrencyCode', datetime('now'), datetime('now')),
  ('MAP-P2P-REQUISITION-NEEDEDBYDATE', 'P2P', 'Requisition', 'neededByDate', 'POR_REQUISITION_LINES_ALL.NEED_BY_DATE', 'EBAN-LFDAT', 'PurchReqLine.DeliveryDate', datetime('now'), datetime('now')),
  ('MAP-P2P-REQUISITION-LEGALENTITYID', 'P2P', 'Requisition', 'legalEntityId', 'FUN_ALL_BUSINESS_UNITS.BU_ID', 'T001-BUKRS', 'CompanyInfo.DataArea', datetime('now'), datetime('now')),

  -- P2P: PurchaseOrder
  ('MAP-P2P-PO-POID', 'P2P', 'PurchaseOrder', 'poId', 'PO_HEADERS_ALL.SEGMENT1', 'EKKO-EBELN', 'PurchTable.PurchId', datetime('now'), datetime('now')),
  ('MAP-P2P-PO-REQUISITIONID', 'P2P', 'PurchaseOrder', 'requisitionId', 'PO_DISTRIBUTIONS_ALL.REQ_DISTRIBUTION_ID', 'EKPO-BANFN', 'PurchLine.PurchReqId', datetime('now'), datetime('now')),
  ('MAP-P2P-PO-SUPPLIERID', 'P2P', 'PurchaseOrder', 'supplierId', 'PO_HEADERS_ALL.VENDOR_ID', 'EKKO-LIFNR', 'PurchTable.OrderAccount', datetime('now'), datetime('now')),
  ('MAP-P2P-PO-STATE', 'P2P', 'PurchaseOrder', 'state', 'PO_HEADERS_ALL.DOCUMENT_STATUS', 'EKKO-STATU', 'PurchTable.DocumentState', datetime('now'), datetime('now')),
  ('MAP-P2P-PO-TOTALAMOUNT', 'P2P', 'PurchaseOrder', 'totalAmount', 'PO_HEADERS_ALL.AMOUNT_RELEASED', 'EKPO-NETWR(SUM)', 'PurchLine.LineAmount(SUM)', datetime('now'), datetime('now')),
  ('MAP-P2P-PO-CURRENCYCODE', 'P2P', 'PurchaseOrder', 'currencyCode', 'PO_HEADERS_ALL.CURRENCY_CODE', 'EKKO-WAERS', 'PurchTable.CurrencyCode', datetime('now'), datetime('now')),
  ('MAP-P2P-PO-DELIVERYADDRESS', 'P2P', 'PurchaseOrder', 'deliveryAddress', 'PO_LINE_LOCATIONS_ALL.SHIP_TO_LOCATION_ID', 'EKPO-ADRNR', 'PurchTable.DeliveryPostalAddress', datetime('now'), datetime('now')),
  ('MAP-P2P-PO-LEGALENTITYID', 'P2P', 'PurchaseOrder', 'legalEntityId', 'FUN_ALL_BUSINESS_UNITS.BU_ID', 'T001-BUKRS', 'CompanyInfo.DataArea', datetime('now'), datetime('now')),

  -- P2P: SupplierInvoice
  ('MAP-P2P-SUPPINV-SUPPLIERINVOICEID', 'P2P', 'SupplierInvoice', 'supplierInvoiceId', 'AP_INVOICES_ALL.INVOICE_ID', 'RBKP-BELNR', 'VendInvoiceInfoTable.Num', datetime('now'), datetime('now')),
  ('MAP-P2P-SUPPINV-POID', 'P2P', 'SupplierInvoice', 'poId', 'AP_INVOICE_DISTRIBUTIONS_ALL.PO_DISTRIBUTION_ID', 'RSEG-EBELN', 'VendInvoiceInfoLine.PurchId', datetime('now'), datetime('now')),
  ('MAP-P2P-SUPPINV-SUPPLIERID', 'P2P', 'SupplierInvoice', 'supplierId', 'AP_INVOICES_ALL.VENDOR_ID', 'RBKP-LIFNR', 'VendInvoiceInfoTable.OrderAccount', datetime('now'), datetime('now')),
  ('MAP-P2P-SUPPINV-STATE', 'P2P', 'SupplierInvoice', 'state', 'AP_INVOICES_ALL.APPROVAL_STATUS', 'RBKP-RBSTAT', 'VendInvoiceInfoTable.DocumentStatus', datetime('now'), datetime('now')),
  ('MAP-P2P-SUPPINV-AMOUNTDUE', 'P2P', 'SupplierInvoice', 'amountDue', 'AP_INVOICES_ALL.INVOICE_AMOUNT', 'RBKP-RMWWR', 'VendTrans.AmountCur', datetime('now'), datetime('now')),
  ('MAP-P2P-SUPPINV-AMOUNTPAID', 'P2P', 'SupplierInvoice', 'amountPaid', 'AP_INVOICE_PAYMENTS_ALL.AMOUNT', 'BSEG-DMBTR(PAYMENT)', 'VendSettlement.AmountCur', datetime('now'), datetime('now')),
  ('MAP-P2P-SUPPINV-INVOICEDATE', 'P2P', 'SupplierInvoice', 'invoiceDate', 'AP_INVOICES_ALL.INVOICE_DATE', 'RBKP-BLDAT', 'VendInvoiceInfoTable.DocumentDate', datetime('now'), datetime('now')),
  ('MAP-P2P-SUPPINV-DUEDATE', 'P2P', 'SupplierInvoice', 'dueDate', 'AP_PAYMENT_SCHEDULES_ALL.DUE_DATE', 'BSEG-ZFBDT', 'VendTrans.DueDate', datetime('now'), datetime('now')),
  ('MAP-P2P-SUPPINV-CURRENCYCODE', 'P2P', 'SupplierInvoice', 'currencyCode', 'AP_INVOICES_ALL.INVOICE_CURRENCY_CODE', 'RBKP-WAERS', 'VendInvoiceInfoTable.CurrencyCode', datetime('now'), datetime('now')),

  -- P2P: AP Payment
  ('MAP-P2P-APPAYMENT-APPAYMENTID', 'P2P', 'APPayment', 'apPaymentId', 'AP_CHECKS_ALL.CHECK_ID', 'REGUH-VBLNR', 'VendSettlement.Voucher', datetime('now'), datetime('now')),
  ('MAP-P2P-APPAYMENT-SUPPLIERINVOICEID', 'P2P', 'APPayment', 'supplierInvoiceId', 'AP_INVOICE_PAYMENTS_ALL.INVOICE_ID', 'BSEG-REBZG', 'VendSettlement.Invoice', datetime('now'), datetime('now')),
  ('MAP-P2P-APPAYMENT-STATE', 'P2P', 'APPayment', 'state', 'AP_CHECKS_ALL.STATUS_LOOKUP_CODE', 'REGUH-XVORL', 'VendSettlement.SettlementType', datetime('now'), datetime('now')),
  ('MAP-P2P-APPAYMENT-AMOUNT', 'P2P', 'APPayment', 'amount', 'AP_INVOICE_PAYMENTS_ALL.AMOUNT', 'BSEG-DMBTR', 'VendSettlement.SettleAmountCur', datetime('now'), datetime('now')),
  ('MAP-P2P-APPAYMENT-CURRENCYCODE', 'P2P', 'APPayment', 'currencyCode', 'AP_CHECKS_ALL.CURRENCY_CODE', 'BKPF-WAERS', 'VendSettlement.CurrencyCode', datetime('now'), datetime('now')),
  ('MAP-P2P-APPAYMENT-PAYMENTDATE', 'P2P', 'APPayment', 'paymentDate', 'AP_CHECKS_ALL.CHECK_DATE', 'BKPF-BUDAT', 'VendSettlement.TransDate', datetime('now'), datetime('now')),
  ('MAP-P2P-APPAYMENT-METHOD', 'P2P', 'APPayment', 'method', 'AP_CHECKS_ALL.PAYMENT_METHOD_LOOKUP_CODE', 'T042Z-ZLSCH', 'VendPaymModeTable.PaymMode', datetime('now'), datetime('now')),
  ('MAP-P2P-APPAYMENT-EXECUTEDAT', 'P2P', 'APPayment', 'executedAt', 'AP_CHECKS_ALL.CLEARED_DATE', 'AUGDT', 'VendSettlement.SettlementDate', datetime('now'), datetime('now')),

  -- R2R: Account
  ('MAP-R2R-ACCOUNT-ACCOUNTID', 'R2R', 'Account', 'accountId', 'GL_CODE_COMBINATIONS.CODE_COMBINATION_ID', 'SKA1-SAKNR', 'MainAccount.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-ACCOUNT-ACCOUNTCODE', 'R2R', 'Account', 'accountCode', 'GL_CODE_COMBINATIONS.CONCATENATED_SEGMENTS', 'SKA1-SAKNR', 'MainAccount.MainAccountId', datetime('now'), datetime('now')),
  ('MAP-R2R-ACCOUNT-ACCOUNTNAME', 'R2R', 'Account', 'accountName', 'GL_CODE_COMBINATIONS.DESCRIPTION', 'SKAT-TXT20', 'MainAccount.Name', datetime('now'), datetime('now')),
  ('MAP-R2R-ACCOUNT-ACCOUNTTYPE', 'R2R', 'Account', 'accountType', 'GL_CODE_COMBINATIONS.ACCOUNT_TYPE', 'SKA1-XBILK', 'MainAccount.Type', datetime('now'), datetime('now')),
  ('MAP-R2R-ACCOUNT-LEDGERID', 'R2R', 'Account', 'ledgerId', 'GL_LEDGERS.LEDGER_ID', 'T001-RLDNR', 'Ledger.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-ACCOUNT-PARENTACCOUNTID', 'R2R', 'Account', 'parentAccountId', 'GL_CODE_COMBINATIONS.PARENT_CCID', 'SKA1-BILKT', 'MainAccount.ParentMainAccount', datetime('now'), datetime('now')),

  -- R2R: Fiscal Year and Period
  ('MAP-R2R-FISCALYEAR-FISCALYEARID', 'R2R', 'FiscalYear', 'fiscalYearId', 'GL_PERIOD_STATUSES.PERIOD_YEAR', 'T009B-BDATJ', 'FiscalCalendarYear.Year', datetime('now'), datetime('now')),
  ('MAP-R2R-FISCALYEAR-YEARLABEL', 'R2R', 'FiscalYear', 'yearLabel', 'GL_PERIOD_STATUSES.PERIOD_YEAR', 'T009B-BDATJ', 'FiscalCalendarYear.Name', datetime('now'), datetime('now')),
  ('MAP-R2R-FISCALYEAR-STATE', 'R2R', 'FiscalYear', 'state', 'GL_PERIOD_STATUSES.CLOSING_STATUS', 'T001B-MONAT_STATUS', 'LedgerFiscalYearStatus.Status', datetime('now'), datetime('now')),
  ('MAP-R2R-FISCALPERIOD-FISCALPERIODID', 'R2R', 'FiscalPeriod', 'fiscalPeriodId', 'GL_PERIODS.PERIOD_NAME', 'T009B-POPER', 'FiscalCalendarPeriod.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-FISCALPERIOD-FISCALYEARID', 'R2R', 'FiscalPeriod', 'fiscalYearId', 'GL_PERIODS.PERIOD_YEAR', 'T009B-BDATJ', 'FiscalCalendarYear.Year', datetime('now'), datetime('now')),
  ('MAP-R2R-FISCALPERIOD-PERIODNUMBER', 'R2R', 'FiscalPeriod', 'periodNumber', 'GL_PERIODS.PERIOD_NUM', 'T009B-POPER', 'FiscalCalendarPeriod.PeriodNum', datetime('now'), datetime('now')),
  ('MAP-R2R-FISCALPERIOD-STATE', 'R2R', 'FiscalPeriod', 'state', 'GL_PERIOD_STATUSES.CLOSING_STATUS', 'T001B-XSPER', 'LedgerPeriodStatus.Status', datetime('now'), datetime('now')),

  -- R2R: Journal and Journal Line
  ('MAP-R2R-JOURNAL-JOURNALID', 'R2R', 'Journal', 'journalId', 'GL_JE_HEADERS.JE_HEADER_ID', 'BKPF-BELNR', 'GeneralJournalEntry.SubledgerVoucher', datetime('now'), datetime('now')),
  ('MAP-R2R-JOURNAL-FISCALPERIODID', 'R2R', 'Journal', 'fiscalPeriodId', 'GL_JE_HEADERS.PERIOD_NAME', 'BKPF-MONAT', 'GeneralJournalEntry.AccountingDate', datetime('now'), datetime('now')),
  ('MAP-R2R-JOURNAL-DESCRIPTION', 'R2R', 'Journal', 'description', 'GL_JE_HEADERS.DESCRIPTION', 'BKPF-BKTXT', 'GeneralJournalEntry.Description', datetime('now'), datetime('now')),
  ('MAP-R2R-JOURNAL-STATE', 'R2R', 'Journal', 'state', 'GL_JE_HEADERS.STATUS', 'BKPF-BSTAT', 'GeneralJournalEntry.PostingLayer', datetime('now'), datetime('now')),
  ('MAP-R2R-JOURNAL-LEDGERID', 'R2R', 'Journal', 'ledgerId', 'GL_JE_HEADERS.LEDGER_ID', 'BKPF-RLDNR', 'Ledger.RecId', datetime('now'), datetime('now')),

  ('MAP-R2R-JOURNALLINE-JOURNALLINEID', 'R2R', 'JournalLine', 'journalLineId', 'GL_JE_LINES.JE_LINE_NUM', 'BSEG-BUZEI', 'GeneralJournalAccountEntry.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-JOURNALLINE-JOURNALID', 'R2R', 'JournalLine', 'journalId', 'GL_JE_LINES.JE_HEADER_ID', 'BSEG-BELNR', 'GeneralJournalEntry.SubledgerVoucher', datetime('now'), datetime('now')),
  ('MAP-R2R-JOURNALLINE-ACCOUNTID', 'R2R', 'JournalLine', 'accountId', 'GL_JE_LINES.CODE_COMBINATION_ID', 'BSEG-HKONT', 'LedgerDimensionFacade.MainAccount', datetime('now'), datetime('now')),
  ('MAP-R2R-JOURNALLINE-DEBITAMOUNT', 'R2R', 'JournalLine', 'debitAmount', 'GL_JE_LINES.ACCOUNTED_DR', 'BSEG-PSWBT', 'GeneralJournalAccountEntry.AccountingCurrencyAmount(Debit)', datetime('now'), datetime('now')),
  ('MAP-R2R-JOURNALLINE-CREDITAMOUNT', 'R2R', 'JournalLine', 'creditAmount', 'GL_JE_LINES.ACCOUNTED_CR', 'BSEG-PSWBT', 'GeneralJournalAccountEntry.AccountingCurrencyAmount(Credit)', datetime('now'), datetime('now')),

  -- R2R: Ledger and Legal Entity
  ('MAP-R2R-LEDGER-LEDGERID', 'R2R', 'Ledger', 'ledgerId', 'GL_LEDGERS.LEDGER_ID', 'T001-RLDNR', 'Ledger.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-LEDGER-NAME', 'R2R', 'Ledger', 'name', 'GL_LEDGERS.NAME', 'T001-BUTXT', 'Ledger.Name', datetime('now'), datetime('now')),
  ('MAP-R2R-LEDGER-CURRENCYCODE', 'R2R', 'Ledger', 'currencyCode', 'GL_LEDGERS.CURRENCY_CODE', 'T001-WAERS', 'Ledger.AccountingCurrency', datetime('now'), datetime('now')),
  ('MAP-R2R-LEDGER-CALENDAR', 'R2R', 'Ledger', 'calendar', 'GL_LEDGERS.PERIOD_SET_NAME', 'T009-PERIV', 'FiscalCalendar.Name', datetime('now'), datetime('now')),
  ('MAP-R2R-LEDGER-CHARTOFACCOUNTSREF', 'R2R', 'Ledger', 'chartOfAccountsRef', 'GL_LEDGERS.CHART_OF_ACCOUNTS_ID', 'KTOPL', 'MainAccountCategoryHierarchy.Name', datetime('now'), datetime('now')),
  ('MAP-R2R-LEDGER-LEGALENTITYID', 'R2R', 'Ledger', 'legalEntityId', 'XLE_ENTITY_PROFILES.LEGAL_ENTITY_ID', 'T001-BUKRS', 'CompanyInfo.DataArea', datetime('now'), datetime('now')),

  ('MAP-R2R-LEGALENTITY-LEGALENTITYID', 'R2R', 'LegalEntity', 'legalEntityId', 'XLE_ENTITY_PROFILES.LEGAL_ENTITY_ID', 'T001-BUKRS', 'CompanyInfo.DataArea', datetime('now'), datetime('now')),
  ('MAP-R2R-LEGALENTITY-NAME', 'R2R', 'LegalEntity', 'name', 'XLE_ENTITY_PROFILES.NAME', 'T001-BUTXT', 'CompanyInfo.Name', datetime('now'), datetime('now')),
  ('MAP-R2R-LEGALENTITY-CURRENCYCODE', 'R2R', 'LegalEntity', 'currencyCode', 'XLE_ENTITY_PROFILES.CURRENCY_CODE', 'T001-WAERS', 'CompanyInfo.CurrencyCode', datetime('now'), datetime('now')),
  ('MAP-R2R-LEGALENTITY-LOCALE', 'R2R', 'LegalEntity', 'locale', 'XLE_ENTITY_PROFILES.LEGAL_ADDRESS_LANGUAGE', 'T001-LAND1', 'CompanyInfo.LanguageId', datetime('now'), datetime('now')),

  -- R2R: FX and posting profiles
  ('MAP-R2R-FXRATETYPE-RATETYPEID', 'R2R', 'FXRateType', 'rateTypeId', 'GL_DAILY_CONVERSION_TYPES.CONVERSION_TYPE', 'TCURV-KURST', 'ExchangeRateType.ExchangeRateType', datetime('now'), datetime('now')),
  ('MAP-R2R-FXRATETYPE-CODE', 'R2R', 'FXRateType', 'code', 'GL_DAILY_CONVERSION_TYPES.USER_CONVERSION_TYPE', 'TCURV-KURST', 'ExchangeRateType.ExchangeRateType', datetime('now'), datetime('now')),
  ('MAP-R2R-FXRATE-RATEID', 'R2R', 'FXRate', 'rateId', 'GL_DAILY_RATES.DAILY_RATE_ID', 'TCURR-UKURS(KEY)', 'ExchangeRateCurrencyPair.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-FXRATE-RATETYPEID', 'R2R', 'FXRate', 'rateTypeId', 'GL_DAILY_RATES.CONVERSION_TYPE', 'TCURR-KURST', 'ExchangeRateType.ExchangeRateType', datetime('now'), datetime('now')),
  ('MAP-R2R-FXRATE-FROMCURRENCY', 'R2R', 'FXRate', 'fromCurrency', 'GL_DAILY_RATES.FROM_CURRENCY', 'TCURR-FCURR', 'ExchangeRateCurrencyPair.FromCurrencyCode', datetime('now'), datetime('now')),
  ('MAP-R2R-FXRATE-TOCURRENCY', 'R2R', 'FXRate', 'toCurrency', 'GL_DAILY_RATES.TO_CURRENCY', 'TCURR-TCURR', 'ExchangeRateCurrencyPair.ToCurrencyCode', datetime('now'), datetime('now')),
  ('MAP-R2R-FXRATE-RATE', 'R2R', 'FXRate', 'rate', 'GL_DAILY_RATES.CONVERSION_RATE', 'TCURR-UKURS', 'ExchangeRate.CurrencyExchangeRate', datetime('now'), datetime('now')),

  ('MAP-R2R-SLAPROFILE-POSTINGPROFILEID', 'R2R', 'SLAPostingProfile', 'postingProfileId', 'XLA_AAD_HEADERS.APPLICATION_ID', 'GB01-PROFILE', 'LedgerPostingSetup.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-SLAPROFILE-NAME', 'R2R', 'SLAPostingProfile', 'name', 'XLA_AAD_HEADERS.NAME', 'GB01-BEZEI', 'LedgerPostingSetup.Name', datetime('now'), datetime('now')),
  ('MAP-R2R-SLAPROFILE-EVENTTYPE', 'R2R', 'SLAPostingProfile', 'eventType', 'XLA_EVENT_TYPES_B.EVENT_TYPE_CODE', 'BTE-EVENT', 'SubledgerEventType.EventType', datetime('now'), datetime('now')),

  -- R2R Tax
  ('MAP-R2R-TAXREGIME-TAXREGIMEID', 'R2R', 'TaxRegime', 'taxRegimeId', 'ZX_REGIMES_B.TAX_REGIME_ID', 'T007A-MWSKZ(GROUP)', 'TaxAuthority.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXREGIME-CODE', 'R2R', 'TaxRegime', 'code', 'ZX_REGIMES_B.TAX_REGIME_CODE', 'T007A-MWSKZ', 'TaxAuthority.TaxAuthorityCode', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXREGIME-NAME', 'R2R', 'TaxRegime', 'name', 'ZX_REGIMES_TL.TAX_REGIME_NAME', 'T007A-TEXT1', 'TaxAuthority.Name', datetime('now'), datetime('now')),

  ('MAP-R2R-TAXCODE-TAXCODEID', 'R2R', 'TaxCode', 'taxCodeId', 'ZX_TAXES_B.TAX_ID', 'T007S-KALSM', 'TaxGroupData.TaxCode', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXCODE-CODE', 'R2R', 'TaxCode', 'code', 'ZX_TAXES_B.TAX', 'MWSKZ', 'TaxGroupData.TaxCode', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXCODE-TAXAPPLICABILITY', 'R2R', 'TaxCode', 'taxApplicability', 'ZX_TAXES_B.TAX_TYPE_CODE', 'T007A-KALSM', 'TaxGroupData.TaxDirection', datetime('now'), datetime('now')),

  ('MAP-R2R-TAXRATE-TAXRATEID', 'R2R', 'TaxRate', 'taxRateId', 'ZX_RATES_B.TAX_RATE_ID', 'T007A-MWSKZ+ALAND', 'TaxData.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXRATE-TAXCODEID', 'R2R', 'TaxRate', 'taxCodeId', 'ZX_RATES_B.TAX', 'MWSKZ', 'TaxData.TaxCode', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXRATE-RATEPERCENT', 'R2R', 'TaxRate', 'ratePercent', 'ZX_RATES_B.TAX_RATE', 'KBETR', 'TaxData.TaxValue', datetime('now'), datetime('now')),

  ('MAP-R2R-TAXACCOUNTMAPPING-TAXACCOUNTMAPPINGID', 'R2R', 'TaxAccountMapping', 'taxAccountMappingId', 'ZX_ACCOUNTS.TAX_ACCOUNT_ID', 'T030K-KONTS', 'TaxLedgerPostingGroup.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXACCOUNTMAPPING-TAXREGIMEID', 'R2R', 'TaxAccountMapping', 'taxRegimeId', 'ZX_ACCOUNTS.TAX_REGIME_CODE', 'T007A-MWSKZ', 'TaxAuthority.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXACCOUNTMAPPING-TAXCODEID', 'R2R', 'TaxAccountMapping', 'taxCodeId', 'ZX_ACCOUNTS.TAX', 'MWSKZ', 'TaxLedgerPostingGroup.TaxCode', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXACCOUNTMAPPING-ACCOUNTID', 'R2R', 'TaxAccountMapping', 'accountId', 'ZX_ACCOUNTS.ACCOUNT_CCID', 'T030K-KONTS', 'MainAccount.RecId', datetime('now'), datetime('now')),

  -- H2R additions beyond existing seed rows
  ('MAP-H2R-EMP-EMAIL', 'H2R', 'Employee', 'email', 'PER_EMAIL_ADDRESSES.EMAIL_ADDRESS', 'ADR6-SMTP_ADDR', 'DirPersonUserInfo.NetworkAlias', datetime('now'), datetime('now')),
  ('MAP-H2R-EMP-HIREDATE', 'H2R', 'Employee', 'hireDate', 'PER_ALL_ASSIGNMENTS_M.DATE_START', 'PA0000-BEGDA', 'HcmEmployment.StartDate', datetime('now'), datetime('now')),
  ('MAP-H2R-EMP-TERMINATIONDATE', 'H2R', 'Employee', 'terminationDate', 'PER_PERIODS_OF_SERVICE.ACTUAL_TERMINATION_DATE', 'PA0000-ENDDA', 'HcmEmployment.EndDate', datetime('now'), datetime('now')),

  ('MAP-H2R-POS-DEPARTMENT', 'H2R', 'Position', 'department', 'HR_ALL_ORGANIZATION_UNITS.NAME', 'CSKS-KOSTL', 'OMOperatingUnit.Name', datetime('now'), datetime('now')),
  ('MAP-H2R-POS-AUTHORITYDOMAIN', 'H2R', 'Position', 'authorityDomain', 'PER_JOBS.ATTRIBUTE_CATEGORY', 'HRP1000-OTYPE', 'HcmPositionType.PositionType', datetime('now'), datetime('now')),
  ('MAP-H2R-POS-AUTHORITYTIER', 'H2R', 'Position', 'authorityTier', 'PER_JOBS.ATTRIBUTE_NUMBER1', 'HRP1000-PLVAR', 'HcmPosition.HierarchyLevel', datetime('now'), datetime('now')),

  ('MAP-H2R-ASSIGNMENT-ASSIGNMENTID', 'H2R', 'Assignment', 'assignmentId', 'PER_ALL_ASSIGNMENTS_M.ASSIGNMENT_ID', 'PA0001-OBJPS', 'HcmPositionWorkerAssignment.RecId', datetime('now'), datetime('now')),
  ('MAP-H2R-ASSIGNMENT-EMPLOYEEID', 'H2R', 'Assignment', 'employeeId', 'PER_ALL_ASSIGNMENTS_M.PERSON_ID', 'PA0001-PERNR', 'HcmPositionWorkerAssignment.Worker', datetime('now'), datetime('now')),
  ('MAP-H2R-ASSIGNMENT-POSITIONID', 'H2R', 'Assignment', 'positionId', 'PER_ALL_ASSIGNMENTS_M.POSITION_ID', 'HRP1001-OBJID', 'HcmPositionWorkerAssignment.Position', datetime('now'), datetime('now')),
  ('MAP-H2R-ASSIGNMENT-STATE', 'H2R', 'Assignment', 'state', 'PER_ALL_ASSIGNMENTS_M.ASSIGNMENT_STATUS_TYPE_ID', 'PA0001-STAT2', 'HcmPositionWorkerAssignment.AssignmentStatus', datetime('now'), datetime('now')),
  ('MAP-H2R-ASSIGNMENT-DEPARTMENT', 'H2R', 'Assignment', 'department', 'PER_ALL_ASSIGNMENTS_M.ORGANIZATION_ID', 'PA0001-ORGEH', 'HcmPositionWorkerAssignment.Department', datetime('now'), datetime('now')),
  ('MAP-H2R-ASSIGNMENT-ROLE', 'H2R', 'Assignment', 'role', 'PER_JOBS.NAME', 'HRP1000-STEXT', 'HcmJob.Name', datetime('now'), datetime('now')),

  ('MAP-H2R-CRED-EMPLOYEEID', 'H2R', 'Credential', 'employeeId', 'PER_CERTIFICATIONS.PERSON_ID', 'PA0001-PERNR', 'HcmSkill.Worker', datetime('now'), datetime('now')),
  ('MAP-H2R-CRED-TYPE', 'H2R', 'Credential', 'type', 'PER_CERTIFICATIONS.CERTIFICATION_NAME', 'HRP1001-SUBTY', 'HcmSkillType.Name', datetime('now'), datetime('now')),
  ('MAP-H2R-CRED-STATUS', 'H2R', 'Credential', 'status', 'PER_CERTIFICATIONS.STATUS', 'HRP1001-ISTAT', 'HcmSkill.Status', datetime('now'), datetime('now')),

  ('MAP-H2R-AUTHRULE-RULEID', 'H2R', 'AuthorityRule', 'ruleId', 'AME_RULES.RULE_ID', 'GRACRULE-RULEID', 'WorkflowWorkItemTable.PolicyRuleId', datetime('now'), datetime('now')),
  ('MAP-H2R-AUTHRULE-DOMAIN', 'H2R', 'AuthorityRule', 'domain', 'AME_RULES.RULE_TYPE', 'GRACRULE-RULETYPE', 'WorkflowWorkItemTable.PolicyArea', datetime('now'), datetime('now')),
  ('MAP-H2R-AUTHRULE-THRESHOLD', 'H2R', 'AuthorityRule', 'threshold', 'AME_CONDITIONS.NUMERIC_VALUE', 'GRACLIMIT-LIMITAMT', 'WorkflowApprovalLimit.AmountMST', datetime('now'), datetime('now')),
  ('MAP-H2R-AUTHRULE-REQUIREDTIER', 'H2R', 'AuthorityRule', 'requiredTier', 'AME_APPROVER_GROUPS.ORDER_NUMBER', 'GRACROLE-LEVEL', 'WorkflowApprovalHierarchy.Level', datetime('now'), datetime('now')),

  -- O2C line entities
  ('MAP-O2C-QUOTELINE-QUOTELINEID', 'O2C', 'QuoteLine', 'quoteLineId', 'DOO_LINES_ALL.LINE_ID', 'CRMD_ORDERADM_I-GUID', 'SalesQuotationLine.RecId', datetime('now'), datetime('now')),
  ('MAP-O2C-QUOTELINE-QUOTEID', 'O2C', 'QuoteLine', 'quoteId', 'DOO_LINES_ALL.HEADER_ID', 'CRMD_ORDERADM_I-HEADER', 'SalesQuotationLine.QuotationId', datetime('now'), datetime('now')),
  ('MAP-O2C-QUOTELINE-SKU', 'O2C', 'QuoteLine', 'sku', 'DOO_LINES_ALL.INVENTORY_ITEM_ID', 'VBAP-MATNR', 'SalesQuotationLine.ItemId', datetime('now'), datetime('now')),
  ('MAP-O2C-QUOTELINE-QUANTITY', 'O2C', 'QuoteLine', 'quantity', 'DOO_LINES_ALL.ORDERED_QTY', 'VBAP-KWMENG', 'SalesQuotationLine.SalesQty', datetime('now'), datetime('now')),
  ('MAP-O2C-QUOTELINE-UNITPRICE', 'O2C', 'QuoteLine', 'unitPrice', 'DOO_LINES_ALL.UNIT_SELLING_PRICE', 'VBAP-NETPR', 'SalesQuotationLine.SalesPrice', datetime('now'), datetime('now')),
  ('MAP-O2C-QUOTELINE-LINETOTAL', 'O2C', 'QuoteLine', 'lineTotal', 'DOO_LINES_ALL.EXTENDED_AMOUNT', 'VBAP-NETWR', 'SalesQuotationLine.LineAmount', datetime('now'), datetime('now')),

  ('MAP-O2C-SALESORDERLINE-ORDERLINEID', 'O2C', 'SalesOrderLine', 'orderLineId', 'DOO_LINES_ALL.LINE_ID', 'VBAP-POSNR', 'SalesLine.RecId', datetime('now'), datetime('now')),
  ('MAP-O2C-SALESORDERLINE-ORDERID', 'O2C', 'SalesOrderLine', 'orderId', 'DOO_LINES_ALL.HEADER_ID', 'VBAP-VBELN', 'SalesLine.SalesId', datetime('now'), datetime('now')),
  ('MAP-O2C-SALESORDERLINE-SKU', 'O2C', 'SalesOrderLine', 'sku', 'DOO_LINES_ALL.INVENTORY_ITEM_ID', 'VBAP-MATNR', 'SalesLine.ItemId', datetime('now'), datetime('now')),
  ('MAP-O2C-SALESORDERLINE-QUANTITY', 'O2C', 'SalesOrderLine', 'quantity', 'DOO_LINES_ALL.ORDERED_QTY', 'VBAP-KWMENG', 'SalesLine.SalesQty', datetime('now'), datetime('now')),
  ('MAP-O2C-SALESORDERLINE-UNITPRICE', 'O2C', 'SalesOrderLine', 'unitPrice', 'DOO_LINES_ALL.UNIT_SELLING_PRICE', 'VBAP-NETPR', 'SalesLine.SalesPrice', datetime('now'), datetime('now')),
  ('MAP-O2C-SALESORDERLINE-LINETOTAL', 'O2C', 'SalesOrderLine', 'lineTotal', 'DOO_LINES_ALL.EXTENDED_AMOUNT', 'VBAP-NETWR', 'SalesLine.LineAmount', datetime('now'), datetime('now')),

  ('MAP-O2C-INVOICELINE-INVOICELINEID', 'O2C', 'InvoiceLine', 'invoiceLineId', 'RA_CUSTOMER_TRX_LINES_ALL.CUSTOMER_TRX_LINE_ID', 'VBRP-POSNR', 'CustInvoiceTrans.RecId', datetime('now'), datetime('now')),
  ('MAP-O2C-INVOICELINE-INVOICEID', 'O2C', 'InvoiceLine', 'invoiceId', 'RA_CUSTOMER_TRX_LINES_ALL.CUSTOMER_TRX_ID', 'VBRP-VBELN', 'CustInvoiceTrans.InvoiceId', datetime('now'), datetime('now')),
  ('MAP-O2C-INVOICELINE-ORDERLINEID', 'O2C', 'InvoiceLine', 'orderLineId', 'RA_CUSTOMER_TRX_LINES_ALL.SALES_ORDER_LINE', 'VBRP-AUPOS', 'CustInvoiceTrans.SalesLineRefRecId', datetime('now'), datetime('now')),
  ('MAP-O2C-INVOICELINE-SKU', 'O2C', 'InvoiceLine', 'sku', 'RA_CUSTOMER_TRX_LINES_ALL.INVENTORY_ITEM_ID', 'VBRP-MATNR', 'CustInvoiceTrans.ItemId', datetime('now'), datetime('now')),
  ('MAP-O2C-INVOICELINE-LINEPAYABLE', 'O2C', 'InvoiceLine', 'linePayable', 'RA_CUSTOMER_TRX_LINES_ALL.EXTENDED_AMOUNT', 'VBRP-NETWR+MWSBP', 'CustInvoiceTrans.LineAmount+TaxAmount', datetime('now'), datetime('now')),

  -- P2P line entities and goods receipt
  ('MAP-P2P-REQUISITIONLINE-REQUISITIONLINEID', 'P2P', 'RequisitionLine', 'requisitionLineId', 'POR_REQUISITION_LINES_ALL.REQUISITION_LINE_ID', 'EBAN-BNFPO', 'PurchReqLine.RecId', datetime('now'), datetime('now')),
  ('MAP-P2P-REQUISITIONLINE-REQUISITIONID', 'P2P', 'RequisitionLine', 'requisitionId', 'POR_REQUISITION_LINES_ALL.REQUISITION_HEADER_ID', 'EBAN-BANFN', 'PurchReqLine.PurchReqId', datetime('now'), datetime('now')),
  ('MAP-P2P-REQUISITIONLINE-DESCRIPTION', 'P2P', 'RequisitionLine', 'description', 'POR_REQUISITION_LINES_ALL.ITEM_DESCRIPTION', 'EBAN-TXZ01', 'PurchReqLine.Name', datetime('now'), datetime('now')),
  ('MAP-P2P-REQUISITIONLINE-QUANTITY', 'P2P', 'RequisitionLine', 'quantity', 'POR_REQUISITION_LINES_ALL.QUANTITY', 'EBAN-MENGE', 'PurchReqLine.PurchQty', datetime('now'), datetime('now')),
  ('MAP-P2P-REQUISITIONLINE-LINETOTAL', 'P2P', 'RequisitionLine', 'lineTotal', 'POR_REQUISITION_LINES_ALL.AMOUNT', 'EBAN-PREIS', 'PurchReqLine.LineAmount', datetime('now'), datetime('now')),

  ('MAP-P2P-POLINE-POLINEID', 'P2P', 'PurchaseOrderLine', 'poLineId', 'PO_LINES_ALL.PO_LINE_ID', 'EKPO-EBELP', 'PurchLine.RecId', datetime('now'), datetime('now')),
  ('MAP-P2P-POLINE-POID', 'P2P', 'PurchaseOrderLine', 'poId', 'PO_LINES_ALL.PO_HEADER_ID', 'EKPO-EBELN', 'PurchLine.PurchId', datetime('now'), datetime('now')),
  ('MAP-P2P-POLINE-DESCRIPTION', 'P2P', 'PurchaseOrderLine', 'description', 'PO_LINES_ALL.ITEM_DESCRIPTION', 'EKPO-TXZ01', 'PurchLine.Name', datetime('now'), datetime('now')),
  ('MAP-P2P-POLINE-QUANTITY', 'P2P', 'PurchaseOrderLine', 'quantity', 'PO_LINES_ALL.QUANTITY', 'EKPO-MENGE', 'PurchLine.PurchQty', datetime('now'), datetime('now')),
  ('MAP-P2P-POLINE-LINETOTAL', 'P2P', 'PurchaseOrderLine', 'lineTotal', 'PO_LINES_ALL.AMOUNT', 'EKPO-NETWR', 'PurchLine.LineAmount', datetime('now'), datetime('now')),

  ('MAP-P2P-GOODSRECEIPT-RECEIPTID', 'P2P', 'GoodsReceipt', 'receiptId', 'RCV_SHIPMENT_HEADERS.SHIPMENT_HEADER_ID', 'MKPF-MBLNR', 'InventTransOrigin.RecId', datetime('now'), datetime('now')),
  ('MAP-P2P-GOODSRECEIPT-POID', 'P2P', 'GoodsReceipt', 'poId', 'RCV_SHIPMENT_LINES.PO_HEADER_ID', 'MSEG-EBELN', 'PurchTable.PurchId', datetime('now'), datetime('now')),
  ('MAP-P2P-GOODSRECEIPT-STATE', 'P2P', 'GoodsReceipt', 'state', 'RCV_TRANSACTIONS.TRANSACTION_STATUS_CODE', 'EKBE-BEWTP', 'InventTrans.StatusReceipt', datetime('now'), datetime('now')),
  ('MAP-P2P-GOODSRECEIPT-RECEIVEDAT', 'P2P', 'GoodsReceipt', 'receivedAt', 'RCV_TRANSACTIONS.TRANSACTION_DATE', 'MKPF-BUDAT', 'InventTrans.DatePhysical', datetime('now'), datetime('now')),

  -- R2R additional entities
  ('MAP-R2R-LEDGERENTRY-LEDGERENTRYID', 'R2R', 'LedgerEntry', 'ledgerEntryId', 'GL_JE_LINES.JE_LINE_ID', 'ACDOCA-RBUZEI', 'GeneralJournalAccountEntry.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-LEDGERENTRY-JOURNALID', 'R2R', 'LedgerEntry', 'journalId', 'GL_JE_LINES.JE_HEADER_ID', 'ACDOCA-BELNR', 'GeneralJournalEntry.SubledgerVoucher', datetime('now'), datetime('now')),
  ('MAP-R2R-LEDGERENTRY-ACCOUNTID', 'R2R', 'LedgerEntry', 'accountId', 'GL_JE_LINES.CODE_COMBINATION_ID', 'ACDOCA-RACCT', 'LedgerDimensionFacade.MainAccount', datetime('now'), datetime('now')),
  ('MAP-R2R-LEDGERENTRY-POSTINGDATE', 'R2R', 'LedgerEntry', 'postingDate', 'GL_JE_HEADERS.DEFAULT_EFFECTIVE_DATE', 'BKPF-BUDAT', 'GeneralJournalEntry.AccountingDate', datetime('now'), datetime('now')),

  ('MAP-R2R-TRIALBALANCE-TRIALBALANCEROWID', 'R2R', 'TrialBalanceRow', 'trialBalanceRowId', 'GL_BALANCES.BALANCE_ID', 'FAGLFLEXT-RACCT+RBUKRS+POPER', 'LedgerTrialBalanceStaging.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-TRIALBALANCE-FISCALPERIODID', 'R2R', 'TrialBalanceRow', 'fiscalPeriodId', 'GL_BALANCES.PERIOD_NAME', 'FAGLFLEXT-POPER', 'LedgerTrialBalanceStaging.FiscalPeriod', datetime('now'), datetime('now')),
  ('MAP-R2R-TRIALBALANCE-ACCOUNTID', 'R2R', 'TrialBalanceRow', 'accountId', 'GL_BALANCES.CODE_COMBINATION_ID', 'FAGLFLEXT-RACCT', 'LedgerTrialBalanceStaging.MainAccount', datetime('now'), datetime('now')),

  ('MAP-R2R-LEDGERSET-LEDGERSETID', 'R2R', 'LedgerSet', 'ledgerSetId', 'GL_LEDGER_SET_ASSIGNMENTS.LEDGER_SET_ID', 'FINS_LEDGER_SET-SETID', 'LedgerSet.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-LEDGERSET-NAME', 'R2R', 'LedgerSet', 'name', 'GL_LEDGER_SET_ASSIGNMENTS.LEDGER_SET_NAME', 'FINS_LEDGER_SET-NAME', 'LedgerSet.Name', datetime('now'), datetime('now')),

  ('MAP-R2R-LEDGERSETMEMBER-LEDGERSETID', 'R2R', 'LedgerSetMember', 'ledgerSetId', 'GL_LEDGER_SET_NORM_ASSIGN_V.LEDGER_SET_ID', 'FINS_LEDGER_SET-SETID', 'LedgerSetMember.LedgerSet', datetime('now'), datetime('now')),
  ('MAP-R2R-LEDGERSETMEMBER-LEDGERID', 'R2R', 'LedgerSetMember', 'ledgerId', 'GL_LEDGER_SET_NORM_ASSIGN_V.LEDGER_ID', 'FINS_LEDGER_SET-LEDGER', 'LedgerSetMember.Ledger', datetime('now'), datetime('now')),

  ('MAP-R2R-COASEGDEF-SEGMENTDEFINITIONID', 'R2R', 'COASegmentDefinition', 'segmentDefinitionId', 'FND_ID_FLEX_SEGMENTS.APPLICATION_COLUMN_NAME', 'SKA1-FSTAG', 'DimensionAttribute.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-COASEGDEF-CODE', 'R2R', 'COASegmentDefinition', 'code', 'FND_ID_FLEX_SEGMENTS.SEGMENT_NAME', 'SKA1-FSTAG', 'DimensionAttribute.Name', datetime('now'), datetime('now')),
  ('MAP-R2R-COASEGDEF-SORTORDER', 'R2R', 'COASegmentDefinition', 'sortOrder', 'FND_ID_FLEX_SEGMENTS.SEGMENT_NUM', 'FINSC_LEDGER-SEGNR', 'DimensionAttribute.SortOrder', datetime('now'), datetime('now')),

  ('MAP-R2R-ACCSEGVAL-ACCOUNTID', 'R2R', 'AccountSegmentValue', 'accountId', 'GL_CODE_COMBINATIONS.CODE_COMBINATION_ID', 'SKA1-SAKNR', 'MainAccount.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-ACCSEGVAL-SEGMENTDEFINITIONID', 'R2R', 'AccountSegmentValue', 'segmentDefinitionId', 'FND_ID_FLEX_SEGMENTS.APPLICATION_COLUMN_NAME', 'SKA1-FSTAG', 'DimensionAttribute.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-ACCSEGVAL-SEGMENTVALUE', 'R2R', 'AccountSegmentValue', 'segmentValue', 'GL_CODE_COMBINATIONS.SEGMENTx', 'SKB1-SAKNR', 'DimensionAttributeValue.Value', datetime('now'), datetime('now')),

  ('MAP-R2R-COARULE-RULEID', 'R2R', 'COACombinationRule', 'ruleId', 'GL_CROSS_VALIDATION_RULES.CROSS_VALIDATION_RULE_ID', 'GB01-RULEID', 'DimensionValidationRule.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-COARULE-NAME', 'R2R', 'COACombinationRule', 'name', 'GL_CROSS_VALIDATION_RULES.NAME', 'GB01-BEZEI', 'DimensionValidationRule.Name', datetime('now'), datetime('now')),
  ('MAP-R2R-COARULE-ISACTIVE', 'R2R', 'COACombinationRule', 'isActive', 'GL_CROSS_VALIDATION_RULES.ENABLED_FLAG', 'GB01-AKTIV', 'DimensionValidationRule.IsActive', datetime('now'), datetime('now')),

  ('MAP-R2R-COARULECOND-CONDITIONID', 'R2R', 'COACombinationRuleCondition', 'conditionId', 'GL_CROSS_VALIDATION_LINES.RULE_LINE_ID', 'GB92-LFDNR', 'DimensionValidationRuleLine.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-COARULECOND-RULEID', 'R2R', 'COACombinationRuleCondition', 'ruleId', 'GL_CROSS_VALIDATION_LINES.CROSS_VALIDATION_RULE_ID', 'GB01-RULEID', 'DimensionValidationRuleLine.Rule', datetime('now'), datetime('now')),
  ('MAP-R2R-COARULECOND-EXPECTEDVALUE', 'R2R', 'COACombinationRuleCondition', 'expectedValue', 'GL_CROSS_VALIDATION_LINES.INCLUDE_LOW', 'GB92-LOW', 'DimensionValidationRuleLine.ExpectedValue', datetime('now'), datetime('now')),

  ('MAP-R2R-SLAPROFILELINE-POSTINGPROFILELINEID', 'R2R', 'SLAPostingProfileLine', 'postingProfileLineId', 'XLA_AAD_LINE_DEFINITIONS.LINE_DEFINITION_CODE', 'GB02-LFDNR', 'LedgerPostingSetupLine.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-SLAPROFILELINE-POSTINGPROFILEID', 'R2R', 'SLAPostingProfileLine', 'postingProfileId', 'XLA_AAD_LINE_DEFINITIONS.AAD_HEADER_ID', 'GB01-PROFILE', 'LedgerPostingSetupLine.PostingProfile', datetime('now'), datetime('now')),
  ('MAP-R2R-SLAPROFILELINE-ENTRYSIDE', 'R2R', 'SLAPostingProfileLine', 'entrySide', 'XLA_AAD_LINE_DEFINITIONS.DR_CR_CODE', 'SHKZG', 'LedgerPostingSetupLine.EntrySide', datetime('now'), datetime('now')),
  ('MAP-R2R-SLAPROFILELINE-ACCOUNTID', 'R2R', 'SLAPostingProfileLine', 'accountId', 'XLA_AAD_LINE_DEFINITIONS.CODE_COMBINATION_ID', 'HKONT', 'LedgerPostingSetupLine.MainAccount', datetime('now'), datetime('now')),

  ('MAP-R2R-TAXJURISDICTION-TAXJURISDICTIONID', 'R2R', 'TaxJurisdiction', 'taxJurisdictionId', 'ZX_JURISDICTIONS_B.TAX_JURISDICTION_ID', 'TTXJ-TXJCD', 'TaxJurisdiction.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXJURISDICTION-TAXREGIMEID', 'R2R', 'TaxJurisdiction', 'taxRegimeId', 'ZX_JURISDICTIONS_B.TAX_REGIME_CODE', 'T007A-MWSKZ', 'TaxAuthority.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXJURISDICTION-COUNTRYCODE', 'R2R', 'TaxJurisdiction', 'countryCode', 'ZX_JURISDICTIONS_B.COUNTRY_CODE', 'T005-LAND1', 'TaxJurisdiction.CountryRegionId', datetime('now'), datetime('now')),

  ('MAP-R2R-TAXRULE-TAXRULEID', 'R2R', 'TaxRule', 'taxRuleId', 'ZX_RULES_B.TAX_RULE_ID', 'FI_TAX_RULE-RULEID', 'TaxCalculationRule.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXRULE-TAXREGIMEID', 'R2R', 'TaxRule', 'taxRegimeId', 'ZX_RULES_B.TAX_REGIME_CODE', 'T007A-MWSKZ', 'TaxAuthority.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXRULE-CODE', 'R2R', 'TaxRule', 'code', 'ZX_RULES_B.TAX_RULE_CODE', 'FI_TAX_RULE-CODE', 'TaxCalculationRule.Code', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXRULE-TAXCODEID', 'R2R', 'TaxRule', 'taxCodeId', 'ZX_RULES_B.TAX', 'MWSKZ', 'TaxCalculationRule.TaxCode', datetime('now'), datetime('now')),

  ('MAP-R2R-TAXTXNLINE-TAXTRANSACTIONLINEID', 'R2R', 'TaxTransactionLine', 'taxTransactionLineId', 'ZX_LINES.SUMMARY_TAX_LINE_ID', 'BSET-TAXPS', 'TaxTrans.RecId', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXTXNLINE-SOURCEDOMAIN', 'R2R', 'TaxTransactionLine', 'sourceDomain', 'ZX_LINES.APPLICATION_ID', 'AWKEY', 'TaxTrans.SourceTableId', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXTXNLINE-SOURCEENTITYID', 'R2R', 'TaxTransactionLine', 'sourceEntityId', 'ZX_LINES.TRX_ID', 'BELNR', 'TaxTrans.SourceRecId', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXTXNLINE-TAXCODEID', 'R2R', 'TaxTransactionLine', 'taxCodeId', 'ZX_LINES.TAX', 'MWSKZ', 'TaxTrans.TaxCode', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXTXNLINE-TAXAMOUNT', 'R2R', 'TaxTransactionLine', 'taxAmount', 'ZX_LINES.TAX_AMT', 'BSET-WMWST', 'TaxTrans.SourceTaxAmountCur', datetime('now'), datetime('now')),
  ('MAP-R2R-TAXTXNLINE-CURRENCYCODE', 'R2R', 'TaxTransactionLine', 'currencyCode', 'ZX_LINES.TAX_CURRENCY_CODE', 'BKPF-WAERS', 'TaxTrans.CurrencyCode', datetime('now'), datetime('now'));
