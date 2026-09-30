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
   software are read from the server-side profile, and the Deterministic Trend
   Engine's calculations are added. The client never supplies context. Only
   scalars are carried forward, and signals that contradict each other are
   reconciled and flagged.
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

### The member Snapshot route

`GET /api/onboarding/snapshot?refresh=true` is the endpoint the Snapshot page
calls, and it is the product's primary AI surface — the AI Lab is only a test
bench. It delegates to `src/services/onboarding/personalSnapshotService.ts`,
which runs the same `runGateway` invocation as `/api/ai/snapshot` and then does
presentation only. There is no second, cheaper way to produce a Snapshot; the
static implementation this replaced is why a fully built Gateway could go
unnoticed by every member.

| Situation                   | Status | `errors.reason` | What the client shows             |
| --------------------------- | ------ | --------------- | --------------------------------- |
| No access token             | 401    | `unauthenticated` | Sign in                          |
| Not a member role           | 403    | `forbidden_role`  | Partner portal instead           |
| No completed assessment     | 404    | `not_completed`   | Finish onboarding                |
| Consent absent or revoked   | 403    | `consent_required`| Review consent                   |
| Gateway could not produce   | 502/503/422 | `ai_unavailable` | Retry, and the answers are saved |
| Backend unreachable         | n/a (status 0 client-side) | `network` | Retry when back online |

The reason matters more than the message. A single "not ready" panel is what made
an engine outage look like a member who had never filled in the questionnaire,
so the client is expected to branch on it rather than on truthiness of the data.

`?refresh=true` skips the stored artifact and regenerates, which is how a member
picks up check-ins logged since the Snapshot was built.

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

- **The model never calculates.** Confidence, scores, signal reconciliation and the
  Trend Engine's averages, directions and percentage changes are deterministic
  application software.
- **The model never asserts its own reliability.** Confidence is derived from
  evidence strength, data completeness, pattern consistency and the generation
  event.
- **The model never selects a source.** Retrieval returns approved records only.
- **The model never asserts citations.** Citations are resolved server-side, and a
  claim that cannot be resolved is removed.
- **The model never owns safety status or the safety notice.** Both are attached
  by the Gateway.

## The Trend Engine → LLM binding

`src/services/intelligence/memberTrendService.ts` is the only module that knows how
a stored tracking row becomes a number. It reads one parallel query per domain over
a 30-day window and hands the Gateway `TrendEngineOutput`:

- symptom load per day (member's 1-10 intensity when present, otherwise the count
  of distinct symptoms logged — never the two mixed in one series);
- mood level, energy level, and sleep quality mapped from an ordered category to an
  ordinal;
- recent vs prior averages, percentage change, and direction per domain;
- days logged, consistency, check-in streak, and precomputed pattern indicators;
- `insufficientData`, so "not enough logged data yet" is a machine-readable fact
  the prompt can state instead of something the model has to guess.

What reaches the model is `GatewayContext.trend` plus a `trend.*` slice of
`deterministic.metrics`. The metrics slice is what makes the numbers *usable*: the
numeric-grounding guardrail permits a figure it finds in that bag, so a trend the
engine calculated is a trend the model may state, and a trend the engine did not
calculate is a trend the model gets blocked from inventing.

Three constraints are enforced rather than documented:

- **No raw data.** Notes, journal text, timestamps and lifestyle rows never enter
  model context; only derived scalars do.
- **No partner access.** `buildContext` sets `trend: null` for `partner_digest`, so
  a partner digest cannot contain the member's daily series even if a future
  template asks for it.
- **No invented defaults.** A score the engine did not produce is omitted from the
  metric bag, not set to zero, and the client renders a dash.

`AI_GATEWAY_CONFIG.trendEngine` holds `rangeDays` and `minimumDaysForPatterns`; the
window and the sufficiency threshold are threaded into
`calculateMemberTrends` rather than hardcoded, so the Snapshot, the Progress
dashboard and the prompt cannot disagree about what "30 days" or "enough data"
means.

## Evidence governance

`src/ai/evidence/approvedEvidence.ts` is a **source-labeled catalog**. Each record names a public source, a title, and a publication year. `clinicianReview` is `pending` and `reviewedBy` is `pending-named-clinician`. A named clinician still has to approve the wording. Retrieval drops any record that has no source name or year. A citation is shown only when it matches a record retrieved for that request.

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

Routing failure is included: when no engine is addressable for a feature, the
member still gets their verified numbers rather than a 503 telling them their
data is lost, which it is not.

Every fallback response carries `diagnostics` (see "Diagnosing a model that is not
responding" below) and a `provenance.degradation` record. A degraded result is
never silently indistinguishable from a clean one, and a clean approved result
carries no failure vocabulary at all.

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
- **The configured model must be one your token can actually reach.** The router
  answers HTTP 400 `model_not_supported` when the repo is not served by any
  provider enabled for your account, and HTTP 401/403 when the licence has not been
  accepted. This is the most common reason the Gateway produces nothing, and it is a
  configuration problem, not an outage. Confirm a model id works with a single
  request before trusting a health check:

  ```bash
  curl -sS https://router.huggingface.co/v1/chat/completions \
    -H "Authorization: Bearer $LLAMA_PROVIDER_KEY" \
    -H 'Content-Type: application/json' \
    -d '{"model":"<repo id>","messages":[{"role":"user","content":"ping"}],"max_tokens":1}'
  ```

  Then `GET /api/ai/health` (admin/developer) reports the same failure with the
  model id and the provider's explanation attached, so the two can be compared
  directly.
- **Pick a chat/instruct repo, and expect licence walls.** The hosted router will
  not serve gated repos. If `meta-llama/Llama-3.1-8B` returns 401/403, accept the
  licence on the model page, or use an open mirror such as
  `NousResearch/Meta-Llama-3.1-8B-Instruct`. Med42 is a large model, so expect a
  slower cold start on the shared router.

Pin `*_MODEL_VERSION` to a specific commit so a changed upstream model cannot
silently alter past AI decisions that are meant to be reproducible in the audit
trail. Changing `*_MODEL` without changing the pin leaves the audit trail claiming
a version the current model does not have, so update both together.

### Choosing a model on the shared router

Measured on the same router and the same Snapshot contract, so the two are directly
comparable:

| Model | Throughput | Full Snapshot round trip | Outcome |
| --- | --- | --- | --- |
| `meta-llama/Llama-3.1-8B-Instruct` | 28 tok/s | over 20s | timed out, then `schema_invalid` |
| `meta-llama/Llama-3.3-70B-Instruct` | 65 tok/s | ~16s | `approved_with_repairs` |
| `Qwen/Qwen2.5-72B-Instruct` | — | — | 504 from the router |
| `mistralai/Mistral-Small-24B-Instruct-2501` | — | — | 400 from the router |

Both slots currently point at the 70B model, which is why the live run attempts one
engine rather than two. The router collapses two registrations that resolve to the
same endpoint and weights: attempting an identical endpoint again cannot succeed
where the first attempt did not, it only doubles how long a member waits for the
fallback. `ModelProvider.getEndpointIdentity()` is a one-way digest of the host,
path and model id, so this is not a comparison of provider names or deployment
labels, which differ by configuration even when the endpoint is identical.

`AI_GATEWAY_TIMEOUT_MS` defaults to 45000 to cover a full 1600-token answer rather
than a median one; a member whose answer is clipped mid-sentence into the
deterministic fallback has been given the worse product to protect a number. Omit
`AI_GATEWAY_HEALTH_TIMEOUT_MS` and it follows the generation budget, because a probe
stricter than the request it is validating reports a working engine as unavailable.
Setting it lower than `AI_GATEWAY_TIMEOUT_MS` now fails at boot rather than at the
first health check.

### Output-contract length limits

`src/ai/schemas/outputSchemas.ts` rejects a payload that violates any limit, and
the Gateway then serves the deterministic fallback — correct for a member, but a
disproportionate response to a display label. The Snapshot system prompt therefore
states every limit explicitly, including that `impact` is a 40-character label and
not a sentence. A limit that exists only in the schema is a limit the model cannot
comply with, and it turns a good answer into a fallback.

To diagnose a `schema_invalid` degradation, run the real prompt assembly and the
real engine and report the Zod issues rather than the discarded payload; the
Gateway deliberately keeps the member-facing message generic.

## Diagnosing a model that "is not responding"

An engine that answers nothing is almost always a misconfiguration, and the
distinction that matters is permanent versus temporary. The transport classifies
each failure and the classification is what the whole chain hangs off:

| Upstream answer | Kind | Retryable | Operator action |
| --- | --- | --- | --- |
| 400, 401, 403, 404, 422 | `rejected` | no | Fix the model id, key or access — a retry is identical |
| 429 | `rate_limited` | yes | Back off; the same request will work later |
| 5xx, DNS, connection refused, TLS | `unavailable` | yes | Check the network, the endpoint and the provider's status |
| Timeout / abort | `timeout` | yes | Check the configured timeout and provider latency |
| 2xx with unusable body | `invalid_response` | yes | Check JSON-mode support and the prompt contract |

A 4xx used to be reported as `unavailable`, which made a permanent
misconfiguration indistinguishable from a transient outage in the log.

Each failure is recorded three ways:

- **Server log** — `rejected, status 400, not retryable — code=model_not_supported`
  with the provider's own redacted message. This is the full record.
- **`provenance.degradation`** — attached to every degraded result and persisted in
  the audit trail, so a past failure can be explained after the fact.
- **`diagnostics`** — returned to the client. Classification, engine name, HTTP
  status and whether a retry could help. Never the provider's message, a model id
  or a hostname, because the Snapshot page and AI Lab are member-reachable and our
  misconfiguration is not the member's business.

`diagnostics.retryable` is derived from the failure class, not assumed. A chain
whose fallback engine is unconfigured, or whose primary was rejected, reports
`retryable: false` and withholds the "try again" invitation, because the member
cannot fix it and would only be sent to wait for something that will not change.

`GET /api/ai/health` (admin/developer only) probes each engine and reports the
configured model id alongside the failure, because "status 400" alone is not
actionable. It never returns URLs or keys, and any provider text is passed through
the shared redactor and length-capped before it leaves the process; this is an
authenticated diagnostic surface, not a member-facing one.

To self-host instead, serve either weights with TGI or vLLM and point
`*_PROVIDER_URL` at that server's root (again, no trailing `/v1`); the key can be
left blank for a local server, in which case no `Authorization` header is sent.

## Tests

```bash
npm test        # 123 tests
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
| `tests/ai/trendBinding.test.ts`    | Trend Engine → context → prompt → guardrail → presentation |
| `tests/ai/guardrails.test.ts`      | Diagnostic, prescriptive, crisis and numeric rules         |
| `tests/ai/citationVerifier.test.ts`| Citation resolution and claim removal                     |
| `tests/ai/determinism.test.ts`     | JSON recovery, retrieval, routing, confidence             |
| `tests/ai/routes.test.ts`          | Mounted surface, Snapshot route, authentication           |
| `tests/ai/models.test.ts`          | AI audit table identifiers, cascades and associations      |
| `tests/ai/providerFailure.test.ts`  | Upstream status classification, detail capture, redaction |
| `tests/auth/sessionSecurity.test.ts` | Refresh reuse detection, Google sign-in contract, roles |

`tests/ai/providerFailure.test.ts` pins the behaviour that the failure
classification depends on: that a 400 is recognised as a permanent rejection
rather than an outage, that the provider's own explanation survives into the
server-side record, and that neither a credential nor an upstream message reaches
anything a client can see. It uses an injected transport rather than a live
provider, because the bug it guards was one no live test would have caught — the
live provider returned 400 and the code called it "unavailable".

`tests/ai/trendBinding.test.ts` exists because this binding is easy to remove by
accident and hard to notice: the Gateway still runs, the provider still answers,
and only the Snapshot quietly stops reflecting what the member logged. It asserts
the trend reaches the context and the prompt, that the numbers are permitted by
the numeric guardrail while an invented one is not, that a partner digest gets no
series at all, and that the eight sections are presented from approved output.

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

`personal_snapshots` stores the member-facing artifact: the presented eight
sections plus the deterministic cards, keyed by a `contextFingerprint` over the
baseline, the consent, the Trend Engine output, the prompt version and checksum, and
the config/evidence/SCI versions. A member whose inputs have not moved gets the
stored artifact back instead of a second engine call; any of those inputs changing
produces a different fingerprint and therefore a regeneration. There is one current
row per user. Storage is an optimisation, not a dependency: a failed read or write
is logged and the Snapshot is still generated and shown.

## Not yet built

Stated plainly so these are not mistaken for working features:

- **Partner consent and authorization tables.** The Gateway enforces and serves
  `partner_digest`, but no M2 consent/authorization tables exist, so no public
  partner endpoint is exposed. Do not expose one until that authorization layer
  exists — the Gateway cannot invent a scope it was not given.
- **Semantic retrieval.** Lexical scoring only; see the pgvector seam above.
- **Clinically reviewed evidence.** See Evidence governance.
- **Per-request budget and quota accounting.** Rate limiting exists; token spend
  is not yet metured.
- **A clinical Med42 engine.** `migrations/003_personal_snapshots.sql` aside, the
  `med42` registration currently points at `meta-llama/Llama-3.3-70B-Instruct`,
  the same weights as `llama`, because the Hugging Face account has no provider
  serving `m42-health/*`. The route is healthy and reachable, but it is a general
  model and must never be described to a member as clinical specialization.
  Self-hosting the weights via TGI or vLLM and pointing `MED42_PROVIDER_URL` at it
  is the remaining work.
- **Persisted degradation detail.** `provenance.degradation` is populated on every
  degraded result and is logged, but `ai_audit_logs` has no column for it, so a
  later review cannot reconstruct which engine failed or why from the audit row
  alone. The current `meta.diagnostics` and the Snapshot banner are unaffected.
