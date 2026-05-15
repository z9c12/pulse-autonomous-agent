# PulseNet — Autonomous Solana Ecosystem Monitor

Autonomous AI agent that monitors every Solana DeFi project in real time and sells the intelligence via x402 micropayments.

Built for the **OOBE × Ace Data Cloud bounty** (Category 2: Ace Data Cloud Usage).

**Live agent:** `https://pulse-autonomous-agent-production.up.railway.app`  
**SAP wallet:** `AJ7G89eqR8eGnfAKkd3QDt2addfRc9fNQbag6c5FKjJ2`  
**Agent PDA:** `3KW3EtJASaU24UJCuHQCJ8F7HxJ6afjtTGW11VpqLeNk`

---

## How It Works

Every 2 minutes PulseNet autonomously:

1. **Picks the next Solana project** — rotates through 154 projects loaded from DeFiLlama
2. **Searches for latest news** — SerpAPI via Ace Data Cloud
3. **Generates AI analysis** — GPT-4o-mini via Ace Data Cloud (health brief + sentiment score 1–10)
4. **Creates semantic fingerprint** — text-embedding-3-small via Ace Data Cloud
5. **Logs on-chain** — SAP memo transaction on Solana mainnet via Synapse RPC
6. **Saves to Supabase** — live intelligence database continuously updated

The intelligence it generates is sold via x402 — any agent or developer pays **0.001 USDC on Base** to query PulseNet's database.

---

## x402 Payment API

PulseNet is a live x402-payable agent. No API key needed — just pay and query.

| Endpoint | Price | Returns |
|---|---|---|
| `GET /health` | free | Agent status, payTo address, supported endpoints |
| `GET /pulse/latest` | 0.001 USDC | Last 10 intelligence reports |
| `GET /pulse/:project` | 0.001 USDC | Latest report for any Solana project |

**Payment details:**
- Network: Base mainnet
- Asset: USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)
- Pay to: `0x0375D7Cf01901c8E78e2fc1d89e18DE0523D391E`
- Facilitator: `https://facilitator.acedata.cloud`
- Protocol: x402 v2 / exact scheme

### Example — query with x402-axios

```typescript
import { wrapAxiosWithPayment, x402Client } from "@x402/axios";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import axios from "axios";

const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);
const client = new x402Client();
client.register(ExactEvmScheme, toClientEvmSigner(account));

const api = wrapAxiosWithPayment(axios.create(), client);
const res = await api.get("https://pulse-autonomous-agent-production.up.railway.app/pulse/Jupiter%20Exchange");
console.log(res.data);
```

---

## Bounty Requirements

- [x] **Registered on SAP mainnet** — PDA `3KW3EtJASaU24UJCuHQCJ8F7HxJ6afjtTGW11VpqLeNk`, registration tx `3qBMFpCcdi37KP9o9nmXKEZuYj3ZszvmddPDmzyj3fiecWx4CqtsmnaH2CsXbKN8m8fnVkFGbzwWf8vCBsCTXTfU`
- [x] **Complete automated workflow** — runs autonomously on Railway, no manual steps
- [x] **Ace Data Cloud account** — API key with prepaid credits
- [x] **x402 with AceDataCloud facilitator** — accepts payments via `facilitator.acedata.cloud`, Base mainnet USDC
- [x] **3 distinct Ace Data Cloud services** — SerpAPI, GPT-4o-mini chat, text-embedding-3-small
- [x] **Synapse RPC in execution** — SAP memo logged on-chain every cycle

---

## Architecture

```
Railway (EU West)
└── PulseNet agent (Node.js / tsx)
    ├── Autonomous loop (every 2 min)
    │   ├── DeFiLlama → project list (154 Solana projects)
    │   ├── Ace Data Cloud → SerpAPI search
    │   ├── Ace Data Cloud → GPT-4o-mini analysis
    │   ├── Ace Data Cloud → text-embedding-3-small
    │   ├── Synapse RPC → on-chain SAP memo
    │   └── Supabase → save pulse record
    └── x402 payment server (Express, port 8080)
        ├── GET /health          (public)
        ├── GET /pulse/latest    (0.001 USDC)
        └── GET /pulse/:project  (0.001 USDC)
```

---

## Setup

### 1. Clone and install

```bash
cd agent
npm install
cp .env.example .env   # fill in values below
```

### 2. Supabase table

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

### 3. Environment variables

| Variable | Description | Where to get it |
|---|---|---|
| `SOLANA_PRIVATE_KEY` | Agent wallet private key (bs58) | `solana-keygen new` |
| `SYNAPSE_RPC_URL` | Synapse RPC with API key | Free tier at oobeprotocol.ai |
| `ACE_API_KEY` | Ace Data Cloud API key | platform.acedata.cloud |
| `ACE_PLATFORM_TOKEN` | Ace Data Cloud Platform Token | platform.acedata.cloud/console/platform-tokens |
| `EVM_PRIVATE_KEY` | EVM wallet for x402 payTo | Any EVM wallet |
| `SUPABASE_URL` | Supabase project URL | supabase.com |
| `SUPABASE_ANON_KEY` | Supabase anon key | supabase.com |
| `SUPABASE_SERVICE_KEY` | Supabase service key | supabase.com |
| `INTERVAL_MS` | Cycle interval in ms | Default: `120000` |

### 4. Run

```bash
npm start
```

---

## Stack

| Component | Technology |
|---|---|
| Agent runtime | Node.js + tsx (TypeScript) |
| SAP integration | `@oobe-protocol-labs/synapse-sap-sdk` v0.15.1 |
| x402 server | `@x402/express` + `@x402/evm` + `viem` |
| x402 facilitator | AceDataCloud (`facilitator.acedata.cloud`) |
| Web search | Ace Data Cloud → SerpAPI |
| AI analysis | Ace Data Cloud → OpenAI GPT-4o-mini |
| Embeddings | Ace Data Cloud → text-embedding-3-small |
| Database | Supabase (PostgreSQL) |
| Project list | DeFiLlama API |
| Hosting | Railway (EU West) |
