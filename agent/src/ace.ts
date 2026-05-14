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
        query: `${project} Solana crypto logo`,
        number: 5,
        gl: "us",
        hl: "en",
        tbm: "isch",
      },
      { headers: { Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" } }
    );

    // SerpAPI image search returns images array
    const images: any[] = res.data?.images ?? res.data?.image_results ?? res.data?.inline_images ?? [];
    const url = images[0]?.original ?? images[0]?.thumbnail ?? images[0]?.link ?? "";
    if (url) return url;

    // Fallback: pull thumbnail from organic results
    const organic: any[] = res.data?.organic ?? [];
    return organic[0]?.thumbnail ?? "";
  } catch (e: any) {
    console.log(`        [img] image search failed (${e.response?.status ?? e.message})`);
    return "";
  }
}
