import { searchProject, analyzeProject, generatePulseCard } from "./ace";
import { savePulse } from "./db";
import { logCycleOnChain, SAPContext } from "./sap";

export async function runPipeline(
  project: string,
  sapCtx: SAPContext,
  cycleCount: number
): Promise<void> {
  console.log(`\n[Pipeline #${cycleCount}] Processing: ${project}`);
  const start = Date.now();

  // Step 1 — SerpAPI: search for latest news
  console.log(`  [1/3] SerpAPI: searching "${project} Solana news"...`);
  const { summary, snippets } = await searchProject(project);
  console.log(`        Found ${snippets.length} results`);

  // Step 2 — Chat: generate brief + sentiment score
  console.log(`  [2/3] Chat: analyzing health and sentiment...`);
  const { brief, score } = await analyzeProject(project, summary);
  console.log(`        Score: ${score}/10 | ${brief.slice(0, 80)}...`);

  // Step 3 — SerpAPI Images: fetch visual pulse card
  console.log(`  [3/3] Image search: fetching project image...`);
  const imageUrl = await generatePulseCard(project, score);
  console.log(`        Image ready: ${imageUrl.slice(0, 60)}...`);

  // Save to Supabase
  const sapTx = await logCycleOnChain(sapCtx, project, cycleCount);

  await savePulse({
    project,
    brief,
    sentiment_score: score,
    image_url: imageUrl,
    search_snippets: snippets,
    sap_tx: sapTx,
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`  Done in ${elapsed}s | SAP tx: ${sapTx ?? "none"}`);
}
