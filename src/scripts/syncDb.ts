/**
 * Database Schema Sync Script
 * Run: pnpm exec tsx src/scripts/syncDb.ts
 * Safely creates or alters tables in Neon PostgreSQL.
 */
import "dotenv/config";
import { sequelize } from "../config/db.js";
import "../models/index.js";
import { logger } from "../utils/logger.js";

async function syncDatabase() {
  try {
    logger.info("[DB-SYNC] Authenticating with Neon PostgreSQL...");
    await sequelize.authenticate();
    logger.info("[DB-SYNC] Database connection verified. Synchronizing models...");

    await sequelize.sync({ alter: true });
    logger.info("[DB-SYNC] Database tables successfully synchronized with models!");
    process.exit(0);
  } catch (error) {
    logger.error("[DB-SYNC] Failed to synchronize database:", error);
    process.exit(1);
  }
}

syncDatabase();
