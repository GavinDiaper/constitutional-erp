import { Router } from "express";
import purchaseOrderRouter from "./purchaseOrders";
import salesOrderRouter from "./salesOrders";
import internalTradesRouter from "./internalTrades";
import inventoryRouter from "./inventory";
import generalLedgerRouter from "./generalLedger";

const router = Router();

// API v1 routes
router.use("/v1/purchase-orders", purchaseOrderRouter);
router.use("/v1/sales-orders", salesOrderRouter);
router.use("/v1/internal-trades", internalTradesRouter);
router.use("/v1/inventory", inventoryRouter);
router.use("/v1/general-ledger", generalLedgerRouter);

// Health check
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "foundation-erp",
    timestamp: new Date().toISOString(),
  });
});

export default router;
