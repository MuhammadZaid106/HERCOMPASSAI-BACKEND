import { sequelize, connectDB } from "../config/db.js";
import { User } from "./User.js";
import { RefreshToken } from "./RefreshToken.js";
import { OnboardingProfile } from "./OnboardingProfile.js";
import { SymptomEntry } from "./SymptomEntry.js";
import { MoodEntry } from "./MoodEntry.js";
import { SleepEntry } from "./SleepEntry.js";
import { EnergyEntry } from "./EnergyEntry.js";
import { LifestyleEntry } from "./LifestyleEntry.js";

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
};
