import { AiRequestExcerpt } from "../../models/index.js";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

const log = logger.module("AI-EXCERPT");
const CAP = 8000;

export function truncateExcerpt(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= CAP) return trimmed;
  return `${trimmed.slice(0, CAP)}…`;
}

export async function recordAiExcerpt(
  requestId: string,
  inputExcerpt: string,
  outputExcerpt: string,
): Promise<void> {
  if (env.DATABASE_URL.trim() === "") return;
  try {
    await AiRequestExcerpt.upsert({
      requestId,
      inputExcerpt: truncateExcerpt(inputExcerpt),
      outputExcerpt: truncateExcerpt(outputExcerpt),
    });
  } catch (error) {
    log.warn(`Could not store request excerpt ${requestId}: ${String(error)}`);
  }
}
