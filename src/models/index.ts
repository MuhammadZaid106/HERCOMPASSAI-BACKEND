import { sequelize, connectDB } from "../config/db.js";
import { User } from "./User.js";
import { RefreshToken } from "./RefreshToken.js";
import { OnboardingProfile } from "./OnboardingProfile.js";
import { PersonalSnapshot } from "./PersonalSnapshot.js";
import { SymptomEntry } from "./SymptomEntry.js";
import { MoodEntry } from "./MoodEntry.js";
import { SleepEntry } from "./SleepEntry.js";
import { EnergyEntry } from "./EnergyEntry.js";
import { LifestyleEntry } from "./LifestyleEntry.js";
import { Notification } from "./Notification.js";
import { AiAuditLog } from "./AiAuditLog.js";
import { AiFeedback } from "./AiFeedback.js";
import { AiFlag } from "./AiFlag.js";
import { SnapshotVersion } from "./SnapshotVersion.js";
import { SnapshotFeedback } from "./SnapshotFeedback.js";
import { NotificationPreference } from "./NotificationPreference.js";
import { ExploreProgress } from "./ExploreProgress.js";
import { SupportRequest } from "./SupportRequest.js";
import { PasswordResetToken } from "./PasswordResetToken.js";
import { EmailActionToken } from "./EmailActionToken.js";
import { AnalyticsEvent } from "./AnalyticsEvent.js";
import { UserFunnelStamp } from "./UserFunnelStamp.js";
import { PartnerInvite } from "./PartnerInvite.js";
import { SavedContent } from "./SavedContent.js";
import { EntitlementUsage } from "./EntitlementUsage.js";
import { CommunityNote } from "./CommunityNote.js";
import { PartnerAuditLog } from "./PartnerAuditLog.js";
import { PartnerLessonProgress } from "./PartnerLessonProgress.js";
import { PartnerDigest } from "./PartnerDigest.js";
import { AppSetting } from "./AppSetting.js";
import { BetaCohort } from "./BetaCohort.js";
import { BetaMember } from "./BetaMember.js";
import { ContentPiece } from "./ContentPiece.js";
import { ProductFeedback } from "./ProductFeedback.js";
import { EvidenceStatus } from "./EvidenceStatus.js";
import { BillingEvent } from "./BillingEvent.js";
import { GrandfatheredPlan } from "./GrandfatheredPlan.js";
import { AiFlagCase } from "./AiFlagCase.js";
import { AiRequestExcerpt } from "./AiRequestExcerpt.js";
import { EvaluationCase } from "./EvaluationCase.js";
import { EvaluationRun } from "./EvaluationRun.js";
import { EvaluationResult } from "./EvaluationResult.js";
import { EvidenceSubmission } from "./EvidenceSubmission.js";
import { EvidenceRecordModel } from "./EvidenceRecord.js";
import { Consent } from "./Consent.js";
import { GuestSnapshotClaim } from "./GuestSnapshotClaim.js";
import { Goal } from "./Goal.js";
import { PartnerRelationship } from "./PartnerRelationship.js";
import { PartnerConsent } from "./PartnerConsent.js";
import { PartnerPermission } from "./PartnerPermission.js";
import { HumanReview } from "./HumanReview.js";
import { AcademyCategory } from "./AcademyCategory.js";
import { ContentSource } from "./ContentSource.js";

// Setup Model Associations
User.hasMany(RefreshToken, {
  foreignKey: "userId",
  as: "refreshTokens",
  onDelete: "CASCADE",
});

RefreshToken.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

User.hasOne(OnboardingProfile, {
  foreignKey: "userId",
  as: "onboardingProfile",
  onDelete: "CASCADE",
});

OnboardingProfile.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

/**
 * A member holds one current Snapshot. Re-submitting onboarding or reaching a
 * new consent record replaces it, so the Snapshot page never has to decide
 * between "the artifact I stored" and "what is true right now" — the artifact
 * is regenerated exactly when the underlying state changes.
 */
User.hasOne(PersonalSnapshot, {
  foreignKey: "userId",
  as: "personalSnapshot",
  onDelete: "CASCADE",
});

PersonalSnapshot.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

User.hasMany(SymptomEntry, {
  foreignKey: "userId",
  as: "symptomEntries",
  onDelete: "CASCADE",
});
SymptomEntry.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(MoodEntry, {
  foreignKey: "userId",
  as: "moodEntries",
  onDelete: "CASCADE",
});
MoodEntry.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(SleepEntry, {
  foreignKey: "userId",
  as: "sleepEntries",
  onDelete: "CASCADE",
});
SleepEntry.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(EnergyEntry, {
  foreignKey: "userId",
  as: "energyEntries",
  onDelete: "CASCADE",
});
EnergyEntry.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(LifestyleEntry, {
  foreignKey: "userId",
  as: "lifestyleEntries",
  onDelete: "CASCADE",
});
LifestyleEntry.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(Notification, { foreignKey: "userId", as: "notifications", onDelete: "CASCADE" });
Notification.belongsTo(User, { foreignKey: "userId", as: "user" });

// ─── AI Gateway audit trail ───────────────────────────────────────────────────
// AI records are append-only provenance. They cascade with the user so account
// deletion remains complete, and they are never joined into member read models.
User.hasMany(AiAuditLog, { foreignKey: "userId", as: "aiAuditLogs", onDelete: "CASCADE" });
AiAuditLog.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasMany(AiFeedback, { foreignKey: "userId", as: "aiFeedback", onDelete: "CASCADE" });
AiFeedback.belongsTo(User, { foreignKey: "userId", as: "user" });

// A flag points at exactly one AI event. Declaring both sides is also what lets
// `sync()` create the tables in dependency order, so the foreign keys resolve.
User.hasMany(AiFlag, { foreignKey: "userId", as: "aiFlags", onDelete: "CASCADE" });
AiFlag.belongsTo(User, { foreignKey: "userId", as: "user" });

AiAuditLog.hasMany(AiFlag, { foreignKey: "requestId", as: "flags", onDelete: "CASCADE" });
AiFlag.belongsTo(AiAuditLog, { foreignKey: "requestId", as: "aiEvent" });

AiFlag.hasOne(AiFlagCase, { foreignKey: "flagId", as: "reviewCase", onDelete: "CASCADE" });
AiFlagCase.belongsTo(AiFlag, { foreignKey: "flagId", as: "flag" });

User.hasMany(BillingEvent, { foreignKey: "userId", as: "billingEvents", onDelete: "SET NULL" });
BillingEvent.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasOne(GrandfatheredPlan, { foreignKey: "userId", as: "grandfatheredPlan", onDelete: "CASCADE" });
GrandfatheredPlan.belongsTo(User, { foreignKey: "userId", as: "user" });

EvaluationRun.hasMany(EvaluationResult, { foreignKey: "runId", as: "results", onDelete: "CASCADE" });
EvaluationResult.belongsTo(EvaluationRun, { foreignKey: "runId", as: "run" });
EvaluationCase.hasMany(EvaluationResult, { foreignKey: "caseId", as: "results", onDelete: "CASCADE" });
EvaluationResult.belongsTo(EvaluationCase, { foreignKey: "caseId", as: "case" });

User.hasMany(SnapshotVersion, { foreignKey: "userId", as: "snapshotVersions", onDelete: "CASCADE" });
SnapshotVersion.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(SnapshotFeedback, { foreignKey: "userId", as: "snapshotFeedback", onDelete: "CASCADE" });
SnapshotFeedback.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasOne(NotificationPreference, { foreignKey: "userId", as: "notificationPreference", onDelete: "CASCADE" });
NotificationPreference.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(ExploreProgress, { foreignKey: "userId", as: "exploreProgress", onDelete: "CASCADE" });
ExploreProgress.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(SupportRequest, { foreignKey: "userId", as: "supportRequests", onDelete: "CASCADE" });
SupportRequest.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(PasswordResetToken, { foreignKey: "userId", as: "passwordResetTokens", onDelete: "CASCADE" });
PasswordResetToken.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(EmailActionToken, { foreignKey: "userId", as: "emailActionTokens", onDelete: "CASCADE" });
EmailActionToken.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(PartnerInvite, { foreignKey: "memberUserId", as: "sentPartnerInvites", onDelete: "CASCADE" });
PartnerInvite.belongsTo(User, { foreignKey: "memberUserId", as: "member" });
User.hasMany(SavedContent, { foreignKey: "userId", as: "savedContent", onDelete: "CASCADE" });
SavedContent.belongsTo(User, { foreignKey: "userId", as: "user" });

// ─── Entitlements ─────────────────────────────────────────────────────────────
// Metered AI usage. Cascades with the account: a deleted member leaves no
// allowance behind, and a fresh account of the same email starts clean.
User.hasMany(EntitlementUsage, { foreignKey: "userId", as: "entitlementUsage", onDelete: "CASCADE" });
EntitlementUsage.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasMany(CommunityNote, { foreignKey: "userId", as: "communityNotes", onDelete: "CASCADE" });
CommunityNote.belongsTo(User, { foreignKey: "userId", as: "author" });
CommunityNote.belongsTo(User, { foreignKey: "reviewedBy", as: "reviewer" });

BetaCohort.hasMany(BetaMember, { foreignKey: "cohortId", as: "members", onDelete: "CASCADE" });
BetaMember.belongsTo(BetaCohort, { foreignKey: "cohortId", as: "cohort" });
BetaMember.belongsTo(User, { foreignKey: "userId", as: "account" });
SupportRequest.hasOne(ProductFeedback, {
  foreignKey: "supportRequestId",
  as: "productReview",
  onDelete: "CASCADE",
});
ProductFeedback.belongsTo(SupportRequest, { foreignKey: "supportRequestId", as: "supportRequest" });
ProductFeedback.belongsTo(User, { foreignKey: "ownerUserId", as: "owner" });

User.hasMany(AnalyticsEvent, {
  foreignKey: "userId",
  as: "analyticsEvents",
  onDelete: "SET NULL",
});
AnalyticsEvent.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasOne(UserFunnelStamp, {
  foreignKey: "userId",
  as: "funnelStamp",
  onDelete: "CASCADE",
});
UserFunnelStamp.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasMany(Consent, {
  foreignKey: "userId",
  as: "consents",
  onDelete: "CASCADE",
});
Consent.belongsTo(User, { foreignKey: "userId", as: "user" });

// ─── Guest Snapshot allowance ─────────────────────────────────────────────────
// The one-free gate for no-signup visitors. Cascades with the guest account so a
// purged or deleted guest leaves no claim behind.
User.hasOne(GuestSnapshotClaim, {
  foreignKey: "guestUserId",
  as: "guestSnapshotClaim",
  onDelete: "CASCADE",
});
GuestSnapshotClaim.belongsTo(User, { foreignKey: "guestUserId", as: "guestUser" });

User.hasMany(Goal, {
  foreignKey: "userId",
  as: "goals",
  onDelete: "CASCADE",
});
Goal.belongsTo(User, { foreignKey: "userId", as: "user" });

// ─── Partner Relationships, Consents & Permissions ───────────────────────────
User.hasMany(PartnerRelationship, {
  foreignKey: "memberUserId",
  as: "memberRelationships",
  onDelete: "CASCADE",
});
PartnerRelationship.belongsTo(User, { foreignKey: "memberUserId", as: "member" });

User.hasMany(PartnerRelationship, {
  foreignKey: "partnerUserId",
  as: "partnerRelationships",
  onDelete: "SET NULL",
});
PartnerRelationship.belongsTo(User, { foreignKey: "partnerUserId", as: "partnerUser" });

PartnerRelationship.hasMany(PartnerConsent, {
  foreignKey: "relationshipId",
  as: "consents",
  onDelete: "CASCADE",
});
PartnerConsent.belongsTo(PartnerRelationship, { foreignKey: "relationshipId", as: "relationship" });

PartnerRelationship.hasMany(PartnerPermission, {
  foreignKey: "relationshipId",
  as: "permissions",
  onDelete: "CASCADE",
});
PartnerPermission.belongsTo(PartnerRelationship, { foreignKey: "relationshipId", as: "relationship" });

// ─── Human in the loop reviews ────────────────────────────────────────────────
AiFlag.hasMany(HumanReview, {
  foreignKey: "flagId",
  as: "humanReviews",
  onDelete: "CASCADE",
});
HumanReview.belongsTo(AiFlag, { foreignKey: "flagId", as: "flag" });

export {
  sequelize,
  connectDB,
  User,
  RefreshToken,
  OnboardingProfile,
  PersonalSnapshot,
  SymptomEntry,
  MoodEntry,
  SleepEntry,
  EnergyEntry,
  LifestyleEntry,
  Notification,
  AiAuditLog,
  AiFeedback,
  AiFlag,
  SnapshotVersion,
  SnapshotFeedback,
  NotificationPreference,
  ExploreProgress,
  SupportRequest,
  PasswordResetToken,
  EmailActionToken,
  AnalyticsEvent,
  UserFunnelStamp,
  PartnerInvite,
  SavedContent,
  EntitlementUsage,
  CommunityNote,
  PartnerAuditLog,
  PartnerLessonProgress,
  PartnerDigest,
  AppSetting,
  BetaCohort,
  BetaMember,
  ContentPiece,
  ProductFeedback,
  EvidenceStatus,
  BillingEvent,
  GrandfatheredPlan,
  AiFlagCase,
  AiRequestExcerpt,
  EvaluationCase,
  EvaluationRun,
  EvaluationResult,
  EvidenceSubmission,
  EvidenceRecordModel,
  Consent,
  GuestSnapshotClaim,
  Goal,
  PartnerRelationship,
  PartnerConsent,
  PartnerPermission,
  HumanReview,
  AcademyCategory,
  ContentSource,
};
