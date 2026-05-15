const SEED_PROJECTS = [
  "Jupiter Exchange", "Raydium", "Orca DEX", "Kamino Finance", "Drift Protocol",
  "Marinade Finance", "Jito", "Magic Eden", "Tensor NFT", "Pyth Network",
  "Squads Protocol", "Marginfi", "Solend", "Phoenix DEX", "Lifinity",
  "Meteora", "Sanctum", "Birdeye", "Step Finance", "Hubble Protocol",
  "Mango Markets", "Zeta Markets", "01 Exchange", "Friktion Finance", "Port Finance",
  "Solana Mobile", "Star Atlas", "Aurory", "Genopets", "DeLabs",
  "Famous Fox Federation", "Okay Bears", "DeGods", "y00ts", "Abc",
  "Helius", "QuickNode Solana", "Triton RPC", "GenesysGo", "Syndica",
  "Metaplex", "Candy Machine", "Bubblegum", "Token Metadata", "Compressed NFT",
  "Wormhole", "Allbridge", "deBridge", "Mayan Finance", "Circles Protocol",
  "BONK", "WIF", "POPCAT", "SAMO", "BOME"
];

let projectIndex = 0;
let projectList: string[] = [...SEED_PROJECTS];
const logoMap = new Map<string, string>();

export async function loadProjects(): Promise<void> {
  try {
    const res = await fetch("https://api.llama.fi/protocols");
    const protocols = (await res.json()) as any[];

    const solanaProjects = protocols
      .filter((p) => p.chains?.includes("Solana") && p.name)
      .slice(0, 100);

    for (const p of solanaProjects) {
      if (p.logo) logoMap.set(p.name, p.logo);
    }

    const names = solanaProjects.map((p: any) => p.name);
    if (names.length > 0) {
      projectList = [...new Set([...SEED_PROJECTS, ...names])];
      console.log(`[Projects] Loaded ${projectList.length} Solana projects from DeFiLlama`);
    }
  } catch {
    console.log(`[Projects] DeFiLlama unavailable — using ${SEED_PROJECTS.length} seed projects`);
  }
}

export function getNextProject(): string {
  const project = projectList[projectIndex % projectList.length];
  projectIndex++;
  return project;
}

export function getProjectLogo(name: string): string {
  return logoMap.get(name) ?? "";
}

export function getProjectCount(): number {
  return projectList.length;
}
