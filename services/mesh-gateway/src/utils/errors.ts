import { ZodError } from "zod";

export class HttpError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function toProblem(err: unknown): { status: number; body: Record<string, unknown> } {
  if (err instanceof HttpError) {
    return {
      status: err.status,
      body: {
        type: `https://mesh-gateway.local/problems/${err.code}`,
        title: err.code,
        status: err.status,
        detail: err.message
      }
    };
  }

  if (err instanceof ZodError) {
    return {
      status: 400,
      body: {
        type: "https://mesh-gateway.local/problems/validation_error",
        title: "validation_error",
        status: 400,
        detail: "Request failed validation",
        errors: err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code
        }))
      }
    };
  }

  return {
    status: 500,
    body: {
      type: "https://mesh-gateway.local/problems/internal_error",
      title: "internal_error",
      status: 500,
      detail: "Unexpected server error"
    }
  };
}
