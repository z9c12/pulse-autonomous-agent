import { searchProject, analyzeProject, generatePulseCard } from "./ace";
import { savePulse } from "./db";
import { logCycleOnChain, SAPContext } from "./sap";
import { getProjectLogo } from "./projects";
import { logger } from "./logger";

export async function runPipeline(
  project: string,
  sapCtx: SAPContext | null,
  cycleCount: number
): Promise<void> {
  logger.info(`\n[Pipeline #${cycleCount}] Processing: ${project}`);
  const start = Date.now();

  logger.info(`  [1/3] SerpAPI: searching "${project} Solana news"...`);
  const { summary, snippets } = await searchProject(project);
  logger.info(`        Found ${snippets.length} results`);

  logger.info(`  [2/3] Chat: analyzing health and sentiment...`);
  const { brief, score } = await analyzeProject(project, summary);
  logger.info(`        Score: ${score}/10 | ${brief.slice(0, 80)}...`);

  logger.info(`  [3/3] Embeddings + logo fetch...`);
  const llamaLogo = getProjectLogo(project);
  const imageUrl = llamaLogo || await generatePulseCard(project, brief);
  logger.info(`        Image: ${imageUrl ? imageUrl.slice(0, 60) : "none"}`);

  const sapTx = sapCtx ? await logCycleOnChain(sapCtx, project, cycleCount) : null;

  await savePulse({
    project,
    brief,
    sentiment_score: score,
    image_url: imageUrl,
    search_snippets: snippets,
    sap_tx: sapTx,
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  logger.info(`  Done in ${elapsed}s | SAP tx: ${sapTx ?? "none"}`);
}
