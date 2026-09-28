# HerCompass AI Gateway

The single control point between product features and model providers.

Feature modules never call a model. They call the Gateway, and the Gateway decides
authorization, consent, context, evidence, engine, prompt, safety, confidence,
audit and fallback. Llama 3 and Med42 are replaceable engines — they are not the
HerCompass Intelligence Stack™. The Gateway is the architectural control point, and
a model swap is a configuration change plus a deploy, not a code change.

## Pipeline

`src/services/ai-gateway/gateway.ts` is the orchestrator. Every request follows the
same path, in this order:

1. **Authorize** — feature policy declares the roles allowed to use it. The Gateway
   checks this before anything else; the model never makes an authorization
   decision.
2. **Validate** — identity, known feature, locale, and (for partner features) an
   active sharing scope. Rejections are structured, so the HTTP status and the
   audit finding are never inferred by matching words in a message.
3. **Consent** — a `granted` consent scope is required before any personal data
   enters a prompt.
4. **Deterministic context** — scores computed by deterministic application
   software are read from the server-side profile. The client never supplies
   context. Only scalars are carried forward, and signals that contradict each
   other are reconciled and flagged.
5. **Evidence retrieval** — only `approved` records from the Clinical Knowledge
   Folder. A model can never select an arbitrary internet source.
6. **Route** — the router reads the declared routing policy, drops engines that
   are not actually registered, and returns an ordered attempt plan.
7. **Prompt** — a versioned prompt bundle is assembled; its checksum is recorded.
8. **Generate** — attempts proceed in order. A non-retryable failure (an
   unconfigured engine, for example) skips to the next route rather than abandoning
   the request.
9. **Schema validation** — the payload must satisfy the feature output contract.
   Confidence, verified citations, safety status and the safety notice are
   deliberately *not* in the model schema: the model cannot assert them.
10. **Guardrails** — diagnostic, prescriptive, prognosis, unsafe, crisis and
    numeric-grounding checks run over the response.
11. **Citation verification** — every claim is resolved against the citation
    registry. Unsupported claims are removed, deterministically, so the repair is
    auditable.
12. **Confidence** — computed by deterministic software, never by the model.
13. **SCI** — the Self-Checking Integrity pass gates the response.
14. **Fallback** — anything that fails steps 8–13 is replaced with a deterministic,
    non-model response.
15. **Audit** — provenance is persisted (when a database is configured).

## Endpoints

All under `/api/ai`, all requiring an authenticated session, and all rate limited
except the health check.

| Method | Path              | Purpose                                             |
| ------ | ----------------- | --------------------------------------------------- |
| `POST` | `/api/ai/snapshot` | Personal Menopause Snapshot™                        |
| `POST` | `/api/ai/insight`  | On-demand AI insight                                |
| `POST` | `/api/ai/feedback` | Thumbs up/down plus free text on an AI event        |
| `GET`  | `/api/ai/health`   | Gateway and engine health (admin/developer only)    |

Successful generations return the approved output plus a `provenance` object. The
client can display confidence, citations and the safety notice, and can quote a
provenance record when reporting a problem.

## Adding an engine

Implement `ModelProvider` from `src/ai/types/provider.ts`:

```ts
generate(request): Promise<ModelGenerationResponse>
healthCheck(): Promise<ProviderHealth>
getCapabilities(): ModelCapabilities
getModelMetadata(): ModelMetadata
```

Register it in `src/ai/providers/index.ts` — gated on configuration so an
unconfigured engine never enters the route — and add its name to a
`fallbackChain` in `src/config/aiGateway.ts`. Wrap every failure in
`ModelProviderError` with a `kind` so the Gateway can classify it without leaking
provider messages or keys to the client.

## Determinism rules

These are the rules the codebase exists to enforce, and the tests exist to protect:

- **The model never calculates.** Confidence, scores and signal reconciliation are
  deterministic application software.
- **The model never asserts its own reliability.** Confidence is derived from
  evidence strength, data completeness, pattern consistency and the generation
  event.
- **The model never selects a source.** Retrieval returns approved records only.
- **The model never asserts citations.** Citations are resolved server-side, and a
  claim that cannot be resolved is removed.
- **The model never owns safety status or the safety notice.** Both are attached
  by the Gateway.

## Evidence governance

`src/ai/evidence/approvedEvidence.ts` is a **seed catalog**. Its summaries and
quality metadata are placeholders, and `reviewedBy` is recorded as
`clinical-knowledge-folder-seed`. Before production, a named Lead Clinician must
verify every record's wording, publication date and quality ratings, and set a real
`reviewedBy`. Records must also be moved into a governed store; the catalog is
in-process so that a bad deployment cannot silently reach production.

Retrieval is deterministic lexical scoring: keyword and phrase overlap weighted by
authority, consensus and recency. `scoreRecord` in
`src/services/ai-gateway/evidenceService.ts` is the seam where pgvector semantic
retrieval replaces the lexical implementation — replace that function and the rest
of the Gateway is unchanged.

## Guardrails

Patterns live in `src/ai/guardrails/languagePatterns.ts` and encode the clinical
rules directly. They are deliberately precise: a guardrail that fires on ordinary
wellness advice is worse than none, because it trains members to ignore the real
ones. Whenever you add a pattern, add a test that it does *not* fire on safe
language.

Ungrounded figures produce a `warn`, not a block. The citation verifier strips the
claim deterministically, which is safer than discarding an otherwise sound
response.

Crisis disclosure is tracked separately from unsafe content so the Gateway can
answer with a supportive crisis notice rather than a generic failure.

## Fallback

`src/services/ai-gateway/fallbackService.ts` produces a response containing no
model-authored string: reviewed constants plus restatements of the deterministic
context, with every recommendation citing the approved record it came from. It is
served for transport failures, malformed output, guardrail blocks and SCI failures,
so a member is never shown an empty screen because of an engine problem.

The fallback returns nothing when no approved evidence was retrieved. That case
produces a retryable failure instead of a hollow response.

## Configuration

See `.env.example`. Version stamps (`AI_GATEWAY_SCI_VERSION`,
`AI_GATEWAY_EVIDENCE_VERSION`, `AI_GATEWAY_CONFIG_VERSION`) are written to every
audit record, so bump them whenever behaviour changes and a past decision can be
reconstructed. `AI_GATEWAY_CI_VERSION` is a legacy alias for the SCI version, read
only when `AI_GATEWAY_SCI_VERSION` is unset.

There is no offline engine. Routing resolves against the three registered
providers (`med42`, `llama`, `openai_compatible`); an unconfigured provider is
skipped at request time. If every configured engine fails, the deterministic
fallback above is served.

### Llama and Med42 on Hugging Face

Both engines use the shared OpenAI-compatible transport, so pointing them at the
Hugging Face Inference API is configuration only — no code change:

```env
LLAMA_PROVIDER_URL=https://router.huggingface.co
LLAMA_PROVIDER_KEY=<your HF read token>
LLAMA_MODEL=<a chat/instruct repo id>
LLAMA_MODEL_VERSION=<pin, e.g. the repo commit sha>

MED42_PROVIDER_URL=https://router.huggingface.co
MED42_PROVIDER_KEY=<your HF read token>
MED42_MODEL=<a Med42 chat/instruct repo id>
MED42_MODEL_VERSION=<pin>
```

Get the token from `https://huggingface.co/settings/tokens` (the `read` scope is
enough). It is sent as `Authorization: Bearer <token>`, which is what the
Hugging Face router expects.

Two things that catch people out:

- **Do not append `/v1` yourself.** The transport appends
  `/v1/chat/completions` to `*_PROVIDER_URL`, so a URL ending in `/v1` produces
  `/v1/v1/chat/completions` and a 404 that looks like a bad token.
- **Pick a chat/instruct repo, and expect licence walls.** The hosted router will
  not serve gated repos. If `meta-llama/Llama-3.1-8B` returns 401/403, accept the
  licence on the model page, or use an open mirror such as
  `NousResearch/Meta-Llama-3.1-8B-Instruct`. Med42 is a large model, so expect a
  slower cold start on the shared router.

Pin `*_MODEL_VERSION` to a specific commit so a changed upstream model cannot
silently alter past AI decisions that are meant to be reproducible in the audit
trail.

To self-host instead, serve either weights with TGI or vLLM and point
`*_PROVIDER_URL` at that server's root (again, no trailing `/v1`); the key can be
left blank for a local server, in which case no `Authorization` header is sent.

## Tests

```bash
npm test        # 71 tests
npm run typecheck
npm run build
```

Tests use Node's built-in runner through `tsx`; no test framework dependency was
added. `tests/setupEnv.ts` must be imported first by any test file, because
`config/env.ts` reads `process.env` at import time. The suite leaves
`DATABASE_URL` empty, so it never touches a real database.

| File                               | Covers                                                    |
| ---------------------------------- | --------------------------------------------------------- |
| `tests/ai/gateway.test.ts`         | End-to-end pipeline, fallback paths, crisis, authorization |
| `tests/ai/guardrails.test.ts`      | Diagnostic, prescriptive, crisis and numeric rules         |
| `tests/ai/citationVerifier.test.ts`| Citation resolution and claim removal                     |
| `tests/ai/determinism.test.ts`     | JSON recovery, retrieval, routing, confidence             |
| `tests/ai/routes.test.ts`          | Mounted surface and authentication enforcement             |
| `tests/ai/models.test.ts`          | AI audit table identifiers, cascades and associations      |
| `tests/auth/sessionSecurity.test.ts` | Refresh reuse detection, Google sign-in contract, roles |

Session security (Google ID-token verification and refresh token reuse
detection) is documented in [auth-sessions.md](./auth-sessions.md).

## Audit trail

`ai_audit_logs` records one row per AI event with the request id, actor, engine and
model version, prompt version and checksum, evidence/SCI/config versions, latency,
citations, confidence, safety status and SCI findings. `ai_feedback` captures the
member's response. `ai_flags` is the human-in-the-loop review queue.

All three key their identifiers as UUIDs, and all three cascade from `users`, so
account deletion is complete. `ai_flags.requestId` is a foreign key onto the unique
`ai_audit_logs.requestId`, so a reviewer can open the exact event that was flagged
and a flag can never outlive the event it describes.

## Not yet built

Stated plainly so these are not mistaken for working features:

- **Partner consent and authorization tables.** The Gateway enforces and serves
  `partner_digest`, but no M2 consent/authorization tables exist, so no public
  partner endpoint is exposed. Do not expose one until that authorization layer
  exists — the Gateway cannot invent a scope it was not given.
- **Semantic retrieval.** Lexical scoring only; see the pgvector seam above.
- **Clinically reviewed evidence.** See Evidence governance.
- **Per-request budget and quota accounting.** Rate limiting exists; token spend
  is not yet metered.
