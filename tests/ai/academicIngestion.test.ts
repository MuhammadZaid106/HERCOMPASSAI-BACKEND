import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import { pubMedClient } from "../../src/services/academic/pubmedClient.js";
import { semanticScholarClient } from "../../src/services/academic/semanticScholarClient.js";
import { academicIngestionService } from "../../src/services/academic/academicIngestionService.js";

describe("Academic Ingestion Pipelines (PubMed & Semantic Scholar)", () => {
  it("searches PubMed and returns structured abstracts with PMIDs", async () => {
    const results = await pubMedClient.search("menopause sleep", 3);
    assert.ok(results.length > 0);
    assert.ok(results[0].pmid.length > 0);
    assert.ok(results[0].title.length > 0);
    assert.ok(Number.isInteger(results[0].publicationYear));
  });

  it("fetches structured article details by PMID", async () => {
    const article = await pubMedClient.getArticle("36166744");
    assert.ok(article);
    assert.equal(article?.pmid, "36166744");
    assert.ok(article?.title.includes("hormone therapy") || article?.title.includes("Menopause"));
    assert.ok(article?.journal.length > 0);
    assert.ok(article?.authors.length > 0);
  });

  it("calculates Semantic Scholar clinical metrics correctly", () => {
    // Authority Level
    assert.equal(semanticScholarClient.calculateAuthorityLevel("JAMA"), 5);
    assert.equal(semanticScholarClient.calculateAuthorityLevel("Menopause"), 5);
    assert.equal(semanticScholarClient.calculateAuthorityLevel("Journal of Midlife Science"), 4);

    // Consensus Level
    assert.equal(semanticScholarClient.calculateConsensusLevel(200, 20), 5);
    assert.equal(semanticScholarClient.calculateConsensusLevel(60, 8), 4);
    assert.equal(semanticScholarClient.calculateConsensusLevel(25, 3), 3);

    // Recency Score
    const currentYear = new Date().getFullYear();
    assert.equal(semanticScholarClient.calculateRecencyScore(currentYear), 1.0);
    assert.equal(semanticScholarClient.calculateRecencyScore(currentYear - 4), 0.9);
    assert.ok(semanticScholarClient.calculateRecencyScore(2010) <= 0.55);
  });

  it("academicIngestionService enriches search results with citation metrics", async () => {
    const candidates = await academicIngestionService.searchAndEnrich("insomnia", 2);
    assert.ok(candidates.length > 0);
    const cand = candidates[0];
    assert.ok(cand.pmid.length > 0);
    assert.ok(cand.metrics.authorityLevel >= 1 && cand.metrics.authorityLevel <= 5);
    assert.ok(cand.metrics.consensusLevel >= 1 && cand.metrics.consensusLevel <= 5);
    assert.ok(cand.metrics.recencyScore > 0);
    assert.ok(cand.evidenceCategory.length > 0);
  });
});
