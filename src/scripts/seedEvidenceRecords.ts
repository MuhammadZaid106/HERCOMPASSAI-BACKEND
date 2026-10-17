/**
 * Seed Evidence Records Script
 * Run: npx tsx src/scripts/seedEvidenceRecords.ts
 * Seeds approved clinical evidence records into Neon PostgreSQL evidence_records.
 */

import "dotenv/config";
import { sequelize } from "../config/db.js";
import { EvidenceRecordModel } from "../models/EvidenceRecord.js";
import { APPROVED_EVIDENCE } from "../ai/evidence/approvedEvidence.js";
import { logger } from "../utils/logger.js";

const log = logger.module("SEED_EVIDENCE");

async function seedEvidence() {
  try {
    await sequelize.authenticate();
    log.info("Connected to database");

    // Sync table schema
    await EvidenceRecordModel.sync({ alter: true });
    log.info("evidence_records table synced");

    let created = 0;
    let updated = 0;

    for (const record of APPROVED_EVIDENCE) {
      const [row, wasCreated] = await EvidenceRecordModel.findOrCreate({
        where: { evidenceId: record.evidenceId },
        defaults: {
          evidenceId: record.evidenceId,
          citationId: record.citationId,
          sourceName: record.sourceName,
          sourceCategory: record.sourceCategory,
          title: record.title,
          publisher: record.publisher,
          publicationDate: record.publicationDate,
          urlOrIdentifier: record.urlOrIdentifier,
          evidenceType: record.evidenceType,
          authorityLevel: record.authorityLevel,
          consensusLevel: record.consensusLevel,
          recencyScore: record.recencyScore,
          status: record.status,
          reviewedAt: record.reviewedAt,
          reviewedBy: record.reviewedBy,
          clinicianReview: record.clinicianReview,
          version: record.version,
          summary: record.summary,
          keywords: record.keywords,
          topicAreas: record.topicAreas,
        },
      });

      if (!wasCreated) {
        await row.update({
          citationId: record.citationId,
          sourceName: record.sourceName,
          sourceCategory: record.sourceCategory,
          title: record.title,
          publisher: record.publisher,
          publicationDate: record.publicationDate,
          urlOrIdentifier: record.urlOrIdentifier,
          evidenceType: record.evidenceType,
          authorityLevel: record.authorityLevel,
          consensusLevel: record.consensusLevel,
          recencyScore: record.recencyScore,
          status: record.status,
          reviewedAt: record.reviewedAt,
          reviewedBy: record.reviewedBy,
          clinicianReview: record.clinicianReview,
          version: record.version,
          summary: record.summary,
          keywords: record.keywords,
          topicAreas: record.topicAreas,
        });
        updated += 1;
      } else {
        created += 1;
      }
    }

    log.info(`Evidence seeding completed: ${created} created, ${updated} updated.`);
    process.exit(0);
  } catch (error) {
    log.error("Failed to seed evidence records", error);
    process.exit(1);
  }
}

void seedEvidence();
