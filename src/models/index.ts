import { sequelize, connectDB } from "../config/db.js";
import { User } from "./User.js";
import { RefreshToken } from "./RefreshToken.js";
import { OnboardingProfile } from "./OnboardingProfile.js";

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

export { sequelize, connectDB, User, RefreshToken, OnboardingProfile };

