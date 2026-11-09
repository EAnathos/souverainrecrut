import express from "express";
import swaggerUi from "swagger-ui-express";

import { env } from "./config/env";

import routes from "./routes";

import { swaggerSpec } from "./docs/swagger";

import { loggerMiddleware } from "./middlewares/logger.middleware";
import { corsMiddleware } from "./middlewares/cors.middleware";
import { notFoundMiddleware } from "./middlewares/not-found.middleware";
import { errorMiddleware } from "./middlewares/error.middleware";

const app = express();

// Ne pas exposer la technologie utilisée (en-tête X-Powered-By)
app.disable("x-powered-by");

/**
 * ==========================================
 * Global Middlewares
 * ==========================================
 */

app.use(express.json());
app.use(loggerMiddleware);
app.use(corsMiddleware);

/**
 * ==========================================
 * Welcome Route
 * ==========================================
 */

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Bienvenue sur l'API SouverainRecrut 🚀",
    version: "1.0.0",
    api: `/${env.apiVersion}`,
    documentation: "/api-docs",
  });
});

/**
 * ==========================================
 * Swagger Documentation
 * ==========================================
 */

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec)
);

/**
 * ==========================================
 * API Routes
 * ==========================================
 */

app.use(`/${env.apiVersion}`, routes);

/**
 * ==========================================
 * 404 Middleware
 * ==========================================
 */

app.use(notFoundMiddleware);

/**
 * ==========================================
 * Error Middleware
 * ==========================================
 */

app.use(errorMiddleware);

export default app;