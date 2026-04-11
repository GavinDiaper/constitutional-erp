"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorityRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const connection_1 = require("../db/connection");
const evaluateAuthority_1 = require("../domain/evaluateAuthority");
const authorityDomainSchema = zod_1.z.union([zod_1.z.literal("O2C"), zod_1.z.literal("P2P"), zod_1.z.literal("R2R"), zod_1.z.literal("H2R")]);
const requestSchema = zod_1.z.object({
    actorId: zod_1.z.string().min(1),
    action: zod_1.z.string().min(1),
    domain: authorityDomainSchema,
    context: zod_1.z.record(zod_1.z.unknown()).optional()
});
const eligibleApproversQuerySchema = zod_1.z.object({
    tier: zod_1.z.coerce.number().int().min(1).max(5),
    domain: authorityDomainSchema
});
exports.authorityRouter = (0, express_1.Router)();
exports.authorityRouter.post("/check", (req, res) => {
    const input = requestSchema.parse(req.body);
    const result = (0, evaluateAuthority_1.evaluateAuthority)(input);
    res.json(result);
});
exports.authorityRouter.get("/eligible-approvers", (req, res) => {
    const query = eligibleApproversQuerySchema.parse(req.query);
    const rows = connection_1.db
        .prepare(`SELECT DISTINCT ap.employee_id AS employeeId
       FROM authority_position ap
       INNER JOIN authority_subject s ON s.employee_id = ap.employee_id
       WHERE ap.authority_domain = ?
         AND ap.authority_tier >= ?
         AND ap.active = 1
         AND s.status = 'Active'
       ORDER BY ap.authority_tier ASC, ap.employee_id ASC`)
        .all(query.domain, query.tier);
    res.json({ approvers: rows.map((row) => row.employeeId) });
});
