/**
 * Seed Extra Admin Script
 * Run once: npx tsx src/scripts/seedAdminExtra.ts
 * Creates a second admin user if they don't already exist.
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { sequelize } from "../config/db.js";
import { User } from "../models/index.js";
import { logger } from "../utils/logger.js";

const log = logger.module("SEED_ADMIN_EXTRA");

const ADMINS = [
  {
    email: "admin@gmail.com",
    password: "admin@123",
    name: "Admin",
  },
];

async function seedAdminExtra() {
  try {
    await sequelize.authenticate();
    log.info("✅ Database connected");

    await sequelize.sync({ alter: false });
    log.info("✅ Models synced");

    for (const adminData of ADMINS) {
      const existing = await User.findOne({ where: { email: adminData.email } });

      if (existing) {
        if (existing.role !== "admin") {
          existing.role = "admin";
          const hash = await bcrypt.hash(adminData.password, 12);
          existing.passwordHash = hash;
          await existing.save();
          log.info(`🔄 Existing user promoted to admin: ${adminData.email}`);
        } else {
          log.info(`ℹ️  Admin user already exists: ${adminData.email}`);
        }
        continue;
      }

      const passwordHash = await bcrypt.hash(adminData.password, 12);

      const admin = await User.create({
        name: adminData.name,
        email: adminData.email,
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
    }

    process.exit(0);
  } catch (err) {
    log.error("❌ Failed to seed extra admin user", err);
    process.exit(1);
  }
}

seedAdminExtra();
