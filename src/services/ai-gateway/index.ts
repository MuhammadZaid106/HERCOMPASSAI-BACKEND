export { runGateway } from "./gateway.js";
export type { GatewayInvocation } from "./gateway.js";

export { buildContext, loadContextSource, partnerSupportIsRelevant } from "./contextAssembler.js";
export type { ContextSource, AssembleContextParams } from "./contextAssembler.js";

export { resolveRoute, describeRouting } from "./modelRouter.js";
export type { RoutePlan, RouteAttempt } from "./modelRouter.js";

export { assemblePrompt } from "./promptService.js";
export type { AssembledPrompt } from "./promptService.js";

export { retrieveEvidence, listApprovedEvidence, tokenize } from "./evidenceService.js";
export type { EvidenceRetrievalResult, EvidenceQuery } from "./evidenceService.js";

export { verifyAndRepair } from "./citationVerifier.js";
export type { VerificationResult } from "./citationVerifier.js";

export { calculateConfidence } from "./confidenceService.js";
export type { ConfidenceInputs } from "./confidenceService.js";

export { runSci, SCI_VERSION } from "./sciValidator.js";
export type { SciResult, SciInput } from "./sciValidator.js";

export { assessSafety } from "./safetyService.js";
export type { SafetyAssessment } from "./safetyService.js";

export { buildSnapshotFallback, buildDigestFallback } from "./fallbackService.js";
export { recordAiAudit } from "./auditService.js";
export type { AuditInput } from "./auditService.js";
export { recordAiFeedback } from "./feedbackService.js";
export type { FeedbackRating, RecordFeedbackInput, RecordFeedbackResult } from "./feedbackService.js";
