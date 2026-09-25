import type { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/apiResponse.js";
import { logger } from "../utils/logger.js";

const errorLog = logger.module("ERROR-HANDLER");

export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  errorLog.error(`Unhandled error: ${err.message}`, {
    stack: err.stack,
    name: err.name,
  });

  sendError(res, 500, "An internal server error occurred. Please try again.");
}
