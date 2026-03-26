"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorityRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const evaluateAuthority_1 = require("../domain/evaluateAuthority");
const authorityDomainSchema = zod_1.z.union([zod_1.z.literal("O2C"), zod_1.z.literal("P2P"), zod_1.z.literal("R2R"), zod_1.z.literal("H2R")]);
const requestSchema = zod_1.z.object({
    actorId: zod_1.z.string().min(1),
    action: zod_1.z.string().min(1),
    domain: authorityDomainSchema,
    context: zod_1.z.record(zod_1.z.unknown()).optional()
});
exports.authorityRouter = (0, express_1.Router)();
exports.authorityRouter.post("/check", (req, res) => {
    const input = requestSchema.parse(req.body);
    const result = (0, evaluateAuthority_1.evaluateAuthority)(input);
    res.json(result);
});
