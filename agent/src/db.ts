import axios from "axios";

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

export async function savePulse(card: PulseCard): Promise<void> {
  await axios.post(
    `${supabaseUrl()}/rest/v1/pulses`,
    card,
    {
      headers: {
        apikey: serviceKey(),
        Authorization: `Bearer ${serviceKey()}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
    }
  );
}

export async function ensureTable(): Promise<void> {
  // Verify connection works
  try {
    await axios.get(`${supabaseUrl()}/rest/v1/pulses?limit=1`, {
      headers: {
        apikey: serviceKey(),
        Authorization: `Bearer ${serviceKey()}`,
      },
    });
    console.log("[DB] Supabase connected — pulses table ready\n");
  } catch (err: any) {
    if (err.response?.status === 404 || err.response?.data?.code === "42P01") {
      console.error("[DB] ERROR: 'pulses' table not found. Create it in Supabase SQL Editor:");
      console.error(`
  create table pulses (
    id bigserial primary key,
    project text not null,
    brief text,
    sentiment_score int,
    image_url text,
    search_snippets jsonb,
    sap_tx text,
    created_at timestamptz default now()
  );
  alter table pulses enable row level security;
  create policy "Public read" on pulses for select using (true);
      `);
    } else {
      console.warn("[DB] Warning:", err.response?.data?.message ?? err.message);
    }
  }
}
