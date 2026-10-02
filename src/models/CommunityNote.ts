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
import type { CommunityNoteStatus, CommunityTopicId } from "../services/member/communityBoard.js";

export class CommunityNote extends Model<
  InferAttributes<CommunityNote>,
  InferCreationAttributes<CommunityNote>
> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User["id"]>;
  declare topic: CommunityTopicId;
  declare body: string;
  declare status: CreationOptional<CommunityNoteStatus>;
  declare reviewedBy: ForeignKey<User["id"]> | null;
  declare reviewedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

CommunityNote.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    topic: { type: DataTypes.STRING(32), allowNull: false },
    body: { type: DataTypes.STRING(280), allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "pending" },
    reviewedBy: { type: DataTypes.UUID, allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "community_notes",
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ["user_id"] }, { fields: ["status"] }],
  },
);
