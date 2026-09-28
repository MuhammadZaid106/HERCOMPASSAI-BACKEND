import {
  Model,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type ForeignKey,
} from "sequelize";
import { sequelize } from "../config/db.js";
import type { User } from "./User.js";

export class OnboardingProfile extends Model<
  InferAttributes<OnboardingProfile>,
  InferCreationAttributes<OnboardingProfile>
> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User["id"]>;
  declare version: CreationOptional<string>;
  declare isCompleted: CreationOptional<boolean>;
  declare completedAt: CreationOptional<Date | null>;

  // Consent
  declare consentVersion: CreationOptional<string>;
  declare consentTimestamp: CreationOptional<Date>;
  declare consentType: CreationOptional<string>;

  // Core Demographics & Phase
  declare age: CreationOptional<number | null>;
  declare menopausePhase: CreationOptional<
    "perimenopause" | "menopause" | "postmenopause" | "unsure" | null
  >;
  declare hormoneTherapyStatus: CreationOptional<
    "yes" | "no" | "considering" | null
  >;

  // Intent & Symptoms
  declare primaryGoals: CreationOptional<string[]>;
  declare primaryHealthConcerns: CreationOptional<string[]>;
  declare symptomImpact: CreationOptional<
    | "not_much"
    | "a_little"
    | "moderately"
    | "a_lot"
    | "extremely"
    | "prefer_not_to_say"
    | null
  >;
  declare medicalConditions: CreationOptional<string | null>;

  // Mood & Emotional Baseline
  declare moodBaseline: CreationOptional<Record<string, number>>;
  declare moodOverall: CreationOptional<
    | "doing_well"
    | "mostly_okay"
    | "some_challenges"
    | "significant_challenges"
    | "prefer_not_to_say"
    | null
  >;
  declare moodPatterns: CreationOptional<string[]>;
  declare emotionalGoals: CreationOptional<string[]>;
  declare meditationFrequency: CreationOptional<
    "daily" | "weekly" | "rarely" | "never" | null
  >;

  // Sleep
  declare sleepQuality: CreationOptional<
    | "very_good"
    | "good"
    | "mixed"
    | "difficult"
    | "very_difficult"
    | "prefer_not_to_say"
    | null
  >;
  declare sleepChallenges: CreationOptional<string[]>;

  // Energy & Nutrition
  declare energyLevel: CreationOptional<
    | "high"
    | "good"
    | "up_and_down"
    | "often_low"
    | "very_low"
    | "prefer_not_to_say"
    | null
  >;
  declare energyPattern: CreationOptional<
    | "morning"
    | "afternoon"
    | "evening"
    | "throughout_the_day"
    | "varies"
    | "prefer_not_to_say"
    | null
  >;
  declare dietaryPreferences: CreationOptional<string[]>;
  declare allergies: CreationOptional<string | null>;
  declare energyAfterMealRating: CreationOptional<number | null>;

  // Activity & Movement
  declare activityLevel: CreationOptional<
    "sedentary" | "light" | "moderate" | "very_active" | null
  >;
  declare exercisePreferences: CreationOptional<string[]>;
  declare weeklyExerciseMinutes: CreationOptional<
    "0-30" | "30-60" | "60-90" | "90plus" | null
  >;
  declare lifestyleFocus: CreationOptional<string[]>;

  // Signature Priority Goal
  declare primaryGoal: CreationOptional<string | null>;

  // AI Guidance Preferences
  declare dailyCheckinOptIn: CreationOptional<boolean>;
  declare preferredRecommendations: CreationOptional<string[]>;

  // Couple & Partner Support (CPS)
  declare partnerSupportInterest: CreationOptional<
    | "yes"
    | "maybe"
    | "not_now"
    | "not_interested"
    | "no_partner"
    | "prefer_not_to_say"
    | null
  >;
  declare partnerSupportNeeds: CreationOptional<string[]>;
  declare partnerEmail: CreationOptional<string | null>;
  declare partnerConsent: CreationOptional<boolean>;
  declare partnerSharingScopes: CreationOptional<string[]>;

  // Deterministic Calculation Engine Outputs
  declare deterministicScores: CreationOptional<Record<string, unknown>>;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

OnboardingProfile.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    version: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: "1.0",
    },
    isCompleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    consentVersion: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "v1.0",
    },
    consentTimestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    consentType: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: "legacy_assessment",
    },
    age: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    menopausePhase: {
      type: DataTypes.ENUM("perimenopause", "menopause", "postmenopause", "unsure"),
      allowNull: true,
    },
    hormoneTherapyStatus: {
      type: DataTypes.ENUM("yes", "no", "considering"),
      allowNull: true,
    },
    primaryGoals: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    primaryHealthConcerns: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    symptomImpact: {
      type: DataTypes.ENUM(
        "not_much",
        "a_little",
        "moderately",
        "a_lot",
        "extremely",
        "prefer_not_to_say"
      ),
      allowNull: true,
    },
    medicalConditions: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    moodBaseline: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    moodOverall: {
      type: DataTypes.ENUM(
        "doing_well",
        "mostly_okay",
        "some_challenges",
        "significant_challenges",
        "prefer_not_to_say"
      ),
      allowNull: true,
    },
    moodPatterns: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    emotionalGoals: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    meditationFrequency: {
      type: DataTypes.ENUM("daily", "weekly", "rarely", "never"),
      allowNull: true,
    },
    sleepQuality: {
      type: DataTypes.ENUM(
        "very_good",
        "good",
        "mixed",
        "difficult",
        "very_difficult",
        "prefer_not_to_say"
      ),
      allowNull: true,
    },
    sleepChallenges: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    energyLevel: {
      type: DataTypes.ENUM(
        "high",
        "good",
        "up_and_down",
        "often_low",
        "very_low",
        "prefer_not_to_say"
      ),
      allowNull: true,
    },
    energyPattern: {
      type: DataTypes.ENUM(
        "morning",
        "afternoon",
        "evening",
        "throughout_the_day",
        "varies",
        "prefer_not_to_say"
      ),
      allowNull: true,
    },
    dietaryPreferences: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    allergies: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    energyAfterMealRating: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    activityLevel: {
      type: DataTypes.ENUM("sedentary", "light", "moderate", "very_active"),
      allowNull: true,
    },
    exercisePreferences: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    weeklyExerciseMinutes: {
      type: DataTypes.ENUM("0-30", "30-60", "60-90", "90plus"),
      allowNull: true,
    },
    lifestyleFocus: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    primaryGoal: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    dailyCheckinOptIn: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    preferredRecommendations: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    partnerSupportInterest: {
      type: DataTypes.ENUM(
        "yes",
        "maybe",
        "not_now",
        "not_interested",
        "no_partner",
        "prefer_not_to_say"
      ),
      allowNull: true,
    },
    partnerSupportNeeds: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    partnerEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    partnerConsent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    partnerSharingScopes: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: ["digest_summary", "communication_guidance", "shared_activities"],
    },
    deterministicScores: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "onboarding_profiles",
    timestamps: true,
    underscored: true,
  }
);
