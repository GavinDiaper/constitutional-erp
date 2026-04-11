import { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/errors";

function normalizeIp(ip: string): string {
  return ip.replace("::ffff:", "");
}

function ipv4ToInt(ip: string): number | undefined {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return undefined;
  }

  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return undefined;
  }

  return octets.reduce((value, octet) => ((value << 8) | octet) >>> 0, 0);
}

function matchesAllowlistEntry(ip: string, entry: string): boolean {
  if (entry === ip) {
    return true;
  }

  const [range, prefixLengthValue] = entry.split("/");
  if (!prefixLengthValue) {
    return false;
  }

  const ipValue = ipv4ToInt(ip);
  const rangeValue = ipv4ToInt(range);
  const prefixLength = Number(prefixLengthValue);
  if (ipValue === undefined || rangeValue === undefined || !Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) {
    return false;
  }

  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (ipValue & mask) === (rangeValue & mask);
}

export function internalTrafficGuard(options: {
  allowlist: string[];
  ingressIdHeader: string;
  ingressIdValue: string;
}) {
  const allowlist = options.allowlist.map(normalizeIp);

  return (req: Request, _res: Response, next: NextFunction): void => {
    const ingressId = req.header(options.ingressIdHeader);
    const sourceIp = normalizeIp(req.ip || req.socket.remoteAddress || "");

    if (!allowlist.some((entry) => matchesAllowlistEntry(sourceIp, entry))) {
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
