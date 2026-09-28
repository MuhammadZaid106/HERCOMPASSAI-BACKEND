import { sequelize, connectDB } from "../config/db.js";
import { User } from "./User.js";
import { RefreshToken } from "./RefreshToken.js";
import { OnboardingProfile } from "./OnboardingProfile.js";
import { SymptomEntry } from "./SymptomEntry.js";
import { MoodEntry } from "./MoodEntry.js";
import { SleepEntry } from "./SleepEntry.js";
import { EnergyEntry } from "./EnergyEntry.js";
import { LifestyleEntry } from "./LifestyleEntry.js";
import { Notification } from "./Notification.js";
import { AiAuditLog } from "./AiAuditLog.js";
import { AiFeedback } from "./AiFeedback.js";
import { AiFlag } from "./AiFlag.js";

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

export {
  sequelize,
  connectDB,
  User,
  RefreshToken,
  OnboardingProfile,
  SymptomEntry,
  MoodEntry,
  SleepEntry,
  EnergyEntry,
  LifestyleEntry,
  Notification,
  AiAuditLog,
  AiFeedback,
  AiFlag,
};
