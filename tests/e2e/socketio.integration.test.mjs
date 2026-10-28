import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import jwt from "jsonwebtoken";
import Redis from "ioredis";
import { io as createSocket } from "socket.io-client";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const signingKey = "integration-only-shared-jwt-key";
const clientSockets = [];
const serviceProcesses = [];

async function reservePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not reserve a local port");
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
  return address.port;
}

function makeToken(userId, role, extraClaims = {}) {
  return jwt.sign({ userId, role, ...extraClaims }, signingKey, {
    expiresIn: "5m",
  });
}

async function startService(port) {
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
        MAX_CONNECTIONS_PER_USER: "2",
        LOG_LEVEL: "warn",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    child.output += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    child.output += chunk;
  });
  serviceProcesses.push(child);

  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Realtime service exited early: ${child.output}`);
    }
    try {
      const response = await fetch(`${baseUrl}/realtime/ready`);
      if (response.ok) return baseUrl;
    } catch {
      // The process is still starting.
    }
    await delay(200);
  }
  throw new Error(`Realtime service did not become ready: ${child.output}`);
}

async function waitForReadyServices(urls) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const readiness = await Promise.all(
      urls.map(async (url) => {
        try {
          const response = await fetch(`${url}/realtime/ready`, {
            signal: AbortSignal.timeout(1_000),
          });
          return response.ok;
        } catch {
          return false;
        }
      }),
    );
    if (readiness.every(Boolean)) return;
    await delay(150);
  }
  throw new Error("Realtime replicas did not recover Redis readiness");
}

function createClient(baseUrl, token, extraHeaders) {
  const socket = createSocket(baseUrl, {
    path: "/realtime/socket.io",
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
    timeout: 5_000,
    ...(extraHeaders ? { extraHeaders } : {}),
  });
  clientSockets.push(socket);
  return socket;
}

async function connectClient(baseUrl, token, extraHeaders) {
  const socket = createClient(baseUrl, token, extraHeaders);
  try {
    await new Promise((resolveConnect, rejectConnect) => {
      socket.once("connect", resolveConnect);
      socket.once("connect_error", rejectConnect);
    });
    return socket;
  } catch (error) {
    socket.disconnect();
    throw error;
  }
}

function nextEvent(socket, eventName, timeoutMs = 5_000) {
  return new Promise((resolveEvent, rejectEvent) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      rejectEvent(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
    const onEvent = (payload) => {
      clearTimeout(timer);
      resolveEvent(payload);
    };
    socket.once(eventName, onEvent);
  });
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([exited, delay(3_000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

test("Socket.IO relays, authorization, rate limits, Redis scale-out, and recovery", async (t) => {
  const redis = new Redis(redisUrl);
  t.after(async () => {
    for (const socket of clientSockets) socket.disconnect();
    await Promise.all(serviceProcesses.map(stopChild));
    await redis.quit();
  });

  await redis.ping();
  assert.ok(
    existsSync(resolve(repoRoot, "dist/server.mjs")),
    "run npm run build before integration tests",
  );

  const firstUrl = await startService(await reservePort());
  const secondUrl = await startService(await reservePort());
  const userId = `integration-user-${Date.now()}`;
  const userToken = makeToken(userId, "customer", {
    bookingIds: ["booking-authorized"],
    conversationIds: ["conversation-authorized"],
  });
  const firstClient = await connectClient(firstUrl, userToken);
  const secondClient = await connectClient(secondUrl, userToken);
  const professionalId = `integration-professional-${Date.now()}`;
  const professional = await connectClient(
    firstUrl,
    makeToken(professionalId, "professional", {
      bookingIds: ["booking-authorized"],
      conversationIds: ["conversation-authorized"],
    }),
  );
  const outsider = await connectClient(
    firstUrl,
    makeToken(`integration-outsider-${Date.now()}`, "customer"),
  );

  await assert.rejects(
    connectClient(secondUrl, userToken),
    /CONNECTION_LIMIT/,
    "the concurrent connection limit must be enforced across service replicas",
  );

  await assert.rejects(
    connectClient(
      firstUrl,
      jwt.sign({ userId: "invalid-token" }, "wrong-signing-key"),
    ),
    /Invalid token/,
  );

  const forbiddenOrigin = createClient(
    firstUrl,
    makeToken("origin-check", "customer"),
    {
      Origin: "https://untrusted.example",
    },
  );
  await assert.rejects(
    new Promise((resolveConnect, rejectConnect) => {
      forbiddenOrigin.once("connect", resolveConnect);
      forbiddenOrigin.once("connect_error", rejectConnect);
    }),
    /Origin is not allowed/,
  );

  const roomError = nextEvent(firstClient, "system:error");
  firstClient.emit("booking:subscribe", { bookingId: "booking-not-in-token" });
  assert.equal((await roomError).code, "FORBIDDEN");

  const outsiderRoomError = nextEvent(outsider, "system:error");
  outsider.emit("booking:subscribe", { bookingId: "booking-authorized" });
  assert.equal((await outsiderRoomError).code, "FORBIDDEN");

  const customerBooking = nextEvent(firstClient, "booking.updated");
  const professionalBooking = nextEvent(professional, "booking.updated");
  const booking = {
    type: "booking.updated",
    bookingId: "booking-authorized",
    customerId: userId,
    professionalId,
    status: "started",
  };
  firstClient.emit("booking:subscribe", { bookingId: "booking-authorized" });
  professional.emit("booking:subscribe", { bookingId: "booking-authorized" });
  await redis.publish("marketplace:booking:events", JSON.stringify(booking));
  assert.equal((await customerBooking).status, "started");
  assert.equal((await professionalBooking).status, "started");

  const customerConversation = nextEvent(firstClient, "message.sent");
  const professionalConversation = nextEvent(professional, "message.sent");
  firstClient.emit("conversation:subscribe", {
    conversationId: "conversation-authorized",
  });
  professional.emit("conversation:subscribe", {
    conversationId: "conversation-authorized",
  });
  await redis.publish(
    "marketplace:communication:events",
    JSON.stringify({
      type: "message.sent",
      version: "v2",
      bookingId: "booking-authorized",
      conversationId: "conversation-authorized",
      senderId: userId,
      recipientId: professionalId,
      messageId: `message-${Date.now()}`,
      body: "integration message",
    }),
  );
  assert.equal((await customerConversation).body, "integration message");
  assert.equal((await professionalConversation).body, "integration message");

  const customerPayment = nextEvent(firstClient, "payment.authorized");
  const professionalPayment = nextEvent(professional, "payment.authorized");
  await redis.publish(
    "marketplace:payment:events",
    JSON.stringify({
      type: "payment.authorized",
      version: "v2",
      bookingId: "booking-authorized",
      customerId: userId,
      professionalId,
      paymentId: `payment-${Date.now()}`,
      currency: "NGN",
    }),
  );
  assert.equal((await customerPayment).bookingId, "booking-authorized");
  assert.equal((await professionalPayment).bookingId, "booking-authorized");

  let firstNotificationCount = 0;
  let secondNotificationCount = 0;
  firstClient.on("notification.created", () => {
    firstNotificationCount += 1;
  });
  secondClient.on("notification.created", () => {
    secondNotificationCount += 1;
  });
  const firstNotification = nextEvent(firstClient, "notification.created");
  const secondNotification = nextEvent(secondClient, "notification.created");
  const notification = {
    type: "notification.created",
    userId,
    notificationId: `notification-${Date.now()}`,
  };
  await redis.publish(
    "marketplace:notification:events",
    JSON.stringify(notification),
  );
  await Promise.all([firstNotification, secondNotification]);
  await delay(250);
  assert.equal(
    firstNotificationCount,
    1,
    "one upstream event must not be duplicated on replica one",
  );
  assert.equal(
    secondNotificationCount,
    1,
    "one upstream event must not be duplicated on replica two",
  );

  await redis.call("CLIENT", "KILL", "TYPE", "normal", "SKIPME", "yes");
  await redis.call("CLIENT", "KILL", "TYPE", "pubsub", "SKIPME", "yes");
  await waitForReadyServices([firstUrl, secondUrl]);
  await delay(400);

  const recoveredOnFirst = nextEvent(firstClient, "notification.created");
  const recoveredOnSecond = nextEvent(secondClient, "notification.created");
  await redis.publish(
    "marketplace:notification:events",
    JSON.stringify({
      type: "notification.created",
      userId,
      notificationId: `notification-recovered-${Date.now()}`,
    }),
  );
  const recoveredNotifications = await Promise.all([
    recoveredOnFirst,
    recoveredOnSecond,
  ]);
  assert.ok(
    recoveredNotifications.every((event) =>
      event.notificationId.startsWith("notification-recovered-"),
    ),
    "both Socket.IO replicas must resume event delivery after Redis reconnects",
  );

  const admin = await connectClient(
    firstUrl,
    makeToken(`admin-${Date.now()}`, "admin"),
  );
  const adminBroadcast = nextEvent(admin, "system.announcement");
  admin.emit("admin:broadcast", {
    event: "system.announcement",
    payload: { message: "integration broadcast" },
  });
  assert.equal((await adminBroadcast).message, "integration broadcast");

  const locationEvent = nextEvent(firstClient, "location.update");
  await redis.publish(
    "marketplace:presence:events",
    JSON.stringify({
      type: "location.update",
      version: "v2",
      bookingId: "booking-authorized",
      professionalId: "professional-1",
      customerId: userId,
      location: { lat: 6.5244, lng: 3.3792, accuracy: 10 },
      lat: 6.5244,
      lng: 3.3792,
    }),
  );
  assert.equal((await locationEvent).bookingId, "booking-authorized");

  const malformed = nextEvent(firstClient, "notification.created", 300);
  await redis.publish(
    "marketplace:notification:events",
    JSON.stringify({
      type: "notification.created",
      userId,
    }),
  );
  await assert.rejects(malformed, /Timed out waiting/);

  firstClient.disconnect();
  const reconnected = new Promise((resolveConnect, rejectConnect) => {
    firstClient.once("connect", resolveConnect);
    firstClient.once("connect_error", rejectConnect);
  });
  firstClient.connect();
  await reconnected;
});

