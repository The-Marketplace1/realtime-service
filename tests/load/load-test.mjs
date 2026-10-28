import { performance } from "node:perf_hooks";
import jwt from "jsonwebtoken";
import { io } from "socket.io-client";

const baseUrl = process.env.REALTIME_BASE_URL ?? "http://127.0.0.1:5000";
const jwtSecret = process.env.JWT_SECRET;
const clientCount = Number.parseInt(process.env.LOAD_CLIENTS ?? "100", 10);
if (!jwtSecret)
  throw new Error("Set JWT_SECRET to the test auth-service verification key");
if (!Number.isInteger(clientCount) || clientCount < 1 || clientCount > 5000) {
  throw new Error("LOAD_CLIENTS must be an integer between 1 and 5000");
}

function connectClient(index) {
  const token = jwt.sign(
    { userId: `load-test-${Date.now()}-${index}`, role: "customer" },
    jwtSecret,
    { expiresIn: "10m" },
  );
  const socket = io(baseUrl, {
    path: "/realtime/socket.io",
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
    timeout: 10_000,
  });

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      resolve({ socket, connected: false });
    }, 12_000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve({ socket, connected: true });
    });
    socket.once("connect_error", () => {
      clearTimeout(timer);
      resolve({ socket, connected: false });
    });
  });
}

const startedAt = performance.now();
const results = await Promise.all(
  Array.from({ length: clientCount }, (_, index) => connectClient(index)),
);
const connected = results.filter((result) => result.connected);
const connectDurationMs = Math.round(performance.now() - startedAt);

const pingStartedAt = performance.now();
let pongCount = 0;
const pongs = connected.map(
  ({ socket }) =>
    new Promise((resolve) => {
      const timeout = setTimeout(resolve, 5_000);
      socket.once("system:pong", () => {
        pongCount += 1;
        clearTimeout(timeout);
        resolve();
      });
      socket.emit("system:ping");
    }),
);
await Promise.all(pongs);
const pingDurationMs = Math.round(performance.now() - pingStartedAt);

console.log(
  JSON.stringify(
    {
      target: baseUrl,
      requestedClients: clientCount,
      connectedClients: connected.length,
      rejectedOrTimedOutClients: clientCount - connected.length,
      connectDurationMs,
      heartbeatPongs: pongCount,
      heartbeatRoundTripDurationMs: pingDurationMs,
    },
    null,
    2,
  ),
);

for (const { socket } of results) socket.disconnect();
if (connected.length === 0) process.exitCode = 1;

