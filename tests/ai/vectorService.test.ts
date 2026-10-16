import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import {
  generateSemanticEmbedding,
  cosineSimilarity,
  dotProduct,
  normalizeVector,
  searchApprovedEvidenceVector,
  VECTOR_DIMENSION,
} from "../../src/services/ai-gateway/vectorService.js";
import { retrieveEvidenceHybrid, semanticSearchEvidence } from "../../src/services/ai-gateway/evidenceService.js";

describe("vectorService & Semantic RAG", () => {
  it("generates normalized embedding vectors of specified dimension", () => {
    const vec = generateSemanticEmbedding("hot flashes and nighttime waking");
    assert.equal(vec.length, VECTOR_DIMENSION);

    // Vector magnitude should be approximately 1.0 (L2 normalized)
    const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    assert.ok(Math.abs(mag - 1.0) < 0.001);
  });

  it("calculates accurate cosine similarity", () => {
    const v1 = normalizeVector([1, 0, 0]);
    const v2 = normalizeVector([1, 0, 0]);
    const v3 = normalizeVector([0, 1, 0]);

    assert.equal(cosineSimilarity(v1, v2), 1.0);
    assert.equal(cosineSimilarity(v1, v3), 0.0);
  });

  it("semantically clusters related vasomotor and sleep concepts higher than unrelated terms", () => {
    const queryVec = generateSemanticEmbedding("waking up soaking with night sweats");
    const vasomotorVec = generateSemanticEmbedding("vasomotor hot flashes thermoregulation cooling");
    const unrelatedVec = generateSemanticEmbedding("accounting billing subscription payment credit card");

    const simVasomotor = cosineSimilarity(queryVec, vasomotorVec);
    const simUnrelated = cosineSimilarity(queryVec, unrelatedVec);

    assert.ok(
      simVasomotor > simUnrelated,
      `Expected vasomotor (${simVasomotor}) to be higher than unrelated (${simUnrelated})`
    );
  });

  it("performs semantic vector search returning approved records with similarity scores", () => {
    const results = searchApprovedEvidenceVector("sleep disruption insomnia restlessness", {
      maxResults: 3,
      minSimilarity: 0.1,
    });

    assert.ok(results.length > 0);
    assert.ok(results.every((r) => r.similarity >= 0.1));
    assert.ok(results.every((r) => r.record.status === "approved"));
  });

  it("retrieveEvidenceHybrid blends lexical and semantic vector signals", () => {
    const result = retrieveEvidenceHybrid({
      focusArea: "Restorative Sleep & Evening Wind-Down",
      goals: ["Improve sleep quality"],
      reportedAreas: ["Nighttime waking"],
      topicHints: ["sleep"],
    });

    assert.ok(result.items.length > 0);
    assert.ok(result.items.every((item) => item.relevanceScore > 0));
    assert.ok(result.items.every((item) => item.record.status === "approved"));
  });

  it("semanticSearchEvidence provides pure vector retrieval over approved catalog", () => {
    const results = semanticSearchEvidence("cognitive behavioral therapy cbt for insomnia", {
      maxResults: 2,
    });

    assert.ok(results.length > 0);
    assert.equal(results[0].retrievalMode, "semantic");
    assert.ok(results[0].record.citationId.length > 0);
  });
});
