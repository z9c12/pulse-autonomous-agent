import axios from "axios";
import { logger } from "./logger";

export interface PulseCard {
  project: string;
  brief: string;
  sentiment_score: number;
  image_url: string;
  search_snippets: string[];
  sap_tx: string | null;
}

const supabaseUrl = () => process.env.SUPABASE_URL!;
const serviceKey  = () => process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY!;

function headers() {
  return {
    apikey: serviceKey(),
    Authorization: `Bearer ${serviceKey()}`,
    "Content-Type": "application/json",
  };
}

export async function savePulse(card: PulseCard): Promise<void> {
  await axios.post(
    `${supabaseUrl()}/rest/v1/pulses`,
    card,
    { headers: { ...headers(), Prefer: "return=minimal" } }
  );
}

export async function getLatestPulses(limit = 10): Promise<PulseCard[]> {
  const safe = Math.min(Math.max(1, limit), 100);
  const res = await axios.get(
    `${supabaseUrl()}/rest/v1/pulses?order=created_at.desc&limit=${safe}`,
    { headers: headers() }
  );
  return res.data as PulseCard[];
}

export async function getPulseForProject(project: string): Promise<PulseCard | null> {
  // project is already validated by the caller; encode for URL safety
  const res = await axios.get(
    `${supabaseUrl()}/rest/v1/pulses?project=ilike.${encodeURIComponent(project)}&order=created_at.desc&limit=1`,
    { headers: headers() }
  );
  const rows = res.data as PulseCard[];
  return rows[0] ?? null;
}

export async function ensureTable(): Promise<void> {
  try {
    await axios.get(`${supabaseUrl()}/rest/v1/pulses?limit=1`, { headers: headers() });
    logger.info("[DB] Supabase connected — pulses table ready\n");
  } catch (err: any) {
    const status = err.response?.status;
    const code   = err.response?.data?.code;
    if (status === 404 || code === "42P01") {
      logger.warn("[DB] 'pulses' table not found — create it in Supabase with the SQL in README");
    } else {
      logger.error("[DB] Connection check failed", err);
    }
  }
}
