import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const image = process.env.DOCKER_IMAGE ?? "realtime-service:ci";
const port = Number.parseInt(process.env.DOCKER_VALIDATION_PORT ?? "5080", 10);
const containerName = `realtime-service-validation-${process.pid}`;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

async function stopContainer() {
  await run("docker", ["rm", "--force", containerName]).catch(() => {});
}

await run("docker", [
  "run",
  "--detach",
  "--name",
  containerName,
  "--network",
  "host",
  "--env",
  "NODE_ENV=production",
  "--env",
  `PORT=${port}`,
  "--env",
  "JWT_SECRET=docker-validation-key",
  "--env",
  "REDIS_URL=redis://127.0.0.1:6379",
  "--env",
  "CORS_ORIGINS=http://localhost",
  image,
]);

try {
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/realtime/ready`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The container is still starting.
    }
    await delay(500);
  }
  if (!ready) throw new Error("Container did not become ready");
  console.log(`Docker validation passed for ${image}.`);
} finally {
  await stopContainer();
}

