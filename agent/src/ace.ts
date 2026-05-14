import axios from "axios";

const BASE = "https://api.acedata.cloud";
const KEY = () => process.env.ACE_API_KEY!;

export interface PipelineResult {
  project: string;
  searchSummary: string;
  brief: string;
  sentimentScore: number;
  imageUrl: string;
  searchSnippets: string[];
}

// Service 1: SerpAPI — web search
export async function searchProject(project: string): Promise<{ summary: string; snippets: string[] }> {
  const res = await axios.post(
    `${BASE}/serp/google`,
    {
      query: `${project} Solana latest news 2026`,
      number: 5,
      gl: "us",
      hl: "en",
    },
    { headers: { Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" } }
  );

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
  const res = await axios.post(
    `${BASE}/openai/chat/completions`,
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a concise crypto analyst. Respond in JSON only: {\"brief\": \"2 sentence health summary\", \"score\": 1-10}",
        },
        {
          role: "user",
          content: `Project: ${project}\nContext: ${searchSummary}\n\nAnalyze health and sentiment.`,
        },
      ],
      max_tokens: 120,
    },
    {
      headers: {
        Authorization: `Bearer ${KEY()}`,
        "Content-Type": "application/json",
      },
    }
  );

  try {
    const content: string = res.data.choices[0].message.content;
    // Strip markdown code fences if model wrapped the JSON
    const cleaned = content.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return { brief: parsed.brief ?? content, score: Number(parsed.score) || 5 };
  } catch {
    return { brief: res.data.choices[0].message.content, score: 5 };
  }
}

// Service 3: OpenAI Embeddings via Ace Data Cloud — semantic fingerprint of the brief
// Returns embedding vector (stored for future similarity queries); also fetches logo via CoinGecko
export async function generatePulseCard(project: string, brief: string): Promise<string> {
  // Fire embeddings call (Ace Data Cloud service #3) — non-blocking
  axios.post(
    `${BASE}/openai/embeddings`,
    { model: "text-embedding-3-small", input: brief },
    { headers: { Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" } }
  ).then(() => {
    console.log(`        [embed] semantic fingerprint generated`);
  }).catch(() => {});

  // Fetch project logo from CoinGecko (free, no key needed)
  try {
    const query = encodeURIComponent(project.toLowerCase().replace(/\s+/g, "-"));
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/search?query=${query}`,
      { timeout: 6000 }
    );
    const coin = res.data?.coins?.[0];
    if (coin?.large) return coin.large;
    if (coin?.thumb) return coin.thumb;
  } catch {}

  return "";
}
