import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import authRoutes from "./routes/auth/authRoutes.js";
import onboardingRoutes from "./routes/onboarding/onboardingRoutes.js";
import trackingRoutes from "./routes/tracking/trackingRoutes.js";
import memberRoutes from "./routes/member/memberRoutes.js";
import { globalErrorHandler } from "./middleware/errorHandler.js";
import { connectDB } from "./models/index.js";

const app: Express = express();

// ─── Lazy DB Init (Vercel Serverless) ────────────────────────────────────────
// On Vercel, there is no persistent process, so we connect to the DB lazily
// on the first request and cache the promise so it only runs once per cold start.
let dbReady: Promise<void> | null = null;

if (process.env.VERCEL) {
  app.use(async (_req: Request, _res: Response, next: NextFunction) => {
    if (!dbReady) {
      dbReady = connectDB();
    }
    try {
      await dbReady;
      next();
    } catch (err) {
      next(err);
    }
  });
}

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────────
const baseAllowedOrigins = [
  "https://hercompassai.vercel.app",
  "http://localhost:3000",
  ...env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean),
];
const allowedOrigins = Array.from(new Set(baseAllowedOrigins));

app.use(
  cors({
    origin: (requestOrigin, callback) => {
      // Allow server-to-server, mobile, or tool requests without origin
      if (!requestOrigin) {
        return callback(null, true);
      }
      const isAllowed =
        allowedOrigins.includes(requestOrigin) ||
        (requestOrigin.endsWith(".vercel.app") && requestOrigin.includes("hercompassai"));

      if (isAllowed) {
        callback(null, true);
      } else {
        logger.warn(`[CORS] Blocked request from unauthorized origin: ${requestOrigin}`);
        callback(new Error(`Origin ${requestOrigin} not allowed by CORS`));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
    exposedHeaders: ["Content-Length"],
    credentials: true,
  })
);

// ─── HTTP Request Logging ─────────────────────────────────────────────────────
app.use(
  morgan(":method :url :status :response-time ms — :res[content-length] bytes", {
    stream: {
      write: (message: string) => {
        logger.info(message.trim());
      },
    },
  })
);

// ─── Body Parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api/member", memberRoutes);


// ─── Global Error Handler (must be last) ─────────────────────────────────────
app.use(globalErrorHandler);

export default app;
