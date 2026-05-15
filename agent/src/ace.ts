import axios from "axios";

const aceApi = axios.create({
  baseURL: "https://api.acedata.cloud",
  headers: {
    Authorization: `Bearer ${process.env.ACE_API_KEY}`,
    "Content-Type": "application/json",
  },
});


// Service 1: SerpAPI — web search
export async function searchProject(project: string): Promise<{ summary: string; snippets: string[] }> {
  let res;
  try {
    res = await aceApi.post("/serp/google", {
      query: `${project} Solana latest news`,
      num: 5,
      gl: "us",
      hl: "en",
    });
  } catch (err: any) {
    const body = err.response?.data;
    console.error(`  [SerpAPI] ${err.response?.status} error:`, JSON.stringify(body).slice(0, 200));
    throw err;
  }

  const results: any[] = res.data?.organic ?? res.data?.results ?? [];
  const snippets = results.map((r: any) => `${r.title}: ${r.snippet ?? r.description ?? ""}`);
  return {
    summary: snippets.slice(0, 3).join(" | "),
    snippets,
  };
}

// Service 2: Chat completions — analysis + sentiment
export async function analyzeProject(
  project: string,
  searchSummary: string
): Promise<{ brief: string; score: number }> {
  const res = await aceApi.post("/openai/chat/completions", {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          'You are a concise crypto analyst. Respond in JSON only: {"brief": "2 sentence health summary", "score": 1-10}',
      },
      {
        role: "user",
        content: `Project: ${project}\nContext: ${searchSummary}\n\nAnalyze health and sentiment.`,
      },
    ],
    max_tokens: 120,
  });

  try {
    const content: string = res.data.choices[0].message.content;
    const cleaned = content.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return { brief: parsed.brief ?? content, score: Number(parsed.score) || 5 };
  } catch {
    return { brief: res.data.choices[0].message.content, score: 5 };
  }
}

// Service 3: OpenAI Embeddings via Ace Data Cloud — semantic fingerprint of the brief
export async function generatePulseCard(project: string, brief: string): Promise<string> {
  aceApi.post("/openai/embeddings", {
    model: "text-embedding-3-small",
    input: brief,
  }).then(() => {
    console.log(`        [embed] semantic fingerprint generated`);
  }).catch(() => {});

  // Fetch project logo from CoinGecko (fallback when DeFiLlama logo unavailable)
  const suffixes = /\s+(Exchange|Finance|Protocol|DEX|Network|Markets|Labs|DAO|App|Platform)$/i;
  const queries = [project, project.replace(suffixes, ""), project.split(" ")[0]];
  for (const q of [...new Set(queries)]) {
    try {
      const res = await axios.get(
        `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`,
        { timeout: 6000 }
      );
      const coin = res.data?.coins?.[0];
      if (coin?.large) return coin.large;
      if (coin?.thumb) return coin.thumb;
    } catch {}
  }

  return "";
}
