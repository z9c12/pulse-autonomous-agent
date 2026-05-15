import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? "1"));
  const offset = (page - 1) * PAGE_SIZE;

  const [dataRes, countRes] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/pulses?select=*&order=created_at.desc&limit=${PAGE_SIZE}&offset=${offset}`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        cache: "no-store",
      }
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/pulses?select=id`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: "count=exact",
          "Range-Unit": "items",
          Range: "0-0",
        },
        cache: "no-store",
      }
    ),
  ]);

  if (!dataRes.ok) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }

  const data = await dataRes.json();
  const contentRange = countRes.headers.get("content-range"); // e.g. "0-0/312"
  const total = contentRange ? parseInt(contentRange.split("/")[1], 10) : data.length;

  return NextResponse.json({ data, total, page, pageSize: PAGE_SIZE });
}
