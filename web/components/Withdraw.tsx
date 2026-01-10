"use client";

import { useAnchorProgram } from "@/src/hooks/useAnchorProgram"
import { useWallet } from "@solana/wallet-adapter-react"
import { PublicKey, SystemProgram } from "@solana/web3.js"
import { useState } from "react"
import {BN} from "@coral-xyz/anchor"
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { Button } from "./ui/button"

const Withdraw = () => {
  const {program} = useAnchorProgram()
  const {publicKey} = useWallet()

  const [mintA, setMintA] = useState("");
  const [mintB, setMintB] = useState("");
  const [lpTokenAmount, setLpTokenAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const handleWithdraw = async () => {
    if(!publicKey || !program || !mintA || !mintB || !lpTokenAmount) return;
    setLoading(true);

    try {
      const mintAKey = new PublicKey(mintA);
      const mintBKey = new PublicKey(mintB);
      const lpTokensBN = new BN(parseFloat(lpTokenAmount) * 1_000_000);

      const [minMint, maxMint] = mintAKey.toBuffer().compare(mintBKey.toBuffer()) < 0 
        ? [mintAKey, mintBKey] 
        : [mintBKey, mintAKey];

      const [poolAddress] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), minMint.toBuffer(), maxMint.toBuffer()],
        program.programId
      );

      const [lpMintAddress] = PublicKey.findProgramAddressSync(
        [Buffer.from("lp_mint"), poolAddress.toBuffer()],
        program.programId
      )

      const [vaultA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_a"), poolAddress.toBuffer()],
        program.programId
      )

      const [vaultB] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_b"), poolAddress.toBuffer()],
        program.programId
      )

      const userTokenA = await getAssociatedTokenAddress(minMint, publicKey);
      const userTokenB = await getAssociatedTokenAddress(maxMint, publicKey);
      const userLpToken = await getAssociatedTokenAddress(lpMintAddress, publicKey);

      console.log("Pool Address: ", poolAddress.toString());
      console.log("LP Mint: ", lpMintAddress.toString())
      console.log("Withdrawing LP tokens: ", lpTokenAmount);

      const tx = await program.methods
        .withdraw(lpTokensBN)
        .accounts({
          pool: poolAddress,
          tokenAMint: minMint,
          tokenBMint: maxMint,
          tokenAVault: vaultA,
          tokenBVault: vaultB,
          lpMint: lpMintAddress,
          userTokenA: userTokenA,
          userTokenB: userTokenB,
          userLpAccount: userLpToken,
          payer: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        }).rpc();

      console.log("Withdraw signature: ", tx);

    } catch (error) {
      console.error("Withdraw Failed: ", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4 w-full max-w-md mx-auto p-4">
      <h2 className="text-2xl font-bold">Withdraw Liquidity</h2>
      
      <div className="w-full">
        <input 
          type="text"
          value={mintA}
          onChange={(e) => setMintA(e.target.value)}
          placeholder="Token A Mint Address"
          className="w-full border rounded p-2"
        />
      </div>

      <div className="w-full">
        <input 
          type="text"
          value={mintB}
          onChange={(e) => setMintB(e.target.value)}
          placeholder="Token B Mint Address"
          className="w-full border rounded p-2"
        />
      </div>

      <div className="w-full">
        <input 
          type="number"
          value={lpTokenAmount}
          onChange={(e) => setLpTokenAmount(e.target.value)}
          placeholder="LP Token Amount to Withdraw"
          className="w-full border rounded p-2"
        />
      </div>

      <div className="w-full">
        <Button onClick={handleWithdraw} disabled={loading || !publicKey} className="w-full">
          {loading ? "Withdrawing..." : "Withdraw"}
        </Button>
      </div>
    </div>
  );
}

export default Withdraw
