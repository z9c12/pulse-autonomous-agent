import express from "express";
import cors from "cors";
import { privateKeyToAccount } from "viem/accounts";
import { getLatestPulses, getPulseForProject } from "./db";
import { logger } from "./logger";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { paymentMiddleware, x402ResourceServer } = require("@x402/express") as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ExactEvmScheme } = require("@x402/evm/exact/server") as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { HTTPFacilitatorClient } = require("@x402/core/server") as any;

const FACILITATOR_URL = "https://facilitator.acedata.cloud";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PRICE = { amount: "1000", asset: USDC_BASE };
const NETWORK = "base";

// Only allow requests from the production dashboard + server-to-server x402 callers (no origin)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "https://pulse-autonomous-agent.vercel.app")
  .split(",")
  .map((o) => o.trim());

// Project name: printable ASCII, no path chars, max 120 chars
const PROJECT_RE = /^[\w\s\-.:()&#@!]{1,120}$/;

function validateProject(raw: string): string | null {
  const decoded = decodeURIComponent(raw).trim();
  if (!PROJECT_RE.test(decoded)) return null;
  return decoded;
}

function getEvmAddress(): string {
  const key = process.env.EVM_PRIVATE_KEY as `0x${string}`;
  if (!key) throw new Error("EVM_PRIVATE_KEY not set");
  return privateKeyToAccount(key).address;
}

export function startPaymentServer(): void {
  const port = Number(process.env.PORT ?? 3000);
  const payTo = getEvmAddress();

  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const evmScheme = new ExactEvmScheme({
    stablecoins: {
      base: {
        address: USDC_BASE,
        name: "USD Coin",
        version: "2",
        decimals: 6,
      },
    },
  });
  const resourceServer = new x402ResourceServer(facilitator).register("base", evmScheme);

  const app = express();

  // Limit request body size
  app.use(express.json({ limit: "16kb" }));

  // CORS — allow production dashboard; server-to-server x402 callers have no origin (allowed)
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("CORS: origin not allowed"));
        }
      },
      methods: ["GET", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-PAYMENT", "Authorization", "Accept"],
    })
  );

  // Public health check — no payment required
  const healthPayload = (_req: express.Request, res: express.Response) => {
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
  };
  app.get("/", healthPayload);
  app.get("/health", healthPayload);

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
    } catch (err) {
      logger.error("GET /pulse/latest", err);
      res.status(500).json({ error: "Failed to retrieve intelligence reports." });
    }
  });

  app.get("/pulse/:project", async (req, res) => {
    const project = validateProject(req.params.project);
    if (!project) {
      return res.status(400).json({ error: "Invalid project name." });
    }

    try {
      const pulse = await getPulseForProject(project);
      if (!pulse) {
        return res.status(404).json({
          error: "No data found.",
          hint: `No intelligence report for "${project}". Try again after the next cycle.`,
        });
      }
      res.json({ pulse, agent: "PulseNet" });
    } catch (err) {
      logger.error(`GET /pulse/${project}`, err);
      res.status(500).json({ error: "Failed to retrieve intelligence report." });
    }
  });

  // Catch-all 404
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  app.listen(port, "0.0.0.0", () => {
    logger.info(`[x402] Payment server live on port ${port}`);
    logger.info(`[x402] Accepting 0.001 USDC (Base) — payTo: ${payTo}`);
    logger.info(`[x402] Facilitator: ${FACILITATOR_URL}`);
  });
}
