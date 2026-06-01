-- Canonical process catalog with per-system implementation mappings.
-- Covers all six domains: O2C, P2P, R2R, H2R, INV, PROJ.
-- Additive and idempotent via INSERT OR IGNORE.

-- ---------------------------------------------------------------------------
-- Canonical processes
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO erp_process(process_id, domain, process_name, canonical_command, description, sequence_order, created_at, updated_at)
VALUES
  -- O2C
  ('O2C-ONBOARD-CUSTOMER',       'O2C', 'Onboard Customer',         'createCustomer',       'Register a new customer in the system.',                            10, datetime('now'), datetime('now')),
  ('O2C-CREATE-QUOTE',           'O2C', 'Create Quote',             'createQuote',          'Prepare a sales quote for a customer.',                             20, datetime('now'), datetime('now')),
  ('O2C-CONVERT-QUOTE-TO-ORDER', 'O2C', 'Convert Quote to Order',   'convertQuoteToOrder',  'Accept a quote and create a confirmed sales order.',                30, datetime('now'), datetime('now')),
  ('O2C-FULFILL-ORDER',          'O2C', 'Fulfil Order / Ship',      'shipOrder',            'Pick, pack and dispatch goods against a sales order.',              40, datetime('now'), datetime('now')),
  ('O2C-INVOICE-CUSTOMER',       'O2C', 'Invoice Customer',         'createInvoice',        'Generate an AR invoice after fulfilment.',                          50, datetime('now'), datetime('now')),
  ('O2C-COLLECT-PAYMENT',        'O2C', 'Collect Payment',          'recordPayment',        'Apply a customer payment against an open invoice.',                 60, datetime('now'), datetime('now')),

  -- P2P
  ('P2P-ONBOARD-SUPPLIER',       'P2P', 'Onboard Supplier',         'createSupplier',       'Register a new supplier in the system.',                            10, datetime('now'), datetime('now')),
  ('P2P-CREATE-REQUISITION',     'P2P', 'Create Purchase Requisition','createRequisition',  'Employee raises a request to purchase goods or services.',          20, datetime('now'), datetime('now')),
  ('P2P-APPROVE-REQUISITION',    'P2P', 'Approve Requisition',      'approveRequisition',   'Manager or system approves the purchase requisition.',              30, datetime('now'), datetime('now')),
  ('P2P-CREATE-PO',              'P2P', 'Create Purchase Order',    'createPurchaseOrder',  'Purchasing converts approved requisition to a formal PO.',          40, datetime('now'), datetime('now')),
  ('P2P-RECEIVE-GOODS',          'P2P', 'Receive Goods',            'receiveGoods',         'Warehouse records goods received against a PO.',                    50, datetime('now'), datetime('now')),
  ('P2P-PROCESS-SUPPLIER-INVOICE','P2P','Process Supplier Invoice',  'matchInvoice',         'Three-way match: PO, receipt, and supplier invoice.',               60, datetime('now'), datetime('now')),
  ('P2P-PAY-SUPPLIER',           'P2P', 'Pay Supplier',             'makePayment',          'Approve and execute payment to supplier.',                          70, datetime('now'), datetime('now')),

  -- R2R
  ('R2R-DEFINE-COA',             'R2R', 'Define Chart of Accounts',  'defineCoA',           'Set up account structure, segments, and combinations.',             10, datetime('now'), datetime('now')),
  ('R2R-DEFINE-FISCAL-CALENDAR', 'R2R', 'Define Fiscal Calendar',   'defineFiscalCalendar', 'Configure fiscal years and accounting periods.',                    20, datetime('now'), datetime('now')),
  ('R2R-POST-JOURNAL',           'R2R', 'Post Journal Entry',        'postJournal',          'Record a manual or system-generated journal entry.',                30, datetime('now'), datetime('now')),
  ('R2R-PERIOD-CLOSE',           'R2R', 'Period Close',              'closePeriod',          'Run period-end tasks and lock the accounting period.',              40, datetime('now'), datetime('now')),
  ('R2R-RUN-TRIAL-BALANCE',      'R2R', 'Run Trial Balance',         'runTrialBalance',      'Generate trial balance to verify debits equal credits.',            50, datetime('now'), datetime('now')),
  ('R2R-FINANCIAL-REPORTING',    'R2R', 'Financial Reporting',       'generateReport',       'Produce P&L, Balance Sheet, and cash flow statements.',             60, datetime('now'), datetime('now')),
  ('R2R-REVALUE-FX',             'R2R', 'FX Revaluation',            'revalueFX',            'Revalue open foreign-currency balances at period-end rates.',       70, datetime('now'), datetime('now')),

  -- H2R
  ('H2R-CREATE-POSITION',        'H2R', 'Create Position',           'createPosition',       'Define a new organisational position.',                             10, datetime('now'), datetime('now')),
  ('H2R-HIRE-EMPLOYEE',          'H2R', 'Hire Employee',             'hireEmployee',         'Onboard a new employee into an open position.',                     20, datetime('now'), datetime('now')),
  ('H2R-MANAGE-ASSIGNMENT',      'H2R', 'Manage Assignment',         'updateAssignment',     'Reassign employee to a different position or department.',          30, datetime('now'), datetime('now')),
  ('H2R-TERMINATE-EMPLOYEE',     'H2R', 'Terminate Employee',        'terminateEmployee',    'Process an employee departure and close the assignment.',           40, datetime('now'), datetime('now')),

  -- INV
  ('INV-DEFINE-SKU',             'INV', 'Define SKU / Item Master',  'createSKU',            'Set up a new stocked item with valuation and UOM.',                 10, datetime('now'), datetime('now')),
  ('INV-RECEIVE-STOCK',          'INV', 'Receive Stock',             'receiveStock',         'Record inbound inventory receipt into a warehouse location.',        20, datetime('now'), datetime('now')),
  ('INV-ISSUE-STOCK',            'INV', 'Issue Stock',               'issueStock',           'Issue goods from stock for production or sale.',                    30, datetime('now'), datetime('now')),
  ('INV-TRANSFER-STOCK',         'INV', 'Transfer Stock',            'transferStock',        'Move inventory between organisations or locations.',                40, datetime('now'), datetime('now')),
  ('INV-CYCLE-COUNT',            'INV', 'Cycle Count',               'performCycleCount',    'Periodic physical count to reconcile book vs actual quantities.',    50, datetime('now'), datetime('now')),
  ('INV-ADJUST-STOCK',           'INV', 'Inventory Adjustment',      'adjustInventory',      'Correct on-hand quantities after count discrepancy.',               60, datetime('now'), datetime('now')),

  -- PROJ
  ('PROJ-CREATE-PROJECT',        'PROJ','Create Project',            'createProject',        'Initialise a new project in Draft state.',                          10, datetime('now'), datetime('now')),
  ('PROJ-ACTIVATE-PROJECT',      'PROJ','Activate Project',          'activateProject',      'Transition project from Draft to Active.',                          20, datetime('now'), datetime('now')),
  ('PROJ-BUDGET-PROJECT',        'PROJ','Budget Project',            'setProjectBudget',     'Set or revise the approved project budget.',                        30, datetime('now'), datetime('now')),
  ('PROJ-CAPTURE-COSTS',         'PROJ','Capture Project Costs',     'recordProjectCost',    'Book labour, material, and overhead costs against the project.',    40, datetime('now'), datetime('now')),
  ('PROJ-COMPLETE-PROJECT',      'PROJ','Complete Project',          'completeProject',      'Close the project and finalise cost settlement.',                   50, datetime('now'), datetime('now'));

-- ---------------------------------------------------------------------------
-- Process steps — O2C: Fulfill Order
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO erp_process_step(step_id, process_id, step_name, description, sequence_order, created_at, updated_at)
VALUES
  ('O2C-FULFILL-STEP-01', 'O2C-FULFILL-ORDER', 'Reserve Inventory',    'Check and reserve stock for the order lines.',               10, datetime('now'), datetime('now')),
  ('O2C-FULFILL-STEP-02', 'O2C-FULFILL-ORDER', 'Pick',                 'Warehouse operator picks items to the staging area.',        20, datetime('now'), datetime('now')),
  ('O2C-FULFILL-STEP-03', 'O2C-FULFILL-ORDER', 'Pack',                 'Pack items and generate packing list.',                      30, datetime('now'), datetime('now')),
  ('O2C-FULFILL-STEP-04', 'O2C-FULFILL-ORDER', 'Ship / Post Delivery', 'Hand to carrier and record actual ship date.',               40, datetime('now'), datetime('now'));

-- ---------------------------------------------------------------------------
-- Process steps — P2P: Receive Goods
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO erp_process_step(step_id, process_id, step_name, description, sequence_order, created_at, updated_at)
VALUES
  ('P2P-RECEIVE-STEP-01', 'P2P-RECEIVE-GOODS', 'Inbound Inspection',   'Inspect goods against PO lines for quantity and quality.',   10, datetime('now'), datetime('now')),
  ('P2P-RECEIVE-STEP-02', 'P2P-RECEIVE-GOODS', 'Post Goods Receipt',   'Record GR in the system; triggers inventory and accounting.', 20, datetime('now'), datetime('now')),
  ('P2P-RECEIVE-STEP-03', 'P2P-RECEIVE-GOODS', 'Return to Supplier',   'If rejected, raise a return delivery against the PO.',       30, datetime('now'), datetime('now'));

-- ---------------------------------------------------------------------------
-- Process steps — P2P: Process Supplier Invoice (3-way match)
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO erp_process_step(step_id, process_id, step_name, description, sequence_order, created_at, updated_at)
VALUES
  ('P2P-INVOICE-STEP-01', 'P2P-PROCESS-SUPPLIER-INVOICE', 'Register Invoice',  'Enter supplier invoice into Accounts Payable.',            10, datetime('now'), datetime('now')),
  ('P2P-INVOICE-STEP-02', 'P2P-PROCESS-SUPPLIER-INVOICE', 'Three-Way Match',   'Match invoice quantity and price to PO and GR.',            20, datetime('now'), datetime('now')),
  ('P2P-INVOICE-STEP-03', 'P2P-PROCESS-SUPPLIER-INVOICE', 'Resolve Exceptions','Handle price/quantity tolerances or missing receipts.',     30, datetime('now'), datetime('now')),
  ('P2P-INVOICE-STEP-04', 'P2P-PROCESS-SUPPLIER-INVOICE', 'Post Invoice',      'Post AP liability and clear GR/IR clearing account.',       40, datetime('now'), datetime('now'));

-- ---------------------------------------------------------------------------
-- Process steps — R2R: Period Close
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO erp_process_step(step_id, process_id, step_name, description, sequence_order, created_at, updated_at)
VALUES
  ('R2R-CLOSE-STEP-01', 'R2R-PERIOD-CLOSE', 'Subledger Reconciliation', 'Reconcile AR, AP, inventory subledgers to GL.',               10, datetime('now'), datetime('now')),
  ('R2R-CLOSE-STEP-02', 'R2R-PERIOD-CLOSE', 'Accruals & Prepayments',   'Post period-end accruals and reverse prior prepayments.',      20, datetime('now'), datetime('now')),
  ('R2R-CLOSE-STEP-03', 'R2R-PERIOD-CLOSE', 'Depreciation',             'Run fixed-asset depreciation.',                               30, datetime('now'), datetime('now')),
  ('R2R-CLOSE-STEP-04', 'R2R-PERIOD-CLOSE', 'FX Revaluation',           'Revalue open foreign-currency items.',                        40, datetime('now'), datetime('now')),
  ('R2R-CLOSE-STEP-05', 'R2R-PERIOD-CLOSE', 'Lock Period',              'Close the accounting period to prevent further posting.',      50, datetime('now'), datetime('now'));

-- ---------------------------------------------------------------------------
-- Process system mappings — Oracle Fusion (FUSION)
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO erp_process_system_mapping(id, process_id, step_id, system_id, erp_process_name, erp_transaction_code, erp_module, mapping_status, notes, created_at, updated_at)
VALUES
  -- O2C
  ('PSM-FUSION-O2C-ONBOARD-CUSTOMER',        'O2C-ONBOARD-CUSTOMER',        NULL, 'FUSION', 'Create Customer',                 'Trading Community Architecture > Parties',       'Trading Community Architecture', 'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-FUSION-O2C-CREATE-QUOTE',            'O2C-CREATE-QUOTE',            NULL, 'FUSION', 'Create Opportunity / Quote',      'Order Management > Quotes',                      'Order Management',               'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-FUSION-O2C-CONVERT-QUOTE-TO-ORDER',  'O2C-CONVERT-QUOTE-TO-ORDER',  NULL, 'FUSION', 'Submit Sales Order',              'Order Management > Sales Orders',                'Order Management',               'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-FUSION-O2C-FULFILL-ORDER',           'O2C-FULFILL-ORDER',           NULL, 'FUSION', 'Ship Confirm',                    'Shipping > Delivery',                            'Shipping Execution',             'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-FUSION-O2C-INVOICE-CUSTOMER',        'O2C-INVOICE-CUSTOMER',        NULL, 'FUSION', 'Auto Invoice / Manual Invoice',   'Accounts Receivable > Invoices',                 'Accounts Receivable',            'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-FUSION-O2C-COLLECT-PAYMENT',         'O2C-COLLECT-PAYMENT',         NULL, 'FUSION', 'Apply Receipt',                   'Accounts Receivable > Receipts',                 'Accounts Receivable',            'MAPPED', NULL, datetime('now'), datetime('now')),
  -- P2P
  ('PSM-FUSION-P2P-ONBOARD-SUPPLIER',        'P2P-ONBOARD-SUPPLIER',        NULL, 'FUSION', 'Create Supplier',                 'Suppliers > Create Supplier',                    'Supplier Model',                 'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-FUSION-P2P-CREATE-REQUISITION',      'P2P-CREATE-REQUISITION',      NULL, 'FUSION', 'Create Requisition',              'Purchasing > Requisitions',                      'Self Service Procurement',       'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-FUSION-P2P-APPROVE-REQUISITION',     'P2P-APPROVE-REQUISITION',     NULL, 'FUSION', 'Approve Requisition',             'Notifications > Approve',                        'Approval Management',            'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-FUSION-P2P-CREATE-PO',               'P2P-CREATE-PO',               NULL, 'FUSION', 'Create Purchase Order',           'Purchasing > Purchase Orders',                   'Procurement',                    'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-FUSION-P2P-RECEIVE-GOODS',           'P2P-RECEIVE-GOODS',           NULL, 'FUSION', 'Receive Items',                   'Receiving > Receive Items',                      'Receiving',                      'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-FUSION-P2P-PROCESS-SUPPLIER-INVOICE','P2P-PROCESS-SUPPLIER-INVOICE',NULL, 'FUSION', 'Match Invoice to PO',             'Accounts Payable > Invoices',                    'Accounts Payable',               'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-FUSION-P2P-PAY-SUPPLIER',            'P2P-PAY-SUPPLIER',            NULL, 'FUSION', 'Create Payment',                  'Accounts Payable > Payments',                    'Accounts Payable',               'MAPPED', NULL, datetime('now'), datetime('now')),
  -- R2R
  ('PSM-FUSION-R2R-DEFINE-COA',              'R2R-DEFINE-COA',              NULL, 'FUSION', 'Manage Chart of Accounts',        'General Ledger > Chart of Accounts',             'General Ledger',                 'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-FUSION-R2R-POST-JOURNAL',            'R2R-POST-JOURNAL',            NULL, 'FUSION', 'Create Journal Entry',            'General Ledger > Journals > Create',             'General Ledger',                 'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-FUSION-R2R-PERIOD-CLOSE',            'R2R-PERIOD-CLOSE',            NULL, 'FUSION', 'Close Period',                    'General Ledger > Accounting Calendar',           'General Ledger',                 'MAPPED', 'Uses Accounting Close workflow with checklist.', datetime('now'), datetime('now')),
  ('PSM-FUSION-R2R-REVALUE-FX',              'R2R-REVALUE-FX',              NULL, 'FUSION', 'Revalue Open Items',              'General Ledger > Period Close > Revaluation',    'General Ledger',                 'MAPPED', NULL, datetime('now'), datetime('now')),
  -- H2R
  ('PSM-FUSION-H2R-HIRE-EMPLOYEE',           'H2R-HIRE-EMPLOYEE',           NULL, 'FUSION', 'Add Person / New Hire',           'My Team > Add Person',                           'Human Capital Management',       'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-FUSION-H2R-TERMINATE-EMPLOYEE',      'H2R-TERMINATE-EMPLOYEE',      NULL, 'FUSION', 'Terminate Employment',            'My Team > Terminate',                            'Human Capital Management',       'MAPPED', NULL, datetime('now'), datetime('now')),
  -- PROJ
  ('PSM-FUSION-PROJ-CREATE-PROJECT',         'PROJ-CREATE-PROJECT',         NULL, 'FUSION', 'Create Project',                  'Project Management > Projects > Create',         'Project Portfolio Management',   'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-FUSION-PROJ-BUDGET-PROJECT',         'PROJ-BUDGET-PROJECT',         NULL, 'FUSION', 'Manage Project Budget',           'Project Financial Management > Budget',          'Project Financial Management',   'MAPPED', NULL, datetime('now'), datetime('now'));

-- ---------------------------------------------------------------------------
-- Process system mappings — SAP S/4HANA (SAP_S4)
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO erp_process_system_mapping(id, process_id, step_id, system_id, erp_process_name, erp_transaction_code, erp_module, mapping_status, notes, created_at, updated_at)
VALUES
  -- O2C
  ('PSM-SAPS4-O2C-ONBOARD-CUSTOMER',        'O2C-ONBOARD-CUSTOMER',        NULL, 'SAP_S4', 'Create Customer (Business Partner)', 'BP',      'Business Partner (BP)',          'MAPPED', 'S/4HANA uses unified Business Partner replacing XD01/VD01.', datetime('now'), datetime('now')),
  ('PSM-SAPS4-O2C-CREATE-QUOTE',            'O2C-CREATE-QUOTE',            NULL, 'SAP_S4', 'Create Quotation',                   'VA21',    'Sales & Distribution (SD)',      'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-SAPS4-O2C-CONVERT-QUOTE-TO-ORDER',  'O2C-CONVERT-QUOTE-TO-ORDER',  NULL, 'SAP_S4', 'Create Sales Order (from quote)',    'VA01',    'Sales & Distribution (SD)',      'MAPPED', 'Reference quotation in VA01 header; document flow tracked in VBFA.', datetime('now'), datetime('now')),
  ('PSM-SAPS4-O2C-FULFILL-ORDER',           'O2C-FULFILL-ORDER',           NULL, 'SAP_S4', 'Create Outbound Delivery + PGI',     'VL01N / VL02N', 'Logistics Execution (LE)',  'MAPPED', 'Post Goods Issue (PGI) via VL02N triggers inventory and COGS posting.', datetime('now'), datetime('now')),
  ('PSM-SAPS4-O2C-INVOICE-CUSTOMER',        'O2C-INVOICE-CUSTOMER',        NULL, 'SAP_S4', 'Create Billing Document',            'VF01',    'Sales & Distribution (SD)',      'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-SAPS4-O2C-COLLECT-PAYMENT',         'O2C-COLLECT-PAYMENT',         NULL, 'SAP_S4', 'Post Incoming Payment',              'F-28 / F-32', 'Financial Accounting (FI)', 'MAPPED', NULL, datetime('now'), datetime('now')),
  -- P2P
  ('PSM-SAPS4-P2P-ONBOARD-SUPPLIER',        'P2P-ONBOARD-SUPPLIER',        NULL, 'SAP_S4', 'Create Vendor (Business Partner)',   'BP',      'Business Partner (BP)',          'MAPPED', 'Unified BP replaces MK01/FK01 in S/4HANA.', datetime('now'), datetime('now')),
  ('PSM-SAPS4-P2P-CREATE-REQUISITION',      'P2P-CREATE-REQUISITION',      NULL, 'SAP_S4', 'Create Purchase Requisition',        'ME51N',   'Materials Management (MM)',      'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-SAPS4-P2P-APPROVE-REQUISITION',     'P2P-APPROVE-REQUISITION',     NULL, 'SAP_S4', 'Release Purchase Requisition',       'ME54N',   'Materials Management (MM)',      'MAPPED', 'Uses release strategy (classification-based).', datetime('now'), datetime('now')),
  ('PSM-SAPS4-P2P-CREATE-PO',               'P2P-CREATE-PO',               NULL, 'SAP_S4', 'Create Purchase Order',              'ME21N',   'Materials Management (MM)',      'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-SAPS4-P2P-RECEIVE-GOODS',           'P2P-RECEIVE-GOODS',           NULL, 'SAP_S4', 'Post Goods Receipt for PO',          'MIGO',    'Materials Management (MM)',      'MAPPED', 'Movement type 101 for GR; updates MARD and posts to GR/IR clearing.', datetime('now'), datetime('now')),
  ('PSM-SAPS4-P2P-PROCESS-SUPPLIER-INVOICE','P2P-PROCESS-SUPPLIER-INVOICE',NULL, 'SAP_S4', 'Enter Vendor Invoice',               'MIRO',    'Materials Management (MM)',      'MAPPED', '3-way match in MIRO; tolerance keys control exception handling.', datetime('now'), datetime('now')),
  ('PSM-SAPS4-P2P-PAY-SUPPLIER',            'P2P-PAY-SUPPLIER',            NULL, 'SAP_S4', 'Automatic Payment Run',              'F110',    'Financial Accounting (FI)',      'MAPPED', 'F110 creates payment medium; manual single payment via F-53.', datetime('now'), datetime('now')),
  -- R2R
  ('PSM-SAPS4-R2R-DEFINE-COA',              'R2R-DEFINE-COA',              NULL, 'SAP_S4', 'Chart of Accounts',                  'OBY6 / FS00', 'Financial Accounting (FI)',  'MAPPED', 'COA defined at client level; account groups control field status.', datetime('now'), datetime('now')),
  ('PSM-SAPS4-R2R-POST-JOURNAL',            'R2R-POST-JOURNAL',            NULL, 'SAP_S4', 'Post Document (FB01)',               'FB01 / FB50', 'Financial Accounting (FI)',  'MAPPED', 'S/4HANA writes directly to Universal Journal ACDOCA.', datetime('now'), datetime('now')),
  ('PSM-SAPS4-R2R-PERIOD-CLOSE',            'R2R-PERIOD-CLOSE',            NULL, 'SAP_S4', 'Financial Closing Cockpit',          'COCKPIT',  'Financial Accounting (FI)',     'MAPPED', 'SAP Financial Closing Cockpit (FCC) orchestrates close tasks.', datetime('now'), datetime('now')),
  ('PSM-SAPS4-R2R-REVALUE-FX',              'R2R-REVALUE-FX',              NULL, 'SAP_S4', 'Foreign Currency Valuation',         'FAGL_FC_VAL', 'Financial Accounting (FI)', 'MAPPED', NULL, datetime('now'), datetime('now')),
  -- H2R
  ('PSM-SAPS4-H2R-HIRE-EMPLOYEE',           'H2R-HIRE-EMPLOYEE',           NULL, 'SAP_S4', 'Hire Employee',                      'PA40',    'Human Resources (HR-PA)',        'MAPPED', 'Infotype-based HR. PA40 runs action "Hiring" which creates infotypes 0000/0001/0002.', datetime('now'), datetime('now')),
  ('PSM-SAPS4-H2R-TERMINATE-EMPLOYEE',      'H2R-TERMINATE-EMPLOYEE',      NULL, 'SAP_S4', 'Terminate Employee',                 'PA40',    'Human Resources (HR-PA)',        'MAPPED', 'Termination action via PA40 (action type 33 or configured action).', datetime('now'), datetime('now')),
  -- PROJ
  ('PSM-SAPS4-PROJ-CREATE-PROJECT',         'PROJ-CREATE-PROJECT',         NULL, 'SAP_S4', 'Create Project / WBS',               'CJ01 / CJ20N', 'Project System (PS)',      'PARTIAL', 'S/4HANA PS uses WBS elements. Cloud edition may use CPM instead.', datetime('now'), datetime('now')),
  ('PSM-SAPS4-PROJ-BUDGET-PROJECT',         'PROJ-BUDGET-PROJECT',         NULL, 'SAP_S4', 'Original Budget',                    'CJ30',    'Investment Management / PS',     'MAPPED', NULL, datetime('now'), datetime('now'));

-- ---------------------------------------------------------------------------
-- Process system mappings — Dynamics 365 F&O (D365FO)
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO erp_process_system_mapping(id, process_id, step_id, system_id, erp_process_name, erp_transaction_code, erp_module, mapping_status, notes, created_at, updated_at)
VALUES
  -- O2C
  ('PSM-D365FO-O2C-ONBOARD-CUSTOMER',        'O2C-ONBOARD-CUSTOMER',        NULL, 'D365FO', 'Create Customer',                'Accounts receivable > Customers > All customers',            'Accounts Receivable',        'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-D365FO-O2C-CREATE-QUOTE',            'O2C-CREATE-QUOTE',            NULL, 'D365FO', 'Create Sales Quotation',         'Sales and marketing > Quotations > All quotations',          'Sales and Marketing',        'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-D365FO-O2C-CONVERT-QUOTE-TO-ORDER',  'O2C-CONVERT-QUOTE-TO-ORDER',  NULL, 'D365FO', 'Confirm Sales Order',            'Sales quotation > Confirm > Confirm',                        'Sales and Marketing',        'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-D365FO-O2C-FULFILL-ORDER',           'O2C-FULFILL-ORDER',           NULL, 'D365FO', 'Generate and Post Picking List / Packing Slip', 'Warehouse management > Outbound > Sales orders', 'Warehouse Management',  'MAPPED', 'Packing slip posting = delivery confirmation; triggers inventory.', datetime('now'), datetime('now')),
  ('PSM-D365FO-O2C-INVOICE-CUSTOMER',        'O2C-INVOICE-CUSTOMER',        NULL, 'D365FO', 'Post Invoice',                   'Accounts receivable > Orders > All sales orders > Invoice',  'Accounts Receivable',        'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-D365FO-O2C-COLLECT-PAYMENT',         'O2C-COLLECT-PAYMENT',         NULL, 'D365FO', 'Enter Customer Payment',         'Accounts receivable > Payments > Customer payment journal',  'Accounts Receivable',        'MAPPED', NULL, datetime('now'), datetime('now')),
  -- P2P
  ('PSM-D365FO-P2P-ONBOARD-SUPPLIER',        'P2P-ONBOARD-SUPPLIER',        NULL, 'D365FO', 'Create Vendor',                  'Accounts payable > Vendors > All vendors',                   'Accounts Payable',           'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-D365FO-P2P-CREATE-REQUISITION',      'P2P-CREATE-REQUISITION',      NULL, 'D365FO', 'Create Purchase Requisition',    'Procurement > Purchase requisitions > My purchase requisitions','Procurement',             'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-D365FO-P2P-APPROVE-REQUISITION',     'P2P-APPROVE-REQUISITION',     NULL, 'D365FO', 'Approve Requisition',            'Workflow notification > Approve',                            'Procurement',                'MAPPED', 'D365FO uses configurable approval workflows.', datetime('now'), datetime('now')),
  ('PSM-D365FO-P2P-CREATE-PO',               'P2P-CREATE-PO',               NULL, 'D365FO', 'Create Purchase Order',          'Procurement > Purchase orders > All purchase orders',        'Procurement',                'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-D365FO-P2P-RECEIVE-GOODS',           'P2P-RECEIVE-GOODS',           NULL, 'D365FO', 'Post Product Receipt',           'Purchase order > Receive > Product receipt',                 'Procurement',                'MAPPED', 'Product receipt posting triggers InventTrans and accrual journal.', datetime('now'), datetime('now')),
  ('PSM-D365FO-P2P-PROCESS-SUPPLIER-INVOICE','P2P-PROCESS-SUPPLIER-INVOICE',NULL, 'D365FO', 'Record and Match Vendor Invoice', 'Accounts payable > Invoices > Pending vendor invoices',      'Accounts Payable',           'MAPPED', 'Invoice matching policies control 2-way or 3-way match tolerance.', datetime('now'), datetime('now')),
  ('PSM-D365FO-P2P-PAY-SUPPLIER',            'P2P-PAY-SUPPLIER',            NULL, 'D365FO', 'Generate Vendor Payment Proposal','Accounts payable > Payments > Payment journal',              'Accounts Payable',           'MAPPED', NULL, datetime('now'), datetime('now')),
  -- R2R
  ('PSM-D365FO-R2R-DEFINE-COA',              'R2R-DEFINE-COA',              NULL, 'D365FO', 'Create Chart of Accounts',       'General ledger > Chart of accounts > Accounts > Main accounts','General Ledger',           'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-D365FO-R2R-POST-JOURNAL',            'R2R-POST-JOURNAL',            NULL, 'D365FO', 'Post General Journal',           'General ledger > Journal entries > General journals',         'General Ledger',            'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-D365FO-R2R-PERIOD-CLOSE',            'R2R-PERIOD-CLOSE',            NULL, 'D365FO', 'Ledger Period Close',            'General ledger > Period close > Period close',                'General Ledger',             'MAPPED', 'Uses Financial Period Close workspace with task list.', datetime('now'), datetime('now')),
  ('PSM-D365FO-R2R-REVALUE-FX',              'R2R-REVALUE-FX',              NULL, 'D365FO', 'Foreign Currency Revaluation',   'General ledger > Periodic > Foreign currency revaluation',   'General Ledger',             'MAPPED', NULL, datetime('now'), datetime('now')),
  -- H2R
  ('PSM-D365FO-H2R-HIRE-EMPLOYEE',           'H2R-HIRE-EMPLOYEE',           NULL, 'D365FO', 'Hire a Worker',                  'Human resources > Workers > Hire > Hire new worker',          'Human Resources',           'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-D365FO-H2R-TERMINATE-EMPLOYEE',      'H2R-TERMINATE-EMPLOYEE',      NULL, 'D365FO', 'Terminate Employment',           'Human resources > Workers > Employment > Terminate',          'Human Resources',           'MAPPED', NULL, datetime('now'), datetime('now')),
  -- PROJ
  ('PSM-D365FO-PROJ-CREATE-PROJECT',         'PROJ-CREATE-PROJECT',         NULL, 'D365FO', 'Create Project',                 'Project management and accounting > Projects > All projects', 'Project Management',         'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-D365FO-PROJ-BUDGET-PROJECT',         'PROJ-BUDGET-PROJECT',         NULL, 'D365FO', 'Original Budget',                'Project management > Projects > Project budget',              'Project Management',         'MAPPED', NULL, datetime('now'), datetime('now'));

-- ---------------------------------------------------------------------------
-- Process system mappings — Workday (WORKDAY) — process-level only
-- field-level mappings will be seeded in a separate migration once available
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO erp_process_system_mapping(id, process_id, step_id, system_id, erp_process_name, erp_transaction_code, erp_module, mapping_status, notes, created_at, updated_at)
VALUES
  ('PSM-WD-O2C-INVOICE-CUSTOMER',        'O2C-INVOICE-CUSTOMER',         NULL, 'WORKDAY', 'Create Customer Invoice',         'Customer Invoicing > Create Customer Invoice',       'Customer Accounts',     'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-WD-O2C-COLLECT-PAYMENT',         'O2C-COLLECT-PAYMENT',          NULL, 'WORKDAY', 'Apply Customer Payment',          'Customer Accounts > Apply Customer Payment',         'Customer Accounts',     'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-WD-P2P-ONBOARD-SUPPLIER',        'P2P-ONBOARD-SUPPLIER',         NULL, 'WORKDAY', 'Create Supplier',                 'Procurement > Create Supplier',                      'Procurement',           'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-WD-P2P-CREATE-REQUISITION',      'P2P-CREATE-REQUISITION',       NULL, 'WORKDAY', 'Create Requisition',              'Procurement > Create Requisition',                   'Procurement',           'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-WD-P2P-CREATE-PO',               'P2P-CREATE-PO',                NULL, 'WORKDAY', 'Create Purchase Order',           'Procurement > Create Purchase Order',                'Procurement',           'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-WD-P2P-PROCESS-SUPPLIER-INVOICE','P2P-PROCESS-SUPPLIER-INVOICE', NULL, 'WORKDAY', 'Create Supplier Invoice',         'Supplier Accounts > Create Supplier Invoice',        'Supplier Accounts',     'MAPPED', 'Workday uses business process framework; matching rules configurable.', datetime('now'), datetime('now')),
  ('PSM-WD-P2P-PAY-SUPPLIER',            'P2P-PAY-SUPPLIER',             NULL, 'WORKDAY', 'Create Payment',                  'Supplier Accounts > Run Payment Election Proposal',  'Supplier Accounts',     'MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-WD-R2R-POST-JOURNAL',            'R2R-POST-JOURNAL',             NULL, 'WORKDAY', 'Create Journal Entry',            'Accounting > Create Journal',                        'Accounting',            'MAPPED', 'Workday journals use Accounting Date and Period; posting immediate.', datetime('now'), datetime('now')),
  ('PSM-WD-R2R-PERIOD-CLOSE',            'R2R-PERIOD-CLOSE',             NULL, 'WORKDAY', 'Close Accounting Period',         'Accounting > Close Accounting Period',               'Accounting',            'MAPPED', 'Business process with configurable approver chain.', datetime('now'), datetime('now')),
  ('PSM-WD-H2R-HIRE-EMPLOYEE',           'H2R-HIRE-EMPLOYEE',            NULL, 'WORKDAY', 'Hire Employee',                   'Staffing > Hire Employee',                           'Human Capital Management','MAPPED','Workday is strongest in HCM; hire BP is highly configurable.', datetime('now'), datetime('now')),
  ('PSM-WD-H2R-TERMINATE-EMPLOYEE',      'H2R-TERMINATE-EMPLOYEE',       NULL, 'WORKDAY', 'Terminate Employee',              'Staffing > Terminate Employee',                      'Human Capital Management','MAPPED', NULL, datetime('now'), datetime('now')),
  ('PSM-WD-PROJ-CREATE-PROJECT',         'PROJ-CREATE-PROJECT',          NULL, 'WORKDAY', 'Create Project',                  'Projects > Create Project',                          'Projects',              'MAPPED', 'Workday Projects module available in Enterprise edition.', datetime('now'), datetime('now'));

-- ---------------------------------------------------------------------------
-- ERP-system-specific (unmapped) fields — SAP S/4HANA examples
-- These illustrate fields with no canonical equivalent in the Canonical ERP.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO erp_system_field(id, system_id, domain, entity_context, erp_module, erp_table, erp_field, erp_full_reference, purpose, notes, created_at, updated_at)
VALUES
  -- Controlling objects (CO) — no canonical equivalent
  ('SF-SAP-CO-KOSTL',   'SAP_S4', 'R2R', 'Cost Center Assignment', 'Controlling (CO)', 'CSKS',   'KOSTL',   'CSKS-KOSTL',   'Cost Center — organisational unit for cost collection and allocation.', 'Canonical ERP does not model CO objects; they are SAP-specific management accounting constructs.', datetime('now'), datetime('now')),
  ('SF-SAP-CO-PRCTR',   'SAP_S4', 'R2R', 'Profit Center',          'Controlling (CO)', 'CEPC',   'PRCTR',   'CEPC-PRCTR',   'Profit Center — unit for P&L reporting below legal entity level.',      'No canonical equivalent; Canonical ERP uses LegalEntity for entity-level P&L.',             datetime('now'), datetime('now')),
  ('SF-SAP-CO-AUFNR',   'SAP_S4', 'PROJ','Internal Order',         'Controlling (CO)', 'AUFK',   'AUFNR',   'AUFK-AUFNR',   'Internal Order — CO object used to collect costs for short-term tasks.', 'Overlaps with canonical Project but is a separate CO concept in SAP.',                     datetime('now'), datetime('now')),
  -- SD-specific fields
  ('SF-SAP-SD-INCO1',   'SAP_S4', 'O2C', 'Sales Order Header',     'Sales & Distribution (SD)', 'VBAK', 'INCO1', 'VBAK-INCO1', 'Incoterms 1 — the Incoterms rule (e.g. EXW, CIF, DDP).',             'Canonical Shipment captures carrier/tracking; Incoterms detail is SAP-specific.',            datetime('now'), datetime('now')),
  ('SF-SAP-SD-ROUTE',   'SAP_S4', 'O2C', 'Delivery',               'Logistics Execution (LE)', 'LIKP', 'ROUTE', 'LIKP-ROUTE', 'Route — shipping route code linking departure zone to destination.',    'Route determination is SAP-specific; Canonical ERP uses carrier field only.',               datetime('now'), datetime('now')),
  -- MM-specific fields
  ('SF-SAP-MM-EKGRP',   'SAP_S4', 'P2P', 'Purchase Order Header',  'Materials Management (MM)', 'EKKO', 'EKGRP', 'EKKO-EKGRP', 'Purchasing Group — buyer responsible for the PO.',                    'Canonical ERP does not model purchasing groups/buyers as a separate dimension.',            datetime('now'), datetime('now')),
  ('SF-SAP-MM-WERKS',   'SAP_S4', 'INV', 'Material Master',        'Materials Management (MM)', 'MARC', 'WERKS', 'MARC-WERKS', 'Plant — organisational unit for production planning and inventory.',    'Maps loosely to canonical InventoryOrganization but has broader MRP scope.',               datetime('now'), datetime('now')),
  -- HR Infotypes
  ('SF-SAP-HR-IT0007',  'SAP_S4', 'H2R', 'Employee',               'Human Resources (HR-PA)',   'P0007','WOSTD', 'P0007-WOSTD', 'Work Schedule Rule — controls attendance, overtime, and leave entitlement.', 'No canonical equivalent; Canonical H2R focuses on position/assignment lifecycle.',        datetime('now'), datetime('now'));

-- ---------------------------------------------------------------------------
-- ERP-system-specific (unmapped) fields — Oracle Fusion examples
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO erp_system_field(id, system_id, domain, entity_context, erp_module, erp_table, erp_field, erp_full_reference, purpose, notes, created_at, updated_at)
VALUES
  ('SF-FUSION-FLEX-SEG', 'FUSION', 'R2R', 'Account Combination',    'General Ledger', 'GL_CODE_COMBINATIONS', 'SEGMENT3', 'GL_CODE_COMBINATIONS.SEGMENT3', 'Descriptive Flexfield segment — configurable COA dimension (e.g. Product, Project, Intercompany).', 'Canonical COA uses structured segments; Fusion flexfields allow unlimited extension beyond canonical model.', datetime('now'), datetime('now')),
  ('SF-FUSION-BU',       'FUSION', 'O2C', 'Business Unit',          'Financials Common', 'FUN_ALL_BUSINESS_UNITS', 'SHORT_CODE', 'FUN_ALL_BUSINESS_UNITS.SHORT_CODE', 'Business Unit — operational/financial reporting partition below legal entity.', 'Canonical uses LegalEntity; Fusion adds Business Unit and Ledger layers for multi-org.', datetime('now'), datetime('now')),
  ('SF-FUSION-INV-ORG',  'FUSION', 'INV', 'Inventory Organization', 'Inventory', 'INV_ORG_PARAMETERS', 'SHIP_TO_LOCATION_ID', 'INV_ORG_PARAMETERS.SHIP_TO_LOCATION_ID', 'Default ship-to location for the inventory organisation.',                     'Fusion tracks this at org level; Canonical InventoryOrganization does not include default location.', datetime('now'), datetime('now'));

-- ---------------------------------------------------------------------------
-- ERP-system-specific (unmapped) fields — Workday examples
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO erp_system_field(id, system_id, domain, entity_context, erp_module, erp_table, erp_field, erp_full_reference, purpose, notes, created_at, updated_at)
VALUES
  ('SF-WD-SUPERVISORY-ORG', 'WORKDAY', 'H2R', 'Worker',  'Human Capital Management', 'Supervisory_Organization', 'Organization_ID', 'Supervisory_Organization.Organization_ID', 'Supervisory Org — Workday-specific hierarchical management structure for workers.', 'Canonical H2R uses Position/Assignment; Workday supervisory org is a distinct object not in canonical model.', datetime('now'), datetime('now')),
  ('SF-WD-SPEND-CATEGORY',  'WORKDAY', 'P2P', 'Purchase Order Line', 'Procurement', 'Spend_Category', 'Spend_Category_ID', 'Spend_Category.Spend_Category_ID', 'Spend Category — Workday taxonomy for procurement spend classification.', 'Analogous to SAP account assignment category / cost element; no direct canonical equivalent.', datetime('now'), datetime('now')),
  ('SF-WD-WORKTAG',         'WORKDAY', 'R2R', 'Journal Line',        'Accounting',  'Journal_Line',   'Worktag',           'Journal_Line.Worktag',              'Worktag — Workday''s multi-dimensional tagging replacing account segments (Cost Center, Project, Fund, etc.).', 'Canonical uses COA segments; Workday Worktags are a superset that cannot be directly mapped 1:1.', datetime('now'), datetime('now'));
