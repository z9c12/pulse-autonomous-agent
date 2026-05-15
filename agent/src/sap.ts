import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { createSapClient, Pdas } from "@oobe-protocol-labs/synapse-sap-sdk";
import bs58 from "bs58";

const bsDecode: (s: string) => Uint8Array =
  (bs58 as any).default?.decode?.bind((bs58 as any).default) ?? (bs58 as any).decode.bind(bs58);

const SAP_PROGRAM = new PublicKey("SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ");

/** Derive the per-agent pricing-menu PDA ([b"sap_pricing", agentPDA]) */
function getPricingMenuPDA(agentPDA: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sap_pricing"), agentPDA.toBuffer()],
    SAP_PROGRAM
  );
}

export interface SAPContext {
  connection: Connection;
  keypair: Keypair;
  walletAddress: string;
}

export async function setupSAP(): Promise<SAPContext> {
  const keypair = Keypair.fromSecretKey(bsDecode(process.env.SOLANA_PRIVATE_KEY!));

  const connection = new Connection(
    process.env.SYNAPSE_RPC_URL!,
    { commitment: "confirmed", disableRetryOnRateLimit: true }
  );

  const slotPromise = connection.getSlot();
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("RPC timeout")), 8000)
  );
  const slot = await Promise.race([slotPromise, timeoutPromise]);
  console.log(`[SAP] Connected to Synapse RPC — slot ${slot}`);

  return { connection, keypair, walletAddress: keypair.publicKey.toString() };
}

export async function registerAgentOnSAP(ctx: SAPContext): Promise<void> {
  const [agentPDA] = Pdas.getAgentPDA(ctx.keypair.publicKey);

  const existing = await ctx.connection.getAccountInfo(agentPDA);
  if (existing) {
    console.log(`[SAP] Agent already registered — PDA: ${agentPDA.toString()}`);
    return;
  }

  console.log("[SAP] Registering agent on SAP mainnet...");

  const balance = await ctx.connection.getBalance(ctx.keypair.publicKey);
  if (balance < 40_000_000) {
    console.warn(
      `[SAP] Insufficient balance (${balance} lamports) — registration needs ~0.04 SOL.` +
      ` Fund wallet: ${ctx.walletAddress}`
    );
    // Still attempt — program will emit a clearer error if truly insufficient
  }

  const wallet = {
    publicKey: ctx.keypair.publicKey,
    payer: ctx.keypair,
    signTransaction: async <T extends Transaction>(tx: T): Promise<T> => {
      tx.partialSign(ctx.keypair);
      return tx;
    },
    signAllTransactions: async <T extends Transaction>(txs: T[]): Promise<T[]> => {
      txs.forEach((tx) => tx.partialSign(ctx.keypair));
      return txs;
    },
  };

  const client = createSapClient(process.env.SYNAPSE_RPC_URL!, wallet as any);

  const [statsPDA] = Pdas.getAgentStatsPDA(agentPDA);
  const [globalPDA] = Pdas.getGlobalPDA();
  const [pricingMenuPDA] = getPricingMenuPDA(agentPDA);

  // Build instruction data via Anchor (correct Borsh encoding)
  const draftTx: Transaction = await (client.program.methods as any)
    .registerAgent(
      "PulseNet",
      "Autonomous Solana ecosystem intelligence agent — monitors DeFi/protocol health via real-time web search, GPT-4o-mini analysis and semantic embeddings (Ace Data Cloud), with on-chain SAP memo logging every cycle.",
      [{ id: "solana:monitor", description: null, protocolId: "ace-data-cloud", version: "1.0" }],
      [],
      ["x402", "A2A"],
      null,
      null,
      null
    )
    .accounts({
      wallet: ctx.keypair.publicKey,
      agent: agentPDA,
      agentStats: statsPDA,
      globalRegistry: globalPDA,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  const anchorIx = draftTx.instructions[0];

  // The on-chain program v0.10 requires 6 accounts: wallet, agent, agentStats, pricingMenu, globalRegistry, systemProgram
  // (pricingMenu was added after SDK v0.9 — inject it at slot [3])
  const sixAccountIx = new TransactionInstruction({
    programId: SAP_PROGRAM,
    data: anchorIx.data,
    keys: [
      anchorIx.keys[0], // wallet
      anchorIx.keys[1], // agent
      anchorIx.keys[2], // agentStats
      { pubkey: pricingMenuPDA, isSigner: false, isWritable: true }, // pricingMenu (new)
      anchorIx.keys[3], // globalRegistry
      anchorIx.keys[4], // systemProgram
    ],
  });

  try {
    const { blockhash, lastValidBlockHeight } = await ctx.connection.getLatestBlockhash();
    const tx = new Transaction({
      blockhash,
      lastValidBlockHeight,
      feePayer: ctx.keypair.publicKey,
    }).add(sixAccountIx);
    tx.sign(ctx.keypair);

    const sig = await ctx.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
    });

    console.log(`[SAP] Registration sent: ${sig}`);

    // Poll for confirmation (WebSocket not supported by Synapse RPC)
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const status = await ctx.connection.getSignatureStatus(sig);
      const conf = status?.value?.confirmationStatus;
      if (conf === "confirmed" || conf === "finalized") {
        const err = status?.value?.err;
        if (err) {
          console.error(`[SAP] Registration failed on-chain: ${JSON.stringify(err)}`);
          throw new Error(`On-chain error: ${JSON.stringify(err)}`);
        }
        console.log(`[SAP] Agent registered on-chain! tx: ${sig}`);
        console.log(`[SAP] Agent PDA: ${agentPDA.toString()}`);
        return;
      }
    }
    console.warn(`[SAP] Registration tx sent but not confirmed within 60s — sig: ${sig}`);
  } catch (err: any) {
    console.error(`[SAP] Registration failed:`, err.message);
    if (err.logs) console.error(`[SAP] Logs:`, err.logs.join("\n"));
    throw err;
  }
}

export async function discoverTools(ctx: SAPContext): Promise<void> {
  const [ourAgentPDA] = Pdas.getAgentPDA(ctx.keypair.publicKey);
  const [globalPDA] = Pdas.getGlobalPDA();
  console.log(`[SAP] Our agent PDA:   ${ourAgentPDA.toString()}`);
  console.log(`[SAP] Global registry: ${globalPDA.toString()}`);
  console.log(`[SAP] Synapse Studio: https://studio.oobeprotocol.ai`);
  console.log(`      Wallet: ${ctx.walletAddress}`);
}

export async function logCycleOnChain(
  ctx: SAPContext,
  project: string,
  cycleCount: number
): Promise<string | null> {
  try {
    const balance = await ctx.connection.getBalance(ctx.keypair.publicKey);
    if (balance < 10_000) {
      console.warn(`  [SAP] Wallet needs SOL for fees (${balance} lamports) — fund: ${ctx.walletAddress}`);
      return null;
    }

    const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
    const memo = JSON.stringify({
      agent: "PulseNet",
      cycle: cycleCount,
      project,
      services: ["serp", "chat", "embeddings"],
      ts: Date.now(),
    });

    const tx = new Transaction().add(
      new TransactionInstruction({
        keys: [{ pubkey: ctx.keypair.publicKey, isSigner: true, isWritable: false }],
        programId: MEMO_PROGRAM,
        data: Buffer.from(memo, "utf-8"),
      })
    );

    const { blockhash } = await ctx.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = ctx.keypair.publicKey;
    tx.sign(ctx.keypair);

    const sig = await ctx.connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    console.log(`  [SAP] On-chain memo: ${sig.slice(0, 20)}...`);
    return sig;
  } catch (err) {
    console.warn(`  [SAP] Memo skipped: ${(err as Error).message.slice(0, 80)}`);
    return null;
  }
}
