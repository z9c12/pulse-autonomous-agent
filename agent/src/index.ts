import "dotenv/config";
import { setupSAP, discoverTools, registerAgentOnSAP } from "./sap";
import { loadProjects, getNextProject, getProjectCount } from "./projects";
import { runPipeline } from "./pipeline";
import { ensureTable } from "./db";

const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 120_000); // default 2 min

async function main() {
  console.log("=== PULSE — Autonomous Solana Ecosystem Monitor ===");
  console.log(`Interval: ${INTERVAL_MS / 1000}s per project\n`);

  // 1. Connect to SAP (Synapse RPC) — non-fatal if unreachable
  let sapCtx = null;
  try {
    console.log("[Boot] Connecting to Synapse Agent Protocol...");
    sapCtx = await setupSAP();
    await registerAgentOnSAP(sapCtx);
    console.log("[Boot] Discovering tools on SAP network...");
    await discoverTools(sapCtx);
  } catch (err) {
    console.warn(`[Boot] SAP unavailable — running without on-chain memos: ${(err as Error).message.slice(0, 80)}`);
  }

  // 3. Load Solana project list
  console.log("[Boot] Loading Solana project list from DeFiLlama...");
  await loadProjects();
  console.log(`[Boot] ${getProjectCount()} projects queued\n`);

  // 4. Print Supabase table hint once
  await ensureTable();

  console.log("[Boot] Agent ready. Starting autonomous loop...\n");

  let cycleCount = 0;

  const tick = async () => {
    cycleCount++;
    const project = getNextProject();
    try {
      await runPipeline(project, sapCtx as any, cycleCount);
    } catch (err) {
      console.error(`[Pipeline] Error on "${project}":`, (err as Error).message);
    }
  };

  // Run immediately, then on interval
  await tick();
  setInterval(tick, INTERVAL_MS);
}

main().catch((err) => {
  console.error("[Fatal]", err);
  process.exit(1);
});
