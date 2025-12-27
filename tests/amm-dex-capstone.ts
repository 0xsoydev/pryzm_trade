import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AmmDexCapstone } from "../target/types/amm_dex_capstone";
import { PublicKey } from "@solana/web3.js";
import { 
  createMint, 
  getAssociatedTokenAddressSync, 
  getOrCreateAssociatedTokenAccount, 
  mintTo,
  TOKEN_PROGRAM_ID 
} from "@solana/spl-token";

describe("amm-dex-capstone", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AmmDexCapstone as Program<AmmDexCapstone>;

  let mintA: PublicKey;
  let mintB: PublicKey;

  let poolAddress: PublicKey;
  let poolBump: number;
  let vaultA: PublicKey;
  let vaultB: PublicKey;
  let lpMint: PublicKey;

  let userTokenA: PublicKey;
  let userTokenB: PublicKey;
  let userLpToken: PublicKey;

  before(async () => {
    mintA = await createMint(provider.connection, provider.wallet.payer, provider.wallet.publicKey, null, 6);
    mintB = await createMint(provider.connection, provider.wallet.payer, provider.wallet.publicKey, null, 6);

    if (mintA.toBuffer().compare(mintB.toBuffer()) > 0) {
      [mintA, mintB] = [mintB, mintA];
      console.log("Swapped mints to enforce canonical order");
    }

    [poolAddress, poolBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool"),
        mintA.toBuffer(),
        mintB.toBuffer(),
      ],
      program.programId
    );

    [vaultA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault_a"),
        poolAddress.toBuffer(),
      ],
      program.programId
    );

    [vaultB] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault_b"),
        poolAddress.toBuffer(),
      ],
      program.programId
    );

    [lpMint] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("lp_mint"),
        poolAddress.toBuffer(),
      ],
      program.programId
    );

    userTokenA = getAssociatedTokenAddressSync(mintA, provider.wallet.publicKey);
    userTokenB = getAssociatedTokenAddressSync(mintB, provider.wallet.publicKey);
    userLpToken = getAssociatedTokenAddressSync(lpMint, provider.wallet.publicKey);

    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mintA, provider.wallet.publicKey);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mintB, provider.wallet.publicKey);

    await mintTo(provider.connection, provider.wallet.payer, mintA, userTokenA, provider.wallet.payer, 1_000_000_000);
    await mintTo(provider.connection, provider.wallet.payer, mintB, userTokenB, provider.wallet.payer, 1_000_000_000);
    
    console.log("Setup complete. Mints created and sorted.");
  });

  it("Is initialized!", async () => {
    const tx = await program.methods
      .initialize()
      .accounts({
        pool: poolAddress,
        tokenAMint: mintA,
        tokenBMint: mintB,
        tokenAVault: vaultA,
        tokenBVault: vaultB,
        lpMint: lpMint,
        payer: provider.wallet.publicKey,
        
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
      
    console.log("Initialization Transaction Signature:", tx);
  });

});
