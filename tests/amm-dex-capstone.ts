import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AmmDexCapstone } from "../target/types/amm_dex_capstone";
import { PublicKey } from "@solana/web3.js";
import { 
  createMint, 
  getAssociatedTokenAddressSync, 
  getOrCreateAssociatedTokenAccount, 
  mintTo,
  programSupportsExtensions,
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

    await mintTo(provider.connection, provider.wallet.payer, mintA, userTokenA, provider.wallet.payer, 1_000_000_000_000);
    await mintTo(provider.connection, provider.wallet.payer, mintB, userTokenB, provider.wallet.payer, 1_000_000_000_000);
    
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
      })
      .rpc();

    console.log("Initialization Transaction Signature:", tx);
  });

  it("Deposit Liquidity", async () => {
    const amountA = new anchor.BN(100_000_000_000);
    const amountB = new anchor.BN(100_000_000_000);

    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, lpMint, provider.wallet.publicKey);

    const tx = await program.methods.deposit(amountA, amountB).accounts({
      pool: poolAddress,
      tokenAVault: vaultA,
      tokenBVault: vaultB,
      lpMint: lpMint,
      payer: provider.wallet.publicKey,
      userTokenA: userTokenA,
      userTokenB: userTokenB,
      userLpAccount: userLpToken,
    }).rpc();

    console.log("Deposit Tx: ", tx);

    const vaultABalance = await provider.connection.getTokenAccountBalance(vaultA);
    console.log("Vault A Balance: ", vaultABalance);

    const vaultBBalance = await provider.connection.getTokenAccountBalance(vaultB);
    console.log("Vault B Balance: ", vaultBBalance);

    const userLpBalance = await provider.connection.getTokenAccountBalance(userLpToken);
    console.log("User LP Account Balance: ", userLpBalance);
  });

  it("Test Swap", async () => {
    const amountIn = new anchor.BN(100_000_000);
    const isTokenA = true;

    const userA_Before = (await provider.connection.getTokenAccountBalance(userTokenA)).value.amount;
    const userB_Before = (await provider.connection.getTokenAccountBalance(userTokenB)).value.amount;

    console.log("User tokenA Before: ", userA_Before);
    console.log("User tokenB Before: ", userB_Before);

    const tx = await program.methods.swap(amountIn, isTokenA).accounts({
      pool: poolAddress,
      tokenAVault: vaultA,
      tokenBVault: vaultB,
      userTokenA: userTokenA,
      userTokenB: userTokenB,
      payer: provider.wallet.publicKey,
      tokenAMint: mintA,
      tokenBMint: mintB,
    }).rpc();

    console.log("Swap Tx:", tx);

    const userA_After = (await provider.connection.getTokenAccountBalance(userTokenA)).value.amount;
    const userB_After = (await provider.connection.getTokenAccountBalance(userTokenB)).value.amount;

    console.log("User tokenA After: ", userA_After);
    console.log("User tokenB After: ", userB_After);

    const sentA = new anchor.BN(userA_Before).sub(new anchor.BN(userA_After));
    const recvB = new anchor.BN(userB_After).sub(new anchor.BN(userB_Before));

    console.log("User Sent (A): ", sentA.toString());
    console.log("User Recieved (B): ", recvB.toString());

    const slippage = ((new anchor.BN(sentA).sub(new anchor.BN(recvB))).mul(new anchor.BN(100_000_000))).div(new anchor.BN(sentA));
    console.log("Slippage: ", slippage.toNumber() / 1_000_000, "%");
    
  });

  it("Withdraw Test", async () => {
    const userA_Before = (await provider.connection.getTokenAccountBalance(userTokenA)).value.amount;
    const userB_Before = (await provider.connection.getTokenAccountBalance(userTokenB)).value.amount;
    
    const lpTokensIn = await provider.connection.getTokenAccountBalance(userLpToken);
    const amountToBurn = new anchor.BN(lpTokensIn.value.amount);

    console.log("Burning LP Tokens: ", amountToBurn.toString());

    const tx = await program.methods.withdraw(amountToBurn).accounts({
      pool: poolAddress,
      tokenAVault: vaultA,
      tokenBVault: vaultB,
      userTokenA: userTokenA,
      userTokenB: userTokenB,
      lpMint: lpMint,
      userLpAccount: userLpToken,
      payer: provider.wallet.publicKey,
      tokenAMint: mintA,
      tokenBMint: mintB,
    }).rpc();

    console.log("Withdraw Transaction: ", tx);
    
    const userA_After = (await provider.connection.getTokenAccountBalance(userTokenA)).value.amount;
    const userB_After = (await provider.connection.getTokenAccountBalance(userTokenB)).value.amount;

    const vaultA_balance = (await provider.connection.getTokenAccountBalance(vaultA)).value.amount;
    const vaultB_balance = (await provider.connection.getTokenAccountBalance(vaultB)).value.amount;

    console.log("Vault A Balance: ", vaultA_balance);
    console.log("Vault B Balance: ", vaultB_balance);

    console.log("User tokenA Balance: ", userA_After);
    console.log("User tokenB Balance: ", userB_After);
    
  })

});
