import type { Response } from "express";

interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: Record<string, string[]> | string[] | Record<string, string>;
}

export function sendSuccess<T>(
  res: Response,
  statusCode: number,
  message: string,
  data: T
): Response {
  const body: ApiSuccessResponse<T> = {
    success: true,
    message,
    data,
  };
  return res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  errors?: Record<string, string[]> | string[] | Record<string, string>
): Response {
  const body: ApiErrorResponse = {
    success: false,
    message,
    ...(errors && { errors }),
  };
  return res.status(statusCode).json(body);
}
