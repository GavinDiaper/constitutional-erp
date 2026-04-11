"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventRouter = void 0;
const express_1 = require("express");
const eventStore_1 = require("../events/eventStore");
exports.eventRouter = (0, express_1.Router)();
exports.eventRouter.get("/events", (req, res) => {
    const limit = Number(req.query.limit ?? 100);
    const after = typeof req.query.after === "string" ? req.query.after : undefined;
    const rows = (0, eventStore_1.listAuthorityEvents)(limit, after);
    res.json({ data: rows });
});
