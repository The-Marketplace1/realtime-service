import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { io as createSocket } from "socket.io-client";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const signingKey = "socketio-integration-only-key";

async function reservePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not reserve a local port");
  }
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
  return address.port;
}

async function stopService(child) {
  if (child.exitCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([exited, delay(3_000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

test("Socket.IO accepts an authenticated client and answers heartbeats", async (t) => {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [resolve(repoRoot, "dist/server.mjs")],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(port),
        JWT_SECRET: signingKey,
        REDIS_URL: redisUrl,
        CORS_ORIGINS: "http://localhost",
        LOG_LEVEL: "warn",
      },
      stdio: "ignore",
    },
  );
  const socket = createSocket(baseUrl, {
    path: "/realtime/socket.io",
    auth: {
      token: jwt.sign(
        { userId: `socketio-client-${Date.now()}`, role: "customer" },
        signingKey,
        { expiresIn: "5m" },
      ),
    },
    transports: ["websocket"],
    reconnection: false,
    autoConnect: false,
    timeout: 5_000,
  });

  t.after(async () => {
    socket.disconnect();
    await stopService(child);
  });

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Realtime service exited with ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/realtime/ready`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The service is still starting.
    }
    await delay(200);
  }
  assert.equal(ready, true, "service should become ready with Redis");

  await new Promise((resolveConnect, rejectConnect) => {
    socket.once("connect", resolveConnect);
    socket.once("connect_error", rejectConnect);
    socket.connect();
  });

  const pong = new Promise((resolvePong, rejectPong) => {
    const timer = setTimeout(
      () => rejectPong(new Error("Timed out waiting for system:pong")),
      3_000,
    );
    socket.once("system:pong", (payload) => {
      clearTimeout(timer);
      resolvePong(payload);
    });
  });
  socket.emit("system:ping");
  assert.equal(typeof (await pong).timestamp, "string");
});

