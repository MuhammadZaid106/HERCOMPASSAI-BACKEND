import { Sequelize } from "sequelize";
import pg from "pg";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

const dbLog = logger.module("DB");

const connectionUri = env.DATABASE_URL || "postgres://localhost:5432/hercompassai";
const isNeon = env.DATABASE_URL.includes("neon.tech") || env.DATABASE_URL.includes("sslmode=require");

export const sequelize = new Sequelize(connectionUri, {
  dialect: "postgres",
  dialectModule: pg,
  dialectOptions: isNeon
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      }
    : {},
  logging: (msg: string) => {
    if (env.NODE_ENV === "development" && process.env.DEBUG_SQL === "true") {
      dbLog.debug(msg);
    }
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

export async function connectDB(): Promise<void> {
  if (!env.DATABASE_URL || env.DATABASE_URL.trim() === "") {
    dbLog.warn("⚠️  DATABASE_URL is not set in backend/.env.");
    dbLog.warn("   Paste your Neon PostgreSQL connection string in backend/.env to activate live database sync.");
    return;
  }

  try {
    await sequelize.authenticate();
    dbLog.info("✅ Neon PostgreSQL database connection verified via Sequelize ORM");
    // Sync models (alter: false prevents destructive DDL)
    await sequelize.sync({ alter: false });
    dbLog.info("✅ Sequelize models synchronized successfully with Neon database");
  } catch (err) {
    dbLog.error("❌ Failed to connect to Neon PostgreSQL database:", err);
  }
}
