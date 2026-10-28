import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = join(root, "src");
const forbiddenPatterns = [
  {
    pattern: /@workspace\//,
    message: "workspace-only imports are not allowed",
  },
  {
    pattern: /\b(?:pg|pg-pool|drizzle-orm|sequelize|typeorm|prisma)\b/,
    message: "database ownership must stay outside realtime-service",
  },
  {
    pattern: /\b(?:twilio|vonage|africas[_-]talking|mapbox)\b/i,
    message:
      "provider/business integrations must stay outside realtime-service",
  },
  {
    pattern: /\b(?:DATABASE_URL|POSTGRES_URL)\b/,
    message: "database configuration is not allowed in realtime-service",
  },
];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (extname(entry.name) === ".ts") files.push(path);
  }
  return files;
}

const violations = [];
for (const file of await sourceFiles(sourceRoot)) {
  const contents = await readFile(file, "utf8");
  for (const { pattern, message } of forbiddenPatterns) {
    if (pattern.test(contents)) {
      violations.push(`${relative(root, file)}: ${message}`);
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log(
  `Lint passed for ${await sourceFiles(sourceRoot).then((files) => files.length)} TypeScript source files.`,
);

