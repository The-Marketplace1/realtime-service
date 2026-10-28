import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { logger } from "../utils/logger.js";
import { env } from "./config/env.js";
import { createHealthRouter } from "../health/health.controller.js";
import { isAllowedOrigin } from "../security/origin.policy.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.use(express.json());

const healthRouter = createHealthRouter();
app.use("/realtime", healthRouter);
app.use("/", healthRouter);

export default app;

