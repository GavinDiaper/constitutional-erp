"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.newId = newId;
function newId(prefix) {
    return `${prefix}${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}
