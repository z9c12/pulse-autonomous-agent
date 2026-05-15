import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PAGE_SIZE = 50;
const ALLOWED_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pulse-autonomous-agent.vercel.app";

function corsHeaders(origin: string | null) {
  const allowed = origin === ALLOWED_ORIGIN ? origin : "";
  return allowed
    ? {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      }
    : {};
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(req: NextRequest) {
  // Block cross-origin browser requests from unknown origins
  const origin = req.headers.get("origin");
  if (origin && origin !== ALLOWED_ORIGIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Validate page param — must be a positive integer
  const rawPage = req.nextUrl.searchParams.get("page") ?? "1";
  const page = parseInt(rawPage, 10);
  if (!Number.isFinite(page) || page < 1 || page > 10_000) {
    return NextResponse.json({ error: "Invalid page." }, { status: 400 });
  }

  const offset = (page - 1) * PAGE_SIZE;

  try {
    const [dataRes, countRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/pulses?select=*&order=created_at.desc&limit=${PAGE_SIZE}&offset=${offset}`,
        {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
          cache: "no-store",
        }
      ),
      fetch(`${SUPABASE_URL}/rest/v1/pulses?select=id`, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: "count=exact",
          "Range-Unit": "items",
          Range: "0-0",
        },
        cache: "no-store",
      }),
    ]);

    if (!dataRes.ok) {
      return NextResponse.json({ error: "Failed to fetch pulses." }, { status: 502 });
    }

    const data = await dataRes.json();
    const contentRange = countRes.headers.get("content-range");
    const total = contentRange ? parseInt(contentRange.split("/")[1], 10) : data.length;

    return NextResponse.json(
      { data, total, page, pageSize: PAGE_SIZE },
      { headers: corsHeaders(origin) }
    );
  } catch {
    // Never expose internal error details to the client
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
}
