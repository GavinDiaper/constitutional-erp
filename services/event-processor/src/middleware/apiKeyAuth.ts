import { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/errors";

export function apiKeyAuth(requiredApiKey: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = req.header("x-api-key");
    if (!key || key !== requiredApiKey) {
      next(new HttpError(401, "unauthorized", "Missing or invalid API key"));
      return;
    }

    next();
  };
}