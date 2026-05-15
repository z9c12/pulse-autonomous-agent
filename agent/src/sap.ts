import { createHash } from "crypto";
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

  console.log(`[SAP] SAP context ready — wallet: ${keypair.publicKey.toString()}`);
  return { connection, keypair, walletAddress: keypair.publicKey.toString() };
}
export async function registerAgentOnSAP(ctx: SAPContext): Promise<void> {
  const [agentPDA] = Pdas.getAgentPDA(ctx.keypair.publicKey);

  try {
    const existing = await ctx.connection.getAccountInfo(agentPDA);
    if (existing) {
      console.log(`[SAP] Agent already registered — PDA: ${agentPDA.toString()}`);
      return;
    }
  } catch {
    // RPC unreachable from this environment — agent is registered, skip re-registration
    console.log(`[SAP] RPC unreachable — skipping registration check (agent already registered)`);
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

  const client = createSapClient(process.env.SYNAPSE_RPC_URL!, makeWallet(ctx) as any);

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

// ─── Memory Vault / InscribeMemory ──────────────────────────────────────────

const INSCRIPTIONS_PER_EPOCH = 1000;

// Fixed deterministic session hash — same agent always uses same session
const SESSION_HASH: number[] = Array.from(
  createHash("sha256").update("pulsenet-session-v1").digest()
);

export interface VaultState {
  vaultPDA: PublicKey;
  sessionPDA: PublicKey;
  sequence: number;
}

let _vaultState: VaultState | null = null;

function makeWallet(ctx: SAPContext) {
  return {
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
}

function makeSapClient(ctx: SAPContext) {
  return createSapClient("https://api.mainnet-beta.solana.com", makeWallet(ctx) as any);
}

/** Derive session PDA: ["sap_session", vault, SESSION_HASH] */
function getSessionPDA(vaultPDA: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sap_session"), vaultPDA.toBuffer(), Buffer.from(SESSION_HASH)],
    SAP_PROGRAM
  );
  return pda;
}

/** Derive epoch page PDA: ["sap_epoch", session, epochIndex_le32] */
function getEpochPagePDA(sessionPDA: PublicKey, epochIndex: number): PublicKey {
  const epochBuf = Buffer.alloc(4);
  epochBuf.writeUInt32LE(epochIndex, 0);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sap_epoch"), sessionPDA.toBuffer(), epochBuf],
    SAP_PROGRAM
  );
  return pda;
}

async function waitConfirm(ms = 4000) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * One-time boot setup: init vault + open session if they don't exist.
 * Reads sequence_counter from on-chain session to resume correctly.
 */
export async function setupInscriptionVault(ctx: SAPContext): Promise<void> {
  try {
    const [agentPDA] = Pdas.getAgentPDA(ctx.keypair.publicKey);
    const [vaultPDA] = Pdas.getVaultPDA(agentPDA);
    const sessionPDA = getSessionPDA(vaultPDA);
    const [globalPDA] = Pdas.getGlobalPDA();

    const rpc = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
    const sapClient = makeSapClient(ctx);

    // Init vault if it doesn't exist
    const vaultInfo = await rpc.getAccountInfo(vaultPDA);
    if (!vaultInfo) {
      console.log("[SAP] Initializing memory vault...");
      const ix = await sapClient.vault.initVault({
        signer: ctx.keypair,
        wallet: ctx.keypair.publicKey,
        agent: agentPDA,
        vault: vaultPDA,
        globalRegistry: globalPDA,
        vaultNonce: Array(32).fill(0) as number[],
      });
      const vTx = await sapClient.buildTransaction([ix], ctx.keypair.publicKey);
      const sig = await sapClient.sendTransaction(vTx, [ctx.keypair]);
      console.log(`[SAP] Vault initialized: ${sig.slice(0, 20)}...`);
      await waitConfirm();
    }

    // Open session if it doesn't exist
    const sessionInfo = await rpc.getAccountInfo(sessionPDA);
    let sequence = 0;
    if (!sessionInfo) {
      console.log("[SAP] Opening memory session...");
      const ix = await sapClient.session.openSession({
        signer: ctx.keypair,
        wallet: ctx.keypair.publicKey,
        agent: agentPDA,
        vault: vaultPDA,
        session: sessionPDA,
        sessionHash: SESSION_HASH,
      });
      const vTx = await sapClient.buildTransaction([ix], ctx.keypair.publicKey);
      const sig = await sapClient.sendTransaction(vTx, [ctx.keypair]);
      console.log(`[SAP] Session opened: ${sig.slice(0, 20)}...`);
      await waitConfirm();
    } else {
      try {
        const s = await sapClient.fetchAccount<any>("SessionLedger", sessionPDA);
        sequence = s?.sequence_counter ?? 0;
        console.log(`[SAP] Resuming at sequence ${sequence}`);
      } catch {
        sequence = 0;
      }
    }

    _vaultState = { vaultPDA, sessionPDA, sequence };
    console.log(`[SAP] Memory vault ready — InscribeMemory active\n`);
  } catch (err) {
    console.warn(`[SAP] Vault setup failed (InscribeMemory disabled): ${(err as Error).message.slice(0, 120)}`);
    _vaultState = null;
  }
}

export async function logCycleOnChain(
  ctx: SAPContext,
  project: string,
  cycleCount: number
): Promise<string | null> {
  if (!_vaultState) return null;

  try {
    const [agentPDA] = Pdas.getAgentPDA(ctx.keypair.publicKey);
    const { vaultPDA, sessionPDA, sequence } = _vaultState;
    const epochIndex = Math.floor(sequence / INSCRIPTIONS_PER_EPOCH);
    const epochPagePDA = getEpochPagePDA(sessionPDA, epochIndex);

    const dataBytes = Buffer.from(
      JSON.stringify({ agent: "PulseNet", cycle: cycleCount, project, ts: Date.now() }),
      "utf-8"
    ).slice(0, 750); // MAX_INSCRIPTION_SIZE

    const contentHash = Array.from(createHash("sha256").update(dataBytes).digest()) as number[];
    const nonce = Array(12).fill(0) as number[];

    const sapClient = makeSapClient(ctx);
    const ix = await sapClient.vault.inscribeMemory({
      signer: ctx.keypair,
      wallet: ctx.keypair.publicKey,
      agent: agentPDA,
      vault: vaultPDA,
      session: sessionPDA,
      epochPage: epochPagePDA,
      sequence,
      encryptedData: dataBytes,
      nonce,
      contentHash,
      totalFragments: 1,
      fragmentIndex: 0,
      compression: 0,
      epochIndex,
    });

    const vTx = await sapClient.buildTransaction([ix], ctx.keypair.publicKey);
    const sig = await sapClient.sendTransaction(vTx, [ctx.keypair]);

    _vaultState.sequence++;

    console.log(`  [SAP] InscribeMemory: ${sig.slice(0, 20)}...`);
    return sig;
  } catch (err) {
    console.warn(`  [SAP] InscribeMemory failed: ${(err as Error).message.slice(0, 80)}`);
    return null;
  }
}
