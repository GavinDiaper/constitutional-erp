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
        type: `https://process-graph.local/problems/${err.code}`,
        title: err.code,
        status: err.status,
        detail: err.message
      }
    };
  }

  return {
    status: 500,
    body: {
      type: "https://process-graph.local/problems/internal-error",
      title: "internal_error",
      status: 500,
      detail: "Unexpected server error"
    }
  };
}
