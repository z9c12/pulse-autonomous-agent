# Pulse — Autonomous Solana Ecosystem Monitor

Autonomous AI agent that monitors every Solana project in real time.
Built for the OOBE × Ace Data Cloud bounty (Category 2: Ace Data Cloud Usage).

## How It Works

Every 2 minutes the agent autonomously:

1. **Discovers tools via SAP** — queries Synapse Agent Protocol for available web-search, image-generation, and text-generation agents
2. **Picks the next Solana project** — rotates through 100+ projects loaded from DeFiLlama
3. **Runs 3 Ace Data Cloud services:**
   - SerpAPI → searches latest news for that project
   - Chat (GPT-4o-mini) → generates a 2-sentence health brief + sentiment score 1-10
   - Flux → generates a visual pulse card image
4. **Settles payment on SAP** — x402 payment recorded on-chain
5. **Saves to Supabase** → live dashboard updates automatically

No manual steps. Trigger → execution → payment, fully autonomous.

## Bounty Requirements Checklist

- [x] Registered on SAP mainnet
- [x] Complete automated workflow (trigger → execute → pay)
- [x] Ace Data Cloud account with free credits
- [x] x402 with AceDataCloud facilitator + Synapse RPC
- [x] 3 distinct Ace Data Cloud services (SerpAPI, Chat, Flux)
- [x] Tool discovery via SAP at startup

## Setup

### 1. Agent

```bash
cd agent
cp .env.example .env
# Fill in .env values (see below)
npm install
npm start
```

### 2. Dashboard

```bash
cd dashboard
cp .env.example .env.local
# Fill in Supabase values
npm install
npm run dev
```

Open http://localhost:3000

### 3. Supabase table

Run this SQL once in your Supabase project:

```sql
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
```

## Environment Variables

### agent/.env

| Variable | How to get it |
|---|---|
| `SOLANA_PRIVATE_KEY` | `solana-keygen new` — use a fresh wallet |
| `SYNAPSE_RPC_URL` | Free tier at oobeprotocol.ai |
| `ACE_API_KEY` | Free credits at platform.acedata.cloud |
| `EVM_PRIVATE_KEY` | Any EVM wallet with small USDC on Base (for x402) |
| `SUPABASE_URL` | supabase.com free project |
| `SUPABASE_ANON_KEY` | supabase.com free project |

## Stack

- **SAP SDK** (`@synapse-sap/sdk`) — agent registration, tool discovery, payment settlement
- **Synapse Client SDK** (`@oobe-protocol-labs/synapse-client-sdk`) — Solana RPC
- **Ace Data Cloud** — SerpAPI, Chat, Flux via x402 payments
- **Next.js + Supabase** — live dashboard
- **DeFiLlama API** — Solana project list (free, no key needed)

## Category

**Category 2: Ace Data Cloud Usage** — agent generates continuous x402 payment volume
through 3 distinct Ace Data Cloud services per cycle.
