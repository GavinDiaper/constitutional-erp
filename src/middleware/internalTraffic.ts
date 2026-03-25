import { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/errors";

function normalizeIp(ip: string): string {
  return ip.replace("::ffff:", "");
}

export function internalTrafficGuard(options: {
  allowlist: string[];
  ingressIdHeader: string;
  ingressIdValue: string;
}) {
  const allowlist = new Set(options.allowlist.map(normalizeIp));

  return (req: Request, _res: Response, next: NextFunction): void => {
    const ingressId = req.header(options.ingressIdHeader);
    const sourceIp = normalizeIp(req.ip || req.socket.remoteAddress || "");

    if (!allowlist.has(sourceIp)) {
      next(new HttpError(403, "forbidden_source", "Request source is not trusted"));
      return;
    }

    if (ingressId !== options.ingressIdValue) {
      next(new HttpError(403, "forbidden_ingress", "Ingress identity header is invalid"));
      return;
    }

    next();
  };
}
