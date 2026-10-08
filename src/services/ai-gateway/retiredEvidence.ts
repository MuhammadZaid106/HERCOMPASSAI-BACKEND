import { EvidenceStatus } from "../../models/EvidenceStatus.js";
import { logger } from "../../utils/logger.js";

const evidenceLog = logger.module("EVIDENCE");

/** Ids staff have retired. A read failure leaves the set empty so a snapshot can still be written. */
export async function loadRetiredEvidenceIds(): Promise<Set<string>> {
  try {
    const rows = await EvidenceStatus.findAll({
      where: { status: "retired" },
      attributes: ["evidenceId"],
    });
    return new Set(rows.map((row) => row.evidenceId));
  } catch (error) {
    evidenceLog.warn("Retired evidence ids could not be read", error);
    return new Set();
  }
}
