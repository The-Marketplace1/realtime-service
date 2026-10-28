import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serviceDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(serviceDir, ".test-dist");
const esbuild = resolve(serviceDir, "node_modules/.bin/esbuild");

function findTypeScriptTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return findTypeScriptTests(path);
    return entry.isFile() && entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

if (!existsSync(esbuild)) {
  throw new Error("esbuild is required to run realtime-service tests");
}

mkdirSync(outputDir, { recursive: true });
try {
  const sourceFiles = findTypeScriptTests(resolve(serviceDir, "tests")).sort();
  if (sourceFiles.length === 0)
    throw new Error("No TypeScript test files were found");

  const outputFiles = sourceFiles.map((sourcePath) => {
    const outputName = relative(resolve(serviceDir, "tests"), sourcePath)
      .replaceAll(/[\\/]/g, "-")
      .replace(/\.test\.ts$/, ".mjs");
    const outputFile = resolve(outputDir, outputName);
    execFileSync(
      esbuild,
      [
        sourcePath,
        "--bundle",
        "--platform=node",
        "--format=esm",
        "--packages=external",
        "--outfile=" + outputFile,
        "--log-level=warning",
      ],
      { stdio: "inherit" },
    );
    return outputFile;
  });

  execFileSync(process.execPath, ["--test", ...outputFiles], {
    cwd: serviceDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      JWT_SECRET: process.env.JWT_SECRET ?? "unit-test-verification-key",
      REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
      CORS_ORIGINS: process.env.CORS_ORIGINS ?? "http://localhost",
    },
    stdio: "inherit",
  });
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}

