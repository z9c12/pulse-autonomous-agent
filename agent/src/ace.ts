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

// Service 3: Google Image Search via SerpAPI — returns a real image for the project
export async function generatePulseCard(project: string, _sentiment: number): Promise<string> {
  try {
    const res = await axios.post(
      `${BASE}/serp/google`,
      {
        query: `${project} Solana crypto`,
        number: 5,
        gl: "us",
        hl: "en",
      },
      { headers: { Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" } }
    );

    const data = res.data;

    // Try knowledge graph image first
    const kg = data?.knowledge_graph?.thumbnail ?? data?.knowledge_graph?.image ?? "";
    if (kg) return kg;

    // Try inline images from organic results
    const images: any[] = data?.images ?? data?.inline_images ?? data?.image_results ?? [];
    for (const img of images) {
      const url = img?.original ?? img?.thumbnail ?? img?.link ?? "";
      if (url?.startsWith("http")) return url;
    }

    // Try thumbnails on organic results
    const organic: any[] = data?.organic ?? [];
    for (const r of organic) {
      const url = r?.thumbnail ?? r?.image ?? "";
      if (url?.startsWith("http")) return url;
    }

    return "";
  } catch (e: any) {
    console.log(`        [img] image search failed (${e.response?.status ?? e.message})`);
    return "";
  }
}
