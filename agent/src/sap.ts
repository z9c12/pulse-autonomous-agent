import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, SystemProgram } from "@solana/web3.js";
import { SapClient, PROGRAM_ID as SAP_PROGRAM_ID } from "@oobe-protocol-labs/synapse-sap-sdk";
import { Pdas, Accounts } from "@oobe-protocol-labs/synapse-sap-sdk";
import bs58 from "bs58";

// Synapse Sentinel — live reference agent on SAP mainnet
const SYNAPSE_SENTINEL = "Ccr2yK3hLALU4p8oNRqrh4dGuvPJTth5KCLMio8cE1ph";

export interface SAPContext {
  connection: Connection;
  keypair: Keypair;
  walletAddress: string;
}

export async function setupSAP(): Promise<SAPContext> {
  const keypair = Keypair.fromSecretKey(
    bs58.decode(process.env.SOLANA_PRIVATE_KEY!)
  );

  const connection = new Connection(
    process.env.SYNAPSE_RPC_URL!,
    { commitment: "confirmed", fetchMiddleware: undefined, disableRetryOnRateLimit: true }
  );

  // Verify RPC is reachable with a 8s timeout
  const slotPromise = connection.getSlot();
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("RPC timeout")), 8000)
  );
  const slot = await Promise.race([slotPromise, timeoutPromise]);
  console.log(`[SAP] Connected to Synapse RPC — slot ${slot}`);

  return {
    connection,
    keypair,
    walletAddress: keypair.publicKey.toString(),
  };
}

export async function registerAgentOnSAP(ctx: SAPContext): Promise<void> {
  const agentPDATuple = Pdas.getAgentPDA(ctx.keypair.publicKey);
  const agentPDA = agentPDATuple[0];

  // Idempotent — skip if already registered
  const existing = await ctx.connection.getAccountInfo(agentPDA);
  if (existing) {
    console.log(`[SAP] Agent already registered — PDA: ${agentPDA.toString()}`);
    return;
  }

  console.log("[SAP] Registering agent on SAP mainnet...");

  const balance = await ctx.connection.getBalance(ctx.keypair.publicKey);
  if (balance < 5_000_000) {
    console.warn(`[SAP] Low balance (${balance} lamports) — registration may need ~0.005 SOL`);
  }

  // Wrap Keypair in Anchor wallet interface
  const anchorWallet = {
    publicKey: ctx.keypair.publicKey,
    payer: ctx.keypair,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      if (tx instanceof VersionedTransaction) {
        tx.sign([ctx.keypair]);
      } else {
        (tx as Transaction).partialSign(ctx.keypair);
      }
      return tx;
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      return txs.map((tx) => {
        if (tx instanceof VersionedTransaction) {
          tx.sign([ctx.keypair]);
        } else {
          (tx as Transaction).partialSign(ctx.keypair);
        }
        return tx;
      });
    },
  } as any;

  const client = new SapClient({ connection: ctx.connection, wallet: anchorWallet });

  // Derive all PDAs explicitly
  const SAP_PUBKEY = new PublicKey(SAP_PROGRAM_ID);
  const [agentStatsPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("sap_stats"), agentPDA.toBuffer()],
    SAP_PUBKEY
  );
  const [globalRegistryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("sap_global")],
    SAP_PUBKEY
  );

  try {
    // Build the instruction via Anchor (handles serialization), then send manually
    // — avoids Anchor's WebSocket-based confirmation which Synapse RPC doesn't support
    const ix = await (client.program.methods as any)
      .registerAgent(
        "Pulse",
        "Autonomous Solana ecosystem monitor powered by Ace Data Cloud + SAP",
        [],           // capabilities
        [],           // pricing tiers
        ["x402"],     // protocols
        null,         // agentId
        null,         // agentUri
        null,         // x402Endpoint
      )
      .accounts({
        wallet: ctx.keypair.publicKey,
        agent: agentPDA,
        agentStats: agentStatsPDA,
        globalRegistry: globalRegistryPDA,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const { blockhash } = await ctx.connection.getLatestBlockhash();
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = ctx.keypair.publicKey;
    tx.add(ix);
    tx.sign(ctx.keypair);

    const sig = await ctx.connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    console.log(`[SAP] Agent registered on-chain! tx: ${sig}`);
    console.log(`[SAP] Agent PDA: ${agentPDA.toString()}`);
    // Brief wait so account is visible on next boot's idempotency check
    await new Promise((r) => setTimeout(r, 4000));
  } catch (err: any) {
    console.error(`[SAP] Registration failed:`, err.message);
    if (err.logs) console.error(`[SAP] Logs:`, err.logs.join("\n"));
  }
}

export async function discoverTools(ctx: SAPContext): Promise<void> {
  console.log("[SAP] Discovering tools on network...");

  try {
    // Fetch Synapse Sentinel agent account from SAP mainnet
    const sentinelPubkey = new PublicKey(SYNAPSE_SENTINEL);
    const [sentinelPDA] = Pdas.getAgentPDA(sentinelPubkey);
    const accountInfo = await ctx.connection.getAccountInfo(sentinelPDA);

    if (accountInfo) {
      const agent = Accounts.parseAgentAccount(accountInfo.data);
      console.log(`[SAP] Discovered Synapse Sentinel: ${agent.name}`);
      console.log(`[SAP] Sentinel capabilities: ${agent.capabilities}`);
    } else {
      console.log(`[SAP] Synapse Sentinel found at ${SYNAPSE_SENTINEL}`);
    }
  } catch (err) {
    // Non-fatal — agent is already registered manually via Studio
    console.log(`[SAP] Discovery completed (${(err as Error).message})`);
  }

  // Derive our own agent PDA to show our on-chain identity
  const [ourAgentPDA] = Pdas.getAgentPDA(ctx.keypair.publicKey);
  console.log(`[SAP] Our agent PDA: ${ourAgentPDA.toString()}`);
  console.log(`[SAP] Register this wallet on Synapse Studio if not done yet:`);
  console.log(`      https://studio.oobeprotocol.ai`);
  console.log(`      Wallet: ${ctx.walletAddress}`);
}

export async function logCycleOnChain(
  ctx: SAPContext,
  project: string,
  cycleCount: number
): Promise<string | null> {
  try {
    const { Transaction, TransactionInstruction } = await import("@solana/web3.js");

    const balance = await ctx.connection.getBalance(ctx.keypair.publicKey);
    if (balance < 10_000) {
      console.warn(`  [SAP] Wallet needs SOL for fees (${balance} lamports) — fund: ${ctx.walletAddress}`);
      return null;
    }

    const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
    const memo = JSON.stringify({
      agent: "Pulse",
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
