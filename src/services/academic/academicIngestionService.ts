import { pubMedClient } from "./pubmedClient.js";
import { semanticScholarClient, type SemanticScholarMetrics } from "./semanticScholarClient.js";
import { EvidenceSubmission } from "../../models/index.js";
import { APPROVED_EVIDENCE } from "../../ai/evidence/approvedEvidence.js";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

const academicLog = logger.module("ACADEMIC-INGESTION");

export interface IngestedEvidenceCandidate {
  pmid: string;
  doi?: string;
  title: string;
  journal: string;
  publicationYear: number;
  authors: string[];
  metrics: SemanticScholarMetrics;
  evidenceCategory: string;
  organization: string;
  isExisting: boolean;
  submissionId?: string;
}

/**
 * Maps medical keywords to HerCompass Evidence Categories
 */
function inferCategory(title: string, journal: string): string {
  const t = (title + " " + journal).toLowerCase();
  if (t.includes("sleep") || t.includes("insomnia") || t.includes("circadian")) {
    return "sleep_architecture";
  }
  if (t.includes("vasomotor") || t.includes("hot flash") || t.includes("night sweat") || t.includes("flushing")) {
    return "vasomotor_management";
  }
  if (t.includes("diet") || t.includes("nutrition") || t.includes("phytoestrogen") || t.includes("magnesium")) {
    return "nutrition_guidelines";
  }
  if (t.includes("cbt") || t.includes("cognitive") || t.includes("mindfulness") || t.includes("stress")) {
    return "behavioral_cbt";
  }
  if (t.includes("hormone") || t.includes("hrt") || t.includes("estrogen")) {
    return "hormone_therapy_position";
  }
  if (t.includes("bone") || t.includes("osteoporosis") || t.includes("joint")) {
    return "bone_density_support";
  }
  return "clinical_guideline";
}

function inferOrganization(journal: string): string {
  const j = journal.toLowerCase();
  if (j.includes("menopause") || j.includes("nams")) return "North American Menopause Society (NAMS)";
  if (j.includes("obstetrics") || j.includes("acog")) return "American College of Obstetricians and Gynecologists (ACOG)";
  if (j.includes("sleep")) return "American Academy of Sleep Medicine";
  if (j.includes("jama")) return "American Medical Association (JAMA)";
  if (j.includes("who")) return "World Health Organization (WHO)";
  return "Peer-Reviewed Medical Faculty";
}

export class AcademicIngestionService {
  /**
   * Searches PubMed and cross-references citation metrics via Semantic Scholar.
   */
  async searchAndEnrich(query: string, maxResults: number = 6): Promise<IngestedEvidenceCandidate[]> {
    const pubMedResults = await pubMedClient.search(query, maxResults);
    const candidates: IngestedEvidenceCandidate[] = [];

    const hasDb = Boolean(env.DATABASE_URL && env.DATABASE_URL.trim() !== "");

    for (const item of pubMedResults) {
      const identifier = item.doi || item.pmid;
      const metrics = await semanticScholarClient.getPaperMetrics(identifier);
      
      // Check if already in catalog or submission queue
      const inCatalog = APPROVED_EVIDENCE.some(
        (rec) =>
          (rec.urlOrIdentifier && rec.urlOrIdentifier.includes(item.pmid)) ||
          (item.doi && rec.urlOrIdentifier && rec.urlOrIdentifier.includes(item.doi))
      );

      let existingSubmission = null;
      if (hasDb) {
        try {
          existingSubmission = await EvidenceSubmission.findOne({
            where: { urlOrIdentifier: `https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/` },
          });
        } catch {
          // offline mode
        }
      }

      candidates.push({
        pmid: item.pmid,
        doi: item.doi,
        title: item.title,
        journal: item.journal,
        publicationYear: item.publicationYear,
        authors: item.authors,
        metrics,
        evidenceCategory: inferCategory(item.title, item.journal),
        organization: inferOrganization(item.journal),
        isExisting: Boolean(inCatalog || existingSubmission),
        submissionId: existingSubmission?.id,
      });
    }

    return candidates;
  }

  /**
   * Ingests a specific paper by PMID into the HerCompass Evidence Submission queue.
   */
  async ingestPaper(
    pmid: string,
    staffUserId: string,
    customNote: string = "Automated ingestion via PubMed and Semantic Scholar connectors"
  ): Promise<{ success: boolean; submissionId?: string; message: string }> {
    const article = await pubMedClient.getArticle(pmid);
    if (!article) {
      return { success: false, message: `Could not retrieve article details for PMID ${pmid}` };
    }

    const urlOrId = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
    const hasDb = Boolean(env.DATABASE_URL && env.DATABASE_URL.trim() !== "");

    if (!hasDb) {
      return {
        success: true,
        submissionId: `mock-sub-${pmid}`,
        message: "Paper ingested into clinical review queue (offline mode)",
      };
    }

    try {
      const existing = await EvidenceSubmission.findOne({ where: { urlOrIdentifier: urlOrId } });
      if (existing) {
        return { success: true, submissionId: existing.id, message: "Paper is already in submission queue" };
      }

      const metrics = await semanticScholarClient.getPaperMetrics(article.doi || pmid);
      const evidenceId = `ev-pmid-${pmid}`;
      const category = inferCategory(article.title, article.journal);
      const org = inferOrganization(article.journal);

      const submission = await EvidenceSubmission.create({
        evidenceId,
        sourceName: `${article.journal} (${article.publicationYear})`,
        organization: org,
        topic: article.title.slice(0, 160),
        publicationDate: `${article.publicationYear}-01-01`,
        urlOrIdentifier: urlOrId,
        evidenceCategory: category,
        status: "submitted",
        staffUserId,
        reviewNotes: `${customNote} | Authority Level: ${metrics.authorityLevel}/5, Consensus Level: ${metrics.consensusLevel}/5, Citations: ${metrics.citationCount}`.slice(0, 280),
      });

      academicLog.info(`Successfully ingested academic paper ${evidenceId} (${article.title})`);
      return { success: true, submissionId: submission.id, message: "Paper successfully ingested into clinical review queue" };
    } catch (err) {
      academicLog.error(`Failed to ingest paper PMID ${pmid}:`, err);
      return { success: false, message: "Database write failed during academic ingestion" };
    }
  }
}

export const academicIngestionService = new AcademicIngestionService();
