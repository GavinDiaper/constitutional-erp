// Client-supplied tier is never forwarded: the Mesh asserts the tier the Authority Engine derived.
export function adapterHeadersFromRequest(req: any, actor?: { id: string; tier?: number }): Record<string, string> {
  const headers: Record<string, string> = {};
  const values: Array<[string, string | undefined]> = [
    ["authorization", req.header("authorization") ?? undefined],
    ["x-actor-email", req.header("x-actor-email") ?? undefined],
    ["x-actor-h2r-employee-id", req.header("x-actor-h2r-employee-id") ?? undefined]
  ];

  for (const [key, value] of values) {
    if (value && value.trim()) {
      headers[key] = value;
    }
  }

  if (actor) {
    headers["x-actor-id"] = actor.id;
    headers["x-actor-tier"] = String(actor.tier ?? 1);
  }

  return headers;
}
