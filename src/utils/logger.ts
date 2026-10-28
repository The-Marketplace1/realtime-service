import pino from "pino";

const isProduction = process.env["NODE_ENV"] === "production";

export const logger = pino({
  name: "realtime-service",
  level: process.env["LOG_LEVEL"] ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "token",
    "jwt",
    "password",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

