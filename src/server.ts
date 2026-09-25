import "dotenv/config";
import app from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { connectDB } from "./models/index.js";

// ─── Vercel Serverless Export ─────────────────────────────────────────────────
// When deployed on Vercel, export the Express app directly.
// Vercel injects the VERCEL environment variable automatically.
export default app;

// ─── Local Dev / Render: Start HTTP Server ────────────────────────────────────
// Only bind to a port when NOT running in Vercel's serverless environment.
if (!process.env.VERCEL) {
  const PORT = parseInt(env.PORT, 10);

  const startServer = async (): Promise<void> => {
    try {
      await connectDB();

      app.listen(PORT, () => {
        logger.info(`🚀 HerCompassAI API Server running on port ${PORT}`);
        logger.info(`   Environment : ${env.NODE_ENV}`);
        logger.info(`   CORS Origin : ${env.CORS_ORIGIN}`);
        logger.info(`   ORM Engine  : Sequelize ORM`);
        logger.info(`   Health Check: http://localhost:${PORT}/health`);
        logger.info(`   Auth Routes : http://localhost:${PORT}/api/auth`);
      });
    } catch (err) {
      logger.error("❌ Failed to start server", err);
      process.exit(1);
    }
  };

  startServer();
}
