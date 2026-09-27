// Snapshots the bot's API contract into src/botContract.json: every error
// label the bot can answer with (pkg/i18n/en_us.go) and every /api/v1 route
// (pkg/server/v1/openapi.yaml). src/botContract.test.ts checks the client
// against it. Run after the bot's API changes:
//
//   node scripts/sync-bot-contract.mts [path/to/peace-breaker-bot]
//
// knownUnused is kept as is: routes the bot serves that this client
// deliberately doesn't call yet.

import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const bot = path.resolve(process.argv[2] ?? path.join(root, "../peace-breaker-bot"));
const out = path.join(root, "src/botContract.json");

interface Contract {
  labels: string[];
  routes: string[];
  knownUnused: string[];
}

export function parseLabels(catalog: string): string[] {
  const keys = [...catalog.matchAll(/^\s*"([a-z_]+)":/gm)].map(m => m[1]);
  return [...new Set(keys)].sort();
}

export function parseRoutes(spec: string): string[] {
  const routes: string[] = [];
  let current: string | null = null;
  for (const line of spec.split("\n")) {
    const pathMatch = /^ {2}(\/api\/v1\/\S+):\s*$/.exec(line);
    if (pathMatch) {
      current = pathMatch[1].slice("/api/v1".length);
      continue;
    }
    if (/^ {2}\S/.test(line) || /^\S/.test(line)) current = null;
    const method = /^ {4}(get|post|put|patch|delete):\s*$/.exec(line);
    if (current && method) routes.push(`${method[1].toUpperCase()} ${current}`);
  }
  return routes.sort();
}

async function main() {
  const catalog = await fs.readFile(path.join(bot, "pkg/i18n/en_us.go"), "utf8");
  const spec = await fs.readFile(path.join(bot, "pkg/server/v1/openapi.yaml"), "utf8");

  let knownUnused: string[] = [];
  try {
    knownUnused = (JSON.parse(await fs.readFile(out, "utf8")) as Contract).knownUnused;
  } catch {
    // First run: nothing to keep.
  }

  const contract: Contract = { labels: parseLabels(catalog), routes: parseRoutes(spec), knownUnused };
  await fs.writeFile(out, JSON.stringify(contract, null, 2) + "\n");
  console.log(`${contract.labels.length} labels, ${contract.routes.length} routes → ${path.relative(root, out)}`);
}

if (import.meta.main) await main();
