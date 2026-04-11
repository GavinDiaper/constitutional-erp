"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpError = void 0;
exports.toProblem = toProblem;
class HttpError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
exports.HttpError = HttpError;
function toProblem(err) {
    if (err instanceof HttpError) {
        return {
            status: err.status,
            body: {
                type: `https://authority-engine.local/problems/${err.code}`,
                title: err.code,
                status: err.status,
                detail: err.message
            }
        };
    }
    return {
        status: 500,
        body: {
            type: "https://authority-engine.local/problems/internal-error",
            title: "internal_error",
            status: 500,
            detail: "Unexpected server error"
        }
    };
}
