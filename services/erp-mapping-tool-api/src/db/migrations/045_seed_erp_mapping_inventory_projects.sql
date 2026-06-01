-- Seed canonical to ERP field mappings for Inventory (INV) and Projects (PROJ).
-- Additive and idempotent: uses INSERT OR IGNORE so replays are safe.

INSERT OR IGNORE INTO erp_mapping(mapping_id, domain, entity_name, canonical_field, oracle_field, sap_field, dynamics_field, created_at, updated_at)
VALUES
  -- INV: SKU
  ('MAP-INV-SKU-SKUID', 'INV', 'SKU', 'skuId', 'EGP_SYSTEM_ITEMS_B.INVENTORY_ITEM_ID', 'MARA-MATNR', 'InventTable.ItemId', datetime('now'), datetime('now')),
  ('MAP-INV-SKU-SKUCODE', 'INV', 'SKU', 'skuCode', 'EGP_SYSTEM_ITEMS_B.SEGMENT1', 'MARA-MATNR', 'InventTable.ItemId', datetime('now'), datetime('now')),
  ('MAP-INV-SKU-DESCRIPTION', 'INV', 'SKU', 'description', 'EGP_SYSTEM_ITEMS_TL.DESCRIPTION', 'MAKT-MAKTX', 'EcoResProductTranslation.Name', datetime('now'), datetime('now')),
  ('MAP-INV-SKU-CATEGORY', 'INV', 'SKU', 'category', 'EGP_ITEM_CATEGORIES.CATEGORY_ID', 'MARA-MATKL', 'EcoResCategory.Name', datetime('now'), datetime('now')),
  ('MAP-INV-SKU-UOM', 'INV', 'SKU', 'uom', 'EGP_SYSTEM_ITEMS_B.PRIMARY_UOM_CODE', 'MARA-MEINS', 'InventTableModule.UnitId', datetime('now'), datetime('now')),
  ('MAP-INV-SKU-VALUATIONMETHOD', 'INV', 'SKU', 'valuationMethod', 'CST_ITEM_COST_PROFILES.COST_METHOD_CODE', 'MBEW-VPRSV', 'InventModelGroupItem.ModelGroupId', datetime('now'), datetime('now')),
  ('MAP-INV-SKU-STANDARDCOST', 'INV', 'SKU', 'standardCost', 'CST_ITEM_COSTS.UNIT_COST', 'MBEW-STPRS', 'InventItemPrice.Price', datetime('now'), datetime('now')),
  ('MAP-INV-SKU-LIFECYCLESTATE', 'INV', 'SKU', 'lifecycleState', 'EGP_SYSTEM_ITEMS_B.INVENTORY_ITEM_STATUS_CODE', 'MARA-MMSTA', 'InventTable.Stopped', datetime('now'), datetime('now')),

  -- INV: Organization
  ('MAP-INV-ORG-ORGANIZATIONID', 'INV', 'InventoryOrganization', 'organizationId', 'INV_ORG_PARAMETERS.ORGANIZATION_ID', 'T001W-WERKS', 'InventSite.SiteId', datetime('now'), datetime('now')),
  ('MAP-INV-ORG-NAME', 'INV', 'InventoryOrganization', 'name', 'HR_ORGANIZATION_UNITS.NAME', 'T001W-NAME1', 'InventSite.Name', datetime('now'), datetime('now')),
  ('MAP-INV-ORG-LEDGERID', 'INV', 'InventoryOrganization', 'ledgerId', 'GL_LEDGERS.LEDGER_ID', 'T001-RLDNR', 'Ledger.RecId', datetime('now'), datetime('now')),
  ('MAP-INV-ORG-INVENTORYASSETACCOUNTCODE', 'INV', 'InventoryOrganization', 'inventoryAssetAccountCode', 'CST_ORG_BOOKS.MATERIAL_ACCOUNT', 'T030-BSX', 'InventoryPostingProfile.InventoryReceipt', datetime('now'), datetime('now')),
  ('MAP-INV-ORG-COGSACCOUNTCODE', 'INV', 'InventoryOrganization', 'cogsAccountCode', 'CST_ORG_BOOKS.COGS_ACCOUNT', 'T030-GBB', 'InventoryPostingProfile.COGS', datetime('now'), datetime('now')),

  -- INV: OnHand
  ('MAP-INV-ONHAND-ONHANDID', 'INV', 'OnHand', 'onHandId', 'INV_ONHAND_QUANTITIES_DETAIL.ONHAND_QUANTITIES_ID', 'MARD-LABST(KEY)', 'InventSum.RecId', datetime('now'), datetime('now')),
  ('MAP-INV-ONHAND-SKUID', 'INV', 'OnHand', 'skuId', 'INV_ONHAND_QUANTITIES_DETAIL.INVENTORY_ITEM_ID', 'MARD-MATNR', 'InventSum.ItemId', datetime('now'), datetime('now')),
  ('MAP-INV-ONHAND-ORGANIZATIONID', 'INV', 'OnHand', 'organizationId', 'INV_ONHAND_QUANTITIES_DETAIL.ORGANIZATION_ID', 'MARD-WERKS', 'InventSum.InventSiteId', datetime('now'), datetime('now')),
  ('MAP-INV-ONHAND-QUANTITYONHAND', 'INV', 'OnHand', 'quantityOnHand', 'INV_ONHAND_QUANTITIES_DETAIL.PRIMARY_TRANSACTION_QUANTITY', 'MARD-LABST', 'InventSum.AvailPhysical', datetime('now'), datetime('now')),
  ('MAP-INV-ONHAND-INVENTORYVALUE', 'INV', 'OnHand', 'inventoryValue', 'CST_INV_VALUE_SUMMARY.INVENTORY_VALUE', 'MBEW-SALK3', 'InventValueReportStorage.AmountMST', datetime('now'), datetime('now')),
  ('MAP-INV-ONHAND-MOVINGAVERAGECOST', 'INV', 'OnHand', 'movingAverageCost', 'CST_ITEM_COSTS.AVERAGE_COST', 'MBEW-VERPR', 'InventItemPrice.Price', datetime('now'), datetime('now')),

  -- INV: Movement
  ('MAP-INV-MOVEMENT-MOVEMENTID', 'INV', 'InventoryMovement', 'movementId', 'MTL_MATERIAL_TRANSACTIONS.TRANSACTION_ID', 'MKPF-MBLNR+MSEG-ZEILE', 'InventTrans.RecId', datetime('now'), datetime('now')),
  ('MAP-INV-MOVEMENT-SKUID', 'INV', 'InventoryMovement', 'skuId', 'MTL_MATERIAL_TRANSACTIONS.INVENTORY_ITEM_ID', 'MSEG-MATNR', 'InventTrans.ItemId', datetime('now'), datetime('now')),
  ('MAP-INV-MOVEMENT-ORGANIZATIONID', 'INV', 'InventoryMovement', 'organizationId', 'MTL_MATERIAL_TRANSACTIONS.ORGANIZATION_ID', 'MSEG-WERKS', 'InventTrans.InventSiteId', datetime('now'), datetime('now')),
  ('MAP-INV-MOVEMENT-MOVEMENTTYPE', 'INV', 'InventoryMovement', 'movementType', 'MTL_TRANSACTION_TYPES.TRANSACTION_TYPE_NAME', 'MSEG-BWART', 'InventTrans.TransType', datetime('now'), datetime('now')),
  ('MAP-INV-MOVEMENT-QUANTITY', 'INV', 'InventoryMovement', 'quantity', 'MTL_MATERIAL_TRANSACTIONS.PRIMARY_QUANTITY', 'MSEG-MENGE', 'InventTrans.Qty', datetime('now'), datetime('now')),
  ('MAP-INV-MOVEMENT-UNITCOST', 'INV', 'InventoryMovement', 'unitCost', 'MTL_MATERIAL_TRANSACTIONS.ACTUAL_COST', 'CKMLCR-STPRS', 'InventTrans.CostAmountPhysical/Qty', datetime('now'), datetime('now')),
  ('MAP-INV-MOVEMENT-TOTALCOST', 'INV', 'InventoryMovement', 'totalCost', 'MTL_MATERIAL_TRANSACTIONS.TRANSACTION_COST', 'MSEG-DMBTR', 'InventTrans.CostAmountPosted', datetime('now'), datetime('now')),
  ('MAP-INV-MOVEMENT-REFERENCETYPE', 'INV', 'InventoryMovement', 'referenceType', 'MTL_MATERIAL_TRANSACTIONS.SOURCE_CODE', 'MKPF-BKTXT', 'InventTrans.ReferenceCategory', datetime('now'), datetime('now')),
  ('MAP-INV-MOVEMENT-REFERENCEID', 'INV', 'InventoryMovement', 'referenceId', 'MTL_MATERIAL_TRANSACTIONS.TRANSACTION_REFERENCE', 'MSEG-XBLNR', 'InventTrans.ReferenceId', datetime('now'), datetime('now')),

  -- INV: Reservation
  ('MAP-INV-RES-RESERVATIONID', 'INV', 'Reservation', 'reservationId', 'INV_RESERVATIONS.RESERVATION_ID', 'RESB-RSNUM', 'InventReservation.ReservationId', datetime('now'), datetime('now')),
  ('MAP-INV-RES-SKUID', 'INV', 'Reservation', 'skuId', 'INV_RESERVATIONS.INVENTORY_ITEM_ID', 'RESB-MATNR', 'InventReservation.ItemId', datetime('now'), datetime('now')),
  ('MAP-INV-RES-ORGANIZATIONID', 'INV', 'Reservation', 'organizationId', 'INV_RESERVATIONS.ORGANIZATION_ID', 'RESB-WERKS', 'InventReservation.InventSiteId', datetime('now'), datetime('now')),
  ('MAP-INV-RES-RESERVATIONTYPE', 'INV', 'Reservation', 'reservationType', 'INV_RESERVATIONS.DEMAND_SOURCE_TYPE_ID', 'RESB-BDART', 'InventReservation.ReservationType', datetime('now'), datetime('now')),
  ('MAP-INV-RES-STATUS', 'INV', 'Reservation', 'status', 'INV_RESERVATIONS.RESERVATION_STATUS_CODE', 'RESB-XLOEK', 'InventReservation.Status', datetime('now'), datetime('now')),
  ('MAP-INV-RES-QUANTITY', 'INV', 'Reservation', 'quantity', 'INV_RESERVATIONS.PRIMARY_RESERVATION_QUANTITY', 'RESB-BDMNG', 'InventReservation.Qty', datetime('now'), datetime('now')),
  ('MAP-INV-RES-REFERENCETYPE', 'INV', 'Reservation', 'referenceType', 'INV_RESERVATIONS.DEMAND_SOURCE_TYPE_ID', 'RESB-BDART', 'InventReservation.ReferenceCategory', datetime('now'), datetime('now')),
  ('MAP-INV-RES-REFERENCEID', 'INV', 'Reservation', 'referenceId', 'INV_RESERVATIONS.DEMAND_SOURCE_HEADER_ID', 'RESB-AUFNR', 'InventReservation.ReferenceId', datetime('now'), datetime('now')),

  -- INV: Bin
  ('MAP-INV-BIN-BINID', 'INV', 'Bin', 'binId', 'INV_SECONDARY_INVENTORIES.SECONDARY_INVENTORY_NAME', 'LAGP-LGPLA(KEY)', 'WMSLocation.LocationId', datetime('now'), datetime('now')),
  ('MAP-INV-BIN-ORGANIZATIONID', 'INV', 'Bin', 'organizationId', 'INV_SECONDARY_INVENTORIES.ORGANIZATION_ID', 'LAGP-WERKS', 'WMSLocation.InventSiteId', datetime('now'), datetime('now')),
  ('MAP-INV-BIN-BINCODE', 'INV', 'Bin', 'binCode', 'INV_SECONDARY_INVENTORIES.SECONDARY_INVENTORY_NAME', 'LAGP-LGPLA', 'WMSLocation.LocationId', datetime('now'), datetime('now')),
  ('MAP-INV-BIN-ZONE', 'INV', 'Bin', 'zone', 'INV_LOCATORS.SEGMENT1', 'LAGP-LGBER', 'WMSLocation.ZoneId', datetime('now'), datetime('now')),
  ('MAP-INV-BIN-ISACTIVE', 'INV', 'Bin', 'isActive', 'INV_SECONDARY_INVENTORIES.DISABLE_DATE', 'LAGP-SPERR', 'WMSLocation.IsEnabled', datetime('now'), datetime('now')),

  -- INV: BinBalance
  ('MAP-INV-BINBAL-BINBALANCEID', 'INV', 'BinBalance', 'binBalanceId', 'INV_ONHAND_QUANTITIES_DETAIL.ONHAND_QUANTITIES_ID', 'LQUA-LQNUM', 'WMSLocationInventory.RecId', datetime('now'), datetime('now')),
  ('MAP-INV-BINBAL-SKUID', 'INV', 'BinBalance', 'skuId', 'INV_ONHAND_QUANTITIES_DETAIL.INVENTORY_ITEM_ID', 'LQUA-MATNR', 'WMSLocationInventory.ItemId', datetime('now'), datetime('now')),
  ('MAP-INV-BINBAL-ORGANIZATIONID', 'INV', 'BinBalance', 'organizationId', 'INV_ONHAND_QUANTITIES_DETAIL.ORGANIZATION_ID', 'LQUA-WERKS', 'WMSLocationInventory.InventSiteId', datetime('now'), datetime('now')),
  ('MAP-INV-BINBAL-BINID', 'INV', 'BinBalance', 'binId', 'INV_ONHAND_QUANTITIES_DETAIL.LOCATOR_ID', 'LQUA-LGPLA', 'WMSLocationInventory.LocationId', datetime('now'), datetime('now')),
  ('MAP-INV-BINBAL-QUANTITY', 'INV', 'BinBalance', 'quantity', 'INV_ONHAND_QUANTITIES_DETAIL.PRIMARY_TRANSACTION_QUANTITY', 'LQUA-VERME', 'WMSLocationInventory.AvailPhysical', datetime('now'), datetime('now')),

  -- INV: BinTransaction
  ('MAP-INV-BINTXN-BINTXNID', 'INV', 'BinTransaction', 'binTxnId', 'MTL_MATERIAL_TRANSACTIONS.TRANSACTION_ID', 'LTAP-TANUM+TAPOS', 'WMSWorkLine.RecId', datetime('now'), datetime('now')),
  ('MAP-INV-BINTXN-TXNTYPE', 'INV', 'BinTransaction', 'txnType', 'MTL_MATERIAL_TRANSACTIONS.TRANSACTION_TYPE_ID', 'LTAP-BWLVS', 'WMSWorkLine.WorkType', datetime('now'), datetime('now')),
  ('MAP-INV-BINTXN-SKUID', 'INV', 'BinTransaction', 'skuId', 'MTL_MATERIAL_TRANSACTIONS.INVENTORY_ITEM_ID', 'LTAP-MATNR', 'WMSWorkLine.ItemId', datetime('now'), datetime('now')),
  ('MAP-INV-BINTXN-ORGANIZATIONID', 'INV', 'BinTransaction', 'organizationId', 'MTL_MATERIAL_TRANSACTIONS.ORGANIZATION_ID', 'LTAP-WERKS', 'WMSWorkLine.InventSiteId', datetime('now'), datetime('now')),
  ('MAP-INV-BINTXN-BINID', 'INV', 'BinTransaction', 'binId', 'MTL_MATERIAL_TRANSACTIONS.LOCATOR_ID', 'LTAP-NLPLA', 'WMSWorkLine.LocationId', datetime('now'), datetime('now')),
  ('MAP-INV-BINTXN-QUANTITY', 'INV', 'BinTransaction', 'quantity', 'MTL_MATERIAL_TRANSACTIONS.PRIMARY_QUANTITY', 'LTAP-NISTA', 'WMSWorkLine.QtyWork', datetime('now'), datetime('now')),
  ('MAP-INV-BINTXN-REFERENCETYPE', 'INV', 'BinTransaction', 'referenceType', 'MTL_MATERIAL_TRANSACTIONS.SOURCE_CODE', 'LTAP-BETYP', 'WMSWorkLine.ReferenceCategory', datetime('now'), datetime('now')),
  ('MAP-INV-BINTXN-REFERENCEID', 'INV', 'BinTransaction', 'referenceId', 'MTL_MATERIAL_TRANSACTIONS.TRANSACTION_REFERENCE', 'LTAP-BENUM', 'WMSWorkLine.ReferenceId', datetime('now'), datetime('now')),

  -- INV: CycleCount
  ('MAP-INV-CYCLECOUNT-CYCLECOUNTID', 'INV', 'CycleCount', 'cycleCountId', 'MTL_CYCLE_COUNT_HEADERS.CYCLE_COUNT_HEADER_ID', 'IKPF-IBLNR', 'InventCountJournalTable.JournalId', datetime('now'), datetime('now')),
  ('MAP-INV-CYCLECOUNT-ORGANIZATIONID', 'INV', 'CycleCount', 'organizationId', 'MTL_CYCLE_COUNT_HEADERS.ORGANIZATION_ID', 'IKPF-WERKS', 'InventCountJournalTable.InventSiteId', datetime('now'), datetime('now')),
  ('MAP-INV-CYCLECOUNT-BINID', 'INV', 'CycleCount', 'binId', 'MTL_CYCLE_COUNT_ENTRIES.LOCATOR_ID', 'ISEG-LGPLA', 'InventCountJournalLine.LocationId', datetime('now'), datetime('now')),
  ('MAP-INV-CYCLECOUNT-STATUS', 'INV', 'CycleCount', 'status', 'MTL_CYCLE_COUNT_HEADERS.STATUS_CODE', 'IKPF-BSTAT', 'InventCountJournalTable.JournalStatus', datetime('now'), datetime('now')),
  ('MAP-INV-CYCLECOUNT-SCHEDULEDFOR', 'INV', 'CycleCount', 'scheduledFor', 'MTL_CYCLE_COUNT_HEADERS.SCHEDULED_DATE', 'IKPF-BUDAT', 'InventCountJournalTable.CountDate', datetime('now'), datetime('now')),
  ('MAP-INV-CYCLECOUNT-COUNTEDAT', 'INV', 'CycleCount', 'countedAt', 'MTL_CYCLE_COUNT_HEADERS.LAST_COUNT_DATE', 'IKPF-CPUDT', 'InventCountJournalTable.ClosedDateTime', datetime('now'), datetime('now')),

  -- INV: CycleCountLine
  ('MAP-INV-CYCLELINE-CYCLECOUNTLINEID', 'INV', 'CycleCountLine', 'cycleCountLineId', 'MTL_CYCLE_COUNT_ENTRIES.CYCLE_COUNT_ENTRY_ID', 'ISEG-ZEILI', 'InventCountJournalLine.RecId', datetime('now'), datetime('now')),
  ('MAP-INV-CYCLELINE-CYCLECOUNTID', 'INV', 'CycleCountLine', 'cycleCountId', 'MTL_CYCLE_COUNT_ENTRIES.CYCLE_COUNT_HEADER_ID', 'ISEG-IBLNR', 'InventCountJournalLine.JournalId', datetime('now'), datetime('now')),
  ('MAP-INV-CYCLELINE-SKUID', 'INV', 'CycleCountLine', 'skuId', 'MTL_CYCLE_COUNT_ENTRIES.INVENTORY_ITEM_ID', 'ISEG-MATNR', 'InventCountJournalLine.ItemId', datetime('now'), datetime('now')),
  ('MAP-INV-CYCLELINE-EXPECTEDQUANTITY', 'INV', 'CycleCountLine', 'expectedQuantity', 'MTL_CYCLE_COUNT_ENTRIES.SYSTEM_QUANTITY_CURRENT', 'ISEG-BUCHM', 'InventCountJournalLine.QtyOnHand', datetime('now'), datetime('now')),
  ('MAP-INV-CYCLELINE-COUNTEDQUANTITY', 'INV', 'CycleCountLine', 'countedQuantity', 'MTL_CYCLE_COUNT_ENTRIES.COUNT_QUANTITY_CURRENT', 'ISEG-ERFMG', 'InventCountJournalLine.QtyCounted', datetime('now'), datetime('now')),
  ('MAP-INV-CYCLELINE-VARIANCEQUANTITY', 'INV', 'CycleCountLine', 'varianceQuantity', 'MTL_CYCLE_COUNT_ENTRIES.ADJUSTMENT_QUANTITY', 'ISEG-DIFFERENZ', 'InventCountJournalLine.QtyVariance', datetime('now'), datetime('now')),

  -- INV: Lot
  ('MAP-INV-LOT-LOTID', 'INV', 'Lot', 'lotId', 'MTL_LOT_NUMBERS.GEN_OBJECT_ID', 'MCH1-CHARG(KEY)', 'InventBatch.BatchNumber', datetime('now'), datetime('now')),
  ('MAP-INV-LOT-SKUID', 'INV', 'Lot', 'skuId', 'MTL_LOT_NUMBERS.INVENTORY_ITEM_ID', 'MCH1-MATNR', 'InventBatch.ItemId', datetime('now'), datetime('now')),
  ('MAP-INV-LOT-ORGANIZATIONID', 'INV', 'Lot', 'organizationId', 'MTL_LOT_NUMBERS.ORGANIZATION_ID', 'MCH1-WERKS', 'InventBatch.InventSiteId', datetime('now'), datetime('now')),
  ('MAP-INV-LOT-LOTCODE', 'INV', 'Lot', 'lotCode', 'MTL_LOT_NUMBERS.LOT_NUMBER', 'MCH1-CHARG', 'InventBatch.BatchNumber', datetime('now'), datetime('now')),
  ('MAP-INV-LOT-MANUFACTUREDATE', 'INV', 'Lot', 'manufactureDate', 'MTL_LOT_NUMBERS.ORIGINATION_DATE', 'MCHA-HSDAT', 'InventBatch.ProdDate', datetime('now'), datetime('now')),
  ('MAP-INV-LOT-EXPIRYDATE', 'INV', 'Lot', 'expiryDate', 'MTL_LOT_NUMBERS.EXPIRATION_DATE', 'MCHA-VFDAT', 'InventBatch.ExpiryDate', datetime('now'), datetime('now')),
  ('MAP-INV-LOT-STATUS', 'INV', 'Lot', 'status', 'MTL_LOT_NUMBERS.STATUS_ID', 'MCH1-ZUSTD', 'InventBatch.Blocked', datetime('now'), datetime('now')),
  ('MAP-INV-LOT-QUANTITYONHAND', 'INV', 'Lot', 'quantityOnHand', 'MTL_ONHAND_QUANTITIES_DETAIL.PRIMARY_TRANSACTION_QUANTITY', 'MCHB-CLABS', 'InventBatch.AvailPhysical', datetime('now'), datetime('now')),

  -- INV: Serial
  ('MAP-INV-SERIAL-SERIALID', 'INV', 'Serial', 'serialId', 'MTL_SERIAL_NUMBERS.GEN_OBJECT_ID', 'OBJK-EQUNR(KEY)', 'InventSerial.RecId', datetime('now'), datetime('now')),
  ('MAP-INV-SERIAL-SKUID', 'INV', 'Serial', 'skuId', 'MTL_SERIAL_NUMBERS.INVENTORY_ITEM_ID', 'OBJK-MATNR', 'InventSerial.ItemId', datetime('now'), datetime('now')),
  ('MAP-INV-SERIAL-ORGANIZATIONID', 'INV', 'Serial', 'organizationId', 'MTL_SERIAL_NUMBERS.CURRENT_ORGANIZATION_ID', 'OBJK-WERK', 'InventSerial.InventSiteId', datetime('now'), datetime('now')),
  ('MAP-INV-SERIAL-LOTID', 'INV', 'Serial', 'lotId', 'MTL_SERIAL_NUMBERS.LOT_NUMBER', 'OBJK-CHARG', 'InventSerial.BatchNumber', datetime('now'), datetime('now')),
  ('MAP-INV-SERIAL-SERIALNUMBER', 'INV', 'Serial', 'serialNumber', 'MTL_SERIAL_NUMBERS.SERIAL_NUMBER', 'OBJK-SERNR', 'InventSerial.SerialNum', datetime('now'), datetime('now')),
  ('MAP-INV-SERIAL-STATUS', 'INV', 'Serial', 'status', 'MTL_SERIAL_NUMBERS.CURRENT_STATUS', 'OBJK-STATUS', 'InventSerial.StatusIssue', datetime('now'), datetime('now')),

  -- PROJ: Project
  ('MAP-PROJ-PROJECT-PROJECTID', 'PROJ', 'Project', 'projectId', 'PJF_PROJECTS_ALL_B.PROJECT_ID', 'PROJ-PSPNR', 'ProjTable.ProjId', datetime('now'), datetime('now')),
  ('MAP-PROJ-PROJECT-NAME', 'PROJ', 'Project', 'name', 'PJF_PROJECTS_ALL_TL.NAME', 'PROJ-POST1', 'ProjTable.Name', datetime('now'), datetime('now')),
  ('MAP-PROJ-PROJECT-PROJECTTYPE', 'PROJ', 'Project', 'projectType', 'PJF_PROJECT_TYPES_B.PROJECT_TYPE', 'PROJ-PRART', 'ProjTable.TypeId', datetime('now'), datetime('now')),
  ('MAP-PROJ-PROJECT-STATUS', 'PROJ', 'Project', 'status', 'PJF_PROJECTS_ALL_B.PROJECT_STATUS_CODE', 'JEST-STAT', 'ProjTable.Status', datetime('now'), datetime('now')),
  ('MAP-PROJ-PROJECT-BUDGETAMOUNT', 'PROJ', 'Project', 'budgetAmount', 'PJF_PROJECT_BUDGETS.BUDGET_AMOUNT', 'BPJA-WTG001', 'ProjForecastCost.AmountMST', datetime('now'), datetime('now')),
  ('MAP-PROJ-PROJECT-ACTUALCOSTAMOUNT', 'PROJ', 'Project', 'actualCostAmount', 'PJC_COST_DIST_LINES_ALL.ACCOUNTED_DR', 'COSP-WKG001', 'ProjTransPosting.CostAmount', datetime('now'), datetime('now')),
  ('MAP-PROJ-PROJECT-STARTDATE', 'PROJ', 'Project', 'startDate', 'PJF_PROJECTS_ALL_B.START_DATE', 'PROJ-PLFAZ', 'ProjTable.StartDate', datetime('now'), datetime('now')),
  ('MAP-PROJ-PROJECT-ENDDATE', 'PROJ', 'Project', 'endDate', 'PJF_PROJECTS_ALL_B.COMPLETION_DATE', 'PROJ-PLSEZ', 'ProjTable.EndDate', datetime('now'), datetime('now')),
  ('MAP-PROJ-PROJECT-PROJECTMANAGERID', 'PROJ', 'Project', 'projectManagerId', 'PJF_PROJECTS_ALL_B.PROJECT_MANAGER_PERSON_ID', 'PROJ-VERNR', 'ProjTable.WorkerResponsible', datetime('now'), datetime('now')),
  ('MAP-PROJ-PROJECT-ORGANIZATIONID', 'PROJ', 'Project', 'organizationId', 'PJF_PROJECTS_ALL_B.ORG_ID', 'PROJ-BUKRS', 'ProjTable.DataAreaId', datetime('now'), datetime('now')),
  ('MAP-PROJ-PROJECT-WBSID', 'PROJ', 'Project', 'wbsId', 'PJF_PROJ_ELEMENTS.PROJ_ELEMENT_ID', 'PRPS-PSPNR', 'ProjHierarchyElement.ElementId', datetime('now'), datetime('now')),
  ('MAP-PROJ-PROJECT-WIPTOTALBALANCE', 'PROJ', 'Project', 'wipTotalBalance', 'PJC_COST_DIST_LINES_ALL.ACCOUNTED_DR-ACCOUNTED_CR', 'COSP-WKG001', 'ProjWIPBalance.AmountMST', datetime('now'), datetime('now')),

  -- PROJ: ProjectWIP
  ('MAP-PROJ-WIP-WIPID', 'PROJ', 'ProjectWIP', 'wipId', 'PJC_COST_DIST_LINES_ALL.DIST_LINE_ID', 'COEP-BELNR+BUZEI', 'ProjWIPBalance.RecId', datetime('now'), datetime('now')),
  ('MAP-PROJ-WIP-PROJECTID', 'PROJ', 'ProjectWIP', 'projectId', 'PJC_COST_DIST_LINES_ALL.PROJECT_ID', 'COEP-PS_PSP_PNR', 'ProjWIPBalance.ProjId', datetime('now'), datetime('now')),
  ('MAP-PROJ-WIP-STATUS', 'PROJ', 'ProjectWIP', 'status', 'PJC_COST_DIST_LINES_ALL.ACCOUNTING_STATUS_CODE', 'COEP-STFLG', 'ProjWIPBalance.Status', datetime('now'), datetime('now')),
  ('MAP-PROJ-WIP-WIPMATERIALBALANCE', 'PROJ', 'ProjectWIP', 'wipMaterialBalance', 'PJC_COST_DIST_LINES_ALL.RAW_COST', 'COEP-WTG001(MAT)', 'ProjWIPBalance.MaterialAmountMST', datetime('now'), datetime('now')),
  ('MAP-PROJ-WIP-WIPLABORBALANCE', 'PROJ', 'ProjectWIP', 'wipLaborBalance', 'PJC_COST_DIST_LINES_ALL.LABOR_COST', 'COEP-WTG001(LAB)', 'ProjWIPBalance.LaborAmountMST', datetime('now'), datetime('now')),
  ('MAP-PROJ-WIP-WIPOVERHEADBALANCE', 'PROJ', 'ProjectWIP', 'wipOverheadBalance', 'PJC_COST_DIST_LINES_ALL.BURDENED_COST', 'COEP-WTG001(OVH)', 'ProjWIPBalance.OverheadAmountMST', datetime('now'), datetime('now')),
  ('MAP-PROJ-WIP-WIPTOTALBALANCE', 'PROJ', 'ProjectWIP', 'wipTotalBalance', 'PJC_COST_DIST_LINES_ALL.ACCOUNTED_DR-ACCOUNTED_CR', 'COEP-WTG001', 'ProjWIPBalance.AmountMST', datetime('now'), datetime('now')),
  ('MAP-PROJ-WIP-ORGANIZATIONID', 'PROJ', 'ProjectWIP', 'organizationId', 'PJC_COST_DIST_LINES_ALL.ORG_ID', 'COEP-BUKRS', 'ProjWIPBalance.DataAreaId', datetime('now'), datetime('now')),

  -- PROJ: BOMHeader
  ('MAP-PROJ-BOMHEADER-BOMID', 'PROJ', 'BOMHeader', 'bomId', 'EGP_STRUCTURES_B.STRUCTURE_ID', 'STKO-STLNR', 'BOMTable.BOMId', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMHEADER-SKUID', 'PROJ', 'BOMHeader', 'skuId', 'EGP_STRUCTURES_B.ASSEMBLY_ITEM_ID', 'STPO-IDNRK', 'BOMTable.ItemId', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMHEADER-ORGANIZATIONID', 'PROJ', 'BOMHeader', 'organizationId', 'EGP_STRUCTURES_B.ORGANIZATION_ID', 'STKO-WERKS', 'BOMTable.InventSiteId', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMHEADER-REVISION', 'PROJ', 'BOMHeader', 'revision', 'EGP_COMPONENTS_B.REVISION', 'STKO-STLAL', 'BOMTable.ApprovedVersion', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMHEADER-STATUS', 'PROJ', 'BOMHeader', 'status', 'EGP_STRUCTURES_B.BILL_SEQUENCE_STATUS', 'STKO-STLST', 'BOMTable.BOMType', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMHEADER-PROJECTELIGIBLE', 'PROJ', 'BOMHeader', 'projectEligible', 'EGP_STRUCTURES_B.ATTRIBUTE_CATEGORY', 'STKO-KZKUP', 'BOMTable.ProjectSpecific', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMHEADER-COSTINGPROFILE', 'PROJ', 'BOMHeader', 'costingProfile', 'CST_ITEM_COST_PROFILES.COST_METHOD_CODE', 'CKMLHD-BWVAR', 'BOMCalcGroup.CostingVersion', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMHEADER-EFFECTIVEDATE', 'PROJ', 'BOMHeader', 'effectiveDate', 'EGP_STRUCTURES_B.EFFECTIVITY_DATE', 'STKO-DATUV', 'BOMTable.FromDate', datetime('now'), datetime('now')),

  -- PROJ: BOMComponent
  ('MAP-PROJ-BOMCOMPONENT-COMPONENTID', 'PROJ', 'BOMComponent', 'componentId', 'EGP_COMPONENTS_B.COMPONENT_SEQUENCE_ID', 'STPO-STLKN', 'BOMLine.RecId', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMCOMPONENT-BOMID', 'PROJ', 'BOMComponent', 'bomId', 'EGP_COMPONENTS_B.BILL_SEQUENCE_ID', 'STPO-STLNR', 'BOMLine.BOMId', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMCOMPONENT-COMPONENTSKUID', 'PROJ', 'BOMComponent', 'componentSkuId', 'EGP_COMPONENTS_B.COMPONENT_ITEM_ID', 'STPO-IDNRK', 'BOMLine.ItemId', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMCOMPONENT-COMPONENTLINENUMBER', 'PROJ', 'BOMComponent', 'componentLineNumber', 'EGP_COMPONENTS_B.OPERATION_SEQ_NUM', 'STPO-POSNR', 'BOMLine.LineNum', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMCOMPONENT-COMPONENTTYPE', 'PROJ', 'BOMComponent', 'componentType', 'EGP_COMPONENTS_B.SUPPLY_TYPE', 'STPO-POSTP', 'BOMLine.BOMConsump', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMCOMPONENT-QUANTITY', 'PROJ', 'BOMComponent', 'quantity', 'EGP_COMPONENTS_B.COMPONENT_QUANTITY', 'STPO-MENGE', 'BOMLine.BOMQty', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMCOMPONENT-QUANTITYUOM', 'PROJ', 'BOMComponent', 'quantityUom', 'EGP_COMPONENTS_B.PRIMARY_UOM_CODE', 'STPO-MEINS', 'BOMLine.UnitId', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMCOMPONENT-STANDARDCOST', 'PROJ', 'BOMComponent', 'standardCost', 'CST_ITEM_COSTS.UNIT_COST', 'CKIS-WERTN', 'BOMCalcTrans.CostPrice', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMCOMPONENT-COSTELEMENTID', 'PROJ', 'BOMComponent', 'costElementId', 'CST_COST_ELEMENTS_B.COST_ELEMENT_ID', 'CSKB-KSTAR', 'CostCategory.CostCategoryId', datetime('now'), datetime('now')),

  -- PROJ: CostElement
  ('MAP-PROJ-COSTELEMENT-COSTELEMENTID', 'PROJ', 'CostElement', 'costElementId', 'CST_COST_ELEMENTS_B.COST_ELEMENT_ID', 'CSKB-KSTAR', 'CostCategory.CostCategoryId', datetime('now'), datetime('now')),
  ('MAP-PROJ-COSTELEMENT-ORGANIZATIONID', 'PROJ', 'CostElement', 'organizationId', 'HR_ALL_ORGANIZATION_UNITS.ORGANIZATION_ID', 'CSKB-KOKRS', 'CostCategoryHierarchy.DataAreaId', datetime('now'), datetime('now')),
  ('MAP-PROJ-COSTELEMENT-COSTELEMENTNAME', 'PROJ', 'CostElement', 'costElementName', 'CST_COST_ELEMENTS_TL.DESCRIPTION', 'CSKU-KTEXT', 'CostCategory.Name', datetime('now'), datetime('now')),
  ('MAP-PROJ-COSTELEMENT-COSTELEMENTTYPE', 'PROJ', 'CostElement', 'costElementType', 'CST_COST_ELEMENTS_B.COST_ELEMENT_TYPE', 'CSKB-KATYP', 'CostCategory.CostCategoryType', datetime('now'), datetime('now')),
  ('MAP-PROJ-COSTELEMENT-COSTCATEGORY', 'PROJ', 'CostElement', 'costCategory', 'CST_COST_ELEMENTS_B.COST_CATEGORY_CODE', 'CSKB-KSTAR_CLASS', 'CostCategory.CategoryGroup', datetime('now'), datetime('now')),
  ('MAP-PROJ-COSTELEMENT-GLACCOUNTID', 'PROJ', 'CostElement', 'glAccountId', 'GL_CODE_COMBINATIONS.CODE_COMBINATION_ID', 'SKA1-SAKNR', 'MainAccount.MainAccountId', datetime('now'), datetime('now')),
  ('MAP-PROJ-COSTELEMENT-ALLOCATIONMETHOD', 'PROJ', 'CostElement', 'allocationMethod', 'PJF_ALLOC_RULES.ALLOCATION_METHOD', 'KSU1-VERTEILUNG', 'ProjAllocationRule.Method', datetime('now'), datetime('now')),
  ('MAP-PROJ-COSTELEMENT-ISACTIVE', 'PROJ', 'CostElement', 'isActive', 'CST_COST_ELEMENTS_B.ENABLED_FLAG', 'CSKB-LOEVM', 'CostCategory.IsActive', datetime('now'), datetime('now')),

  -- PROJ: ProjectBOMAssignment
  ('MAP-PROJ-BOMASSIGN-ASSIGNMENTID', 'PROJ', 'ProjectBOMAssignment', 'assignmentId', 'PJF_PROJ_ELEMENTS.PROJ_ELEMENT_ID', 'PRPS-PSPNR', 'ProjBOMAssignment.RecId', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMASSIGN-PROJECTID', 'PROJ', 'ProjectBOMAssignment', 'projectId', 'PJF_PROJ_ELEMENTS.PROJECT_ID', 'PRPS-PSPHI', 'ProjBOMAssignment.ProjId', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMASSIGN-WBSID', 'PROJ', 'ProjectBOMAssignment', 'wbsId', 'PJF_PROJ_ELEMENTS.PROJ_ELEMENT_ID', 'PRPS-PSPNR', 'ProjBOMAssignment.WBSId', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMASSIGN-BOMID', 'PROJ', 'ProjectBOMAssignment', 'bomId', 'EGP_STRUCTURES_B.STRUCTURE_ID', 'STKO-STLNR', 'ProjBOMAssignment.BOMId', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMASSIGN-QUANTITYPLANNED', 'PROJ', 'ProjectBOMAssignment', 'quantityPlanned', 'PJF_PLAN_LINES.QUANTITY', 'PLAF-GSMNG', 'ProjBOMAssignment.QtyPlanned', datetime('now'), datetime('now')),
  ('MAP-PROJ-BOMASSIGN-STATUS', 'PROJ', 'ProjectBOMAssignment', 'status', 'PJF_PLAN_LINES.STATUS_CODE', 'PLAF-STATU', 'ProjBOMAssignment.Status', datetime('now'), datetime('now')),

  -- PROJ: ProjectLaborEntry
  ('MAP-PROJ-LABOR-ENTRYID', 'PROJ', 'ProjectLaborEntry', 'entryId', 'PJC_EXP_ITEMS_ALL.EXPENDITURE_ITEM_ID', 'CATSDB-CATSNR', 'ProjHourTrans.RecId', datetime('now'), datetime('now')),
  ('MAP-PROJ-LABOR-PROJECTID', 'PROJ', 'ProjectLaborEntry', 'projectId', 'PJC_EXP_ITEMS_ALL.PROJECT_ID', 'CATSDB-PSPNR', 'ProjHourTrans.ProjId', datetime('now'), datetime('now')),
  ('MAP-PROJ-LABOR-WIPID', 'PROJ', 'ProjectLaborEntry', 'wipId', 'PJC_COST_DIST_LINES_ALL.DIST_LINE_ID', 'COEP-BELNR+BUZEI', 'ProjWIPBalance.RecId', datetime('now'), datetime('now')),
  ('MAP-PROJ-LABOR-WBSID', 'PROJ', 'ProjectLaborEntry', 'wbsId', 'PJC_EXP_ITEMS_ALL.TASK_ID', 'CATSDB-PS_POSID', 'ProjHourTrans.ActivityNumber', datetime('now'), datetime('now')),
  ('MAP-PROJ-LABOR-RESOURCEID', 'PROJ', 'ProjectLaborEntry', 'resourceId', 'PJC_EXP_ITEMS_ALL.PERSON_ID', 'CATSDB-PERNR', 'ProjHourTrans.Worker', datetime('now'), datetime('now')),
  ('MAP-PROJ-LABOR-HOURS', 'PROJ', 'ProjectLaborEntry', 'hours', 'PJC_EXP_ITEMS_ALL.QUANTITY', 'CATSDB-CATSHOURS', 'ProjHourTrans.Hours', datetime('now'), datetime('now')),
  ('MAP-PROJ-LABOR-RATE', 'PROJ', 'ProjectLaborEntry', 'rate', 'PJC_EXP_ITEMS_ALL.RAW_COST_RATE', 'CATSDB-RATE', 'ProjHourTrans.SalesPrice', datetime('now'), datetime('now')),
  ('MAP-PROJ-LABOR-TOTALCOST', 'PROJ', 'ProjectLaborEntry', 'totalCost', 'PJC_EXP_ITEMS_ALL.RAW_COST', 'CATSDB-KOSTL', 'ProjHourTrans.CostAmount', datetime('now'), datetime('now')),
  ('MAP-PROJ-LABOR-COSTELEMENTID', 'PROJ', 'ProjectLaborEntry', 'costElementId', 'PJC_EXP_ITEMS_ALL.EXPENDITURE_TYPE_ID', 'CATSDB-LSTAR', 'ProjHourTrans.CategoryId', datetime('now'), datetime('now')),

  -- PROJ: ProjectFinishedItem
  ('MAP-PROJ-FINISHEDITEM-FINISHEDITEMID', 'PROJ', 'ProjectFinishedItem', 'finishedItemId', 'PJC_COST_DIST_LINES_ALL.DIST_LINE_ID', 'COEP-BELNR+BUZEI', 'ProjFinishedGood.RecId', datetime('now'), datetime('now')),
  ('MAP-PROJ-FINISHEDITEM-PROJECTID', 'PROJ', 'ProjectFinishedItem', 'projectId', 'PJC_COST_DIST_LINES_ALL.PROJECT_ID', 'COEP-PS_PSP_PNR', 'ProjFinishedGood.ProjId', datetime('now'), datetime('now')),
  ('MAP-PROJ-FINISHEDITEM-WIPID', 'PROJ', 'ProjectFinishedItem', 'wipId', 'PJC_COST_DIST_LINES_ALL.DIST_LINE_ID', 'COEP-BELNR+BUZEI', 'ProjWIPBalance.RecId', datetime('now'), datetime('now')),
  ('MAP-PROJ-FINISHEDITEM-SKUID', 'PROJ', 'ProjectFinishedItem', 'skuId', 'PJC_COST_DIST_LINES_ALL.INVENTORY_ITEM_ID', 'COEP-MATNR', 'ProjFinishedGood.ItemId', datetime('now'), datetime('now')),
  ('MAP-PROJ-FINISHEDITEM-ORGANIZATIONID', 'PROJ', 'ProjectFinishedItem', 'organizationId', 'PJC_COST_DIST_LINES_ALL.ORG_ID', 'COEP-BUKRS', 'ProjFinishedGood.DataAreaId', datetime('now'), datetime('now')),
  ('MAP-PROJ-FINISHEDITEM-QUANTITY', 'PROJ', 'ProjectFinishedItem', 'quantity', 'PJC_COST_DIST_LINES_ALL.QUANTITY', 'COEP-MENGE', 'ProjFinishedGood.Qty', datetime('now'), datetime('now')),
  ('MAP-PROJ-FINISHEDITEM-UNITCOST', 'PROJ', 'ProjectFinishedItem', 'unitCost', 'PJC_COST_DIST_LINES_ALL.UNIT_COST', 'COEP-WTG001/MENGE', 'ProjFinishedGood.UnitCost', datetime('now'), datetime('now')),
  ('MAP-PROJ-FINISHEDITEM-TOTALWIPCOST', 'PROJ', 'ProjectFinishedItem', 'totalWipCost', 'PJC_COST_DIST_LINES_ALL.ACCOUNTED_DR', 'COEP-WTG001', 'ProjFinishedGood.WIPCostAmount', datetime('now'), datetime('now'))
;
