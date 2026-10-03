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
import { PartnerInvite } from "./PartnerInvite.js";
import { SavedContent } from "./SavedContent.js";
import { EntitlementUsage } from "./EntitlementUsage.js";
import { CommunityNote } from "./CommunityNote.js";
import { PartnerAuditLog } from "./PartnerAuditLog.js";
import { PartnerLessonProgress } from "./PartnerLessonProgress.js";
import { PartnerDigest } from "./PartnerDigest.js";

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
  PartnerInvite,
  SavedContent,
  EntitlementUsage,
  CommunityNote,
  PartnerAuditLog,
  PartnerLessonProgress,
  PartnerDigest,
};
