/**
 * Seed Admin Script
 * Run once: npx tsx src/scripts/seedAdmin.ts
 * Creates the admin user if they don't already exist.
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { sequelize } from "../config/db.js";
import { User } from "../models/index.js";
import { logger } from "../utils/logger.js";

const log = logger.module("SEED_ADMIN");

const ADMIN_EMAIL = "zaidnaeem100@gmail.com";
const ADMIN_PASSWORD = "zaid@7737";
const ADMIN_NAME = "Zaid Naeem";

async function seedAdmin() {
  try {
    await sequelize.authenticate();
    log.info("✅ Database connected");

    // Sync models — alter: true adds the new "admin" ENUM value without dropping tables
    await sequelize.sync({ alter: true });
    log.info("✅ Models synced (alter)");

    const existing = await User.findOne({ where: { email: ADMIN_EMAIL } });

    if (existing) {
      // Update role to admin if it's not already
      if (existing.role !== "admin") {
        existing.role = "admin";
        const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
        existing.passwordHash = hash;
        await existing.save();
        log.info(`🔄 Existing user promoted to admin: ${ADMIN_EMAIL}`);
      } else {
        log.info(`ℹ️  Admin user already exists: ${ADMIN_EMAIL}`);
      }
      process.exit(0);
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

    const admin = await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash,
      role: "admin",
      plan: "premium",
      emailVerified: true,
    });

    log.info(`✅ Admin user created successfully`, {
      id: admin.id,
      email: admin.email,
      role: admin.role,
    });

    process.exit(0);
  } catch (err) {
    log.error("❌ Failed to seed admin user", err);
    process.exit(1);
  }
}

seedAdmin();
