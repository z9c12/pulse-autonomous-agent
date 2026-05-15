import express from "express";
import { privateKeyToAccount } from "viem/accounts";
import { getLatestPulses, getPulseForProject } from "./db";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { paymentMiddleware, x402ResourceServer } = require("@x402/express") as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ExactEvmScheme } = require("@x402/evm/exact/server") as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { HTTPFacilitatorClient } = require("@x402/core/server") as any;

const FACILITATOR_URL = "https://facilitator.acedata.cloud";
// 0.001 USDC — specified as atomic units (6 decimals) to bypass USD conversion
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PRICE = { amount: "1000", asset: USDC_BASE }; // 1000 = 0.001 USDC
const NETWORK = "base";

function getEvmAddress(): string {
  const key = process.env.EVM_PRIVATE_KEY as `0x${string}`;
  if (!key) throw new Error("EVM_PRIVATE_KEY not set");
  return privateKeyToAccount(key).address;
}

export function startPaymentServer(): void {
  const port = Number(process.env.PORT ?? 3000);
  const payTo = getEvmAddress();

  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  // AceDataCloud facilitator uses "base" (not "eip155:8453") — configure USDC explicitly
  const evmScheme = new ExactEvmScheme({
    stablecoins: {
      base: {
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      },
    },
  });
  const resourceServer = new x402ResourceServer(facilitator)
    .register("base", evmScheme);

  const app = express();
  app.use(express.json());

  // Public health check — no payment required
  app.get("/health", (_req, res) => {
    res.json({
      agent: "PulseNet",
      status: "running",
      description: "Autonomous Solana ecosystem intelligence — pay 0.001 USDC per query",
      endpoints: {
        "GET /pulse/latest": "Last 10 intelligence reports",
        "GET /pulse/:project": "Latest report for a specific Solana project",
      },
      payTo,
      network: NETWORK,
      facilitator: FACILITATOR_URL,
    });
  });

  // x402-gated routes
  app.use(
    paymentMiddleware(
      {
        "GET /pulse/latest": {
          accepts: { scheme: "exact", price: PRICE, network: NETWORK, payTo },
          description: "PulseNet — latest 10 Solana intelligence reports",
          mimeType: "application/json",
        },
        "GET /pulse/:project": {
          accepts: { scheme: "exact", price: PRICE, network: NETWORK, payTo },
          description: "PulseNet — Solana project intelligence report",
          mimeType: "application/json",
        },
      },
      resourceServer
    )
  );

  app.get("/pulse/latest", async (_req, res) => {
    try {
      const pulses = await getLatestPulses(10);
      res.json({ pulses, count: pulses.length, agent: "PulseNet" });
    } catch (err: any) {
      res.status(500).json({ error: "Database error", message: err.message });
    }
  });

  app.get("/pulse/:project", async (req, res) => {
    try {
      const project = decodeURIComponent(req.params.project);
      const pulse = await getPulseForProject(project);
      if (!pulse) {
        return res.status(404).json({
          error: "No data yet",
          message: `No intelligence report found for "${project}". Try again after the next cycle.`,
        });
      }
      res.json({ pulse, agent: "PulseNet" });
    } catch (err: any) {
      res.status(500).json({ error: "Database error", message: err.message });
    }
  });

  app.listen(port, () => {
    console.log(`[x402] Payment server live on port ${port}`);
    console.log(`[x402] Accepting 0.001 USDC (Base) per query — payTo: ${payTo}`);
    console.log(`[x402] Facilitator: ${FACILITATOR_URL}`);
  });
}
