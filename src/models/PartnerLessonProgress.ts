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

export class PartnerLessonProgress extends Model<
  InferAttributes<PartnerLessonProgress>,
  InferCreationAttributes<PartnerLessonProgress>
> {
  declare id: CreationOptional<string>;
  declare partnerUserId: ForeignKey<User["id"]>;
  declare lessonSlug: string;
  declare readAt: CreationOptional<Date>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

PartnerLessonProgress.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    partnerUserId: { type: DataTypes.UUID, allowNull: false },
    lessonSlug: { type: DataTypes.STRING(64), allowNull: false },
    readAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: "partner_lesson_progress",
    underscored: true,
    indexes: [{ unique: true, fields: ["partner_user_id", "lesson_slug"] }],
  },
);
