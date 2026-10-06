-- 010_user_stripe_billing_columns.sql
--
-- The billing/Stripe work added three columns to the Sequelize User model, but
-- `sync({ alter: false })` (what the app boots with) never adds columns to an
-- existing table, so any database created before that change still lacks them.
-- Every User query then fails with SQLSTATE 42703 (errorMissingColumn) on
-- "stripe_customer_id" — including the login SELECT.
--
-- Columns match src/models/User.ts exactly so `sync({ alter: false })` remains
-- a no-op against a database built from these files.
--
-- Additive only: safe to run more than once. No data removed.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255) NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255) NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) NULL;
