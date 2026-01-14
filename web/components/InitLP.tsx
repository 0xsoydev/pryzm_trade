"use client";

import { useAnchorProgram } from "@/src/hooks/useAnchorProgram"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js"
import { useState, useEffect, useCallback } from "react"
import { BN } from "@coral-xyz/anchor"
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { Button } from "./ui/button"
import { ChevronDown, Plus, RefreshCw, Info } from "lucide-react";
import { getTokenMetadata } from "@/lib/tokenMetadata";

interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
  icon?: string;
  usdValue?: number;
}

// Hook to fetch wallet tokens
function useWalletTokens() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTokens = useCallback(async () => {
    if (!publicKey || !connection) return;
    setLoading(true);

    try {
      // Get all SPL token accounts
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      });

      // Fetch metadata for all tokens in parallel
      const tokensWithMetadata = await Promise.all(
        tokenAccounts.value
          .filter(({ account }) => {
            const parsedInfo = account.data.parsed?.info;
            return parsedInfo && parsedInfo.tokenAmount.uiAmount > 0;
          })
          .map(async ({ account }) => {
            const parsedInfo = account.data.parsed?.info;
            const mintPubkey = new PublicKey(parsedInfo.mint);
            
            // Fetch metadata
            const metadata = await getTokenMetadata(connection, mintPubkey);
            
            return {
              mint: parsedInfo.mint,
              symbol: metadata?.symbol || parsedInfo.mint.slice(0, 4).toUpperCase(),
              name: metadata?.name || `Token ${parsedInfo.mint.slice(0, 6)}...`,
              balance: parsedInfo.tokenAmount.uiAmount,
              decimals: parsedInfo.tokenAmount.decimals,
            };
          })
      );

      setTokens(tokensWithMetadata);
    } catch (error) {
      console.error("Failed to fetch tokens:", error);
    } finally {
      setLoading(false);
    }
  }, [publicKey, connection]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  return { tokens, loading, refetch: fetchTokens };
}

// Token Selector Modal
function TokenSelector({
  isOpen,
  onClose,
  onSelect,
  tokens,
  selectedMint,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: TokenInfo) => void;
  tokens: TokenInfo[];
  selectedMint?: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl w-full max-w-md mx-4 max-h-[70vh] overflow-hidden shadow-xl">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Select a token</h3>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              ✕
            </button>
          </div>
          <input
            type="text"
            placeholder="Search by name or paste address"
            className="w-full mt-3 px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-[#F0926A]/50"
          />
        </div>
        <div className="overflow-y-auto max-h-80 p-2">
          {tokens.map((token) => (
            <button
              key={token.mint}
              onClick={() => {
                onSelect(token);
                onClose();
              }}
              className={`w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors ${
                selectedMint === token.mint ? "bg-[#F0926A]/20" : ""
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-linear-to-br from-[#F0926A] to-orange-600 flex items-center justify-center overflow-hidden text-white">
                {token.icon ? (
                  <img src={token.icon} alt={token.symbol} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-bold text-sm">{token.symbol.slice(0, 2)}</span>
                )}
              </div>
              <div className="flex-1 text-left">
                <p className="text-foreground font-medium">{token.symbol}</p>
                <p className="text-muted-foreground text-sm text-ellipsis overflow-hidden w-40">{token.name}</p>
              </div>
              <div className="text-right">
                 <p className="text-foreground">{token.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
                 {token.mint.slice(0, 4) !== "So11" && (
                   <p className="text-xs text-muted-foreground truncate w-24 ml-auto" title={token.mint}>
                     {token.mint.slice(0, 4)}...{token.mint.slice(-4)}
                   </p>
                 )}
              </div>
            </button>
          ))}
          {tokens.length === 0 && (
             <div className="p-4 text-center text-muted-foreground">
               No tokens found
             </div>
          )}
        </div>
      </div>
    </div>
  );
}

const InitLP = () => {
  const {program} = useAnchorProgram()
  const {publicKey, sendTransaction} = useWallet()
  const {connection} = useConnection();
  const { tokens, loading: tokensLoading, refetch } = useWalletTokens();

  const [tokenA, setTokenA] = useState<TokenInfo | null>(null);
  const [tokenB, setTokenB] = useState<TokenInfo | null>(null);
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSelectorA, setShowSelectorA] = useState(false);
  const [showSelectorB, setShowSelectorB] = useState(false);

  const handleMaxClickA = () => {
    if (tokenA) setAmountA(tokenA.balance.toString());
  };

  const handleHalfClickA = () => {
    if (tokenA) setAmountA((tokenA.balance / 2).toString());
  };

  const handleMaxClickB = () => {
    if (tokenB) setAmountB(tokenB.balance.toString());
  };

  const handleHalfClickB = () => {
    if (tokenB) setAmountB((tokenB.balance / 2).toString());
  };

  const handleInitialize = async () => {
    if(!publicKey || !program || !tokenA || !tokenB || !amountA || !amountB) return;
    setLoading(true);

    try {
      const mintAKey = new PublicKey(tokenA.mint);
      const mintBKey = new PublicKey(tokenB.mint);
      const amountABN = new BN(parseFloat(amountA) * Math.pow(10, tokenA.decimals));
      const amountBBN = new BN(parseFloat(amountB) * Math.pow(10, tokenB.decimals));

      const [minMint, maxMint] = mintAKey.toBuffer().compare(mintBKey.toBuffer()) < 0 
        ? [mintAKey, mintBKey] 
        : [mintBKey, mintAKey];

      const [initialAmountA, initialAmountB] = mintAKey.equals(minMint) 
        ? [amountABN, amountBBN] 
        : [amountBBN, amountABN];

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

      // Log derived addresses for debugging
      console.log("Pool:", poolAddress.toString());
      console.log("LP Mint:", lpMintAddress.toString());
      console.log("Vault A:", vaultA.toString());
      console.log("Vault B:", vaultB.toString());
      console.log("User Token A:", userTokenA.toString());
      console.log("User Token B:", userTokenB.toString());
      console.log("User LP Token:", userLpToken.toString());
      console.log("Amounts:", initialAmountA.toString(), initialAmountB.toString());

      const transaction = new Transaction();

      const initTx = await program.methods
        .initialize()
        .accounts({
          pool: poolAddress,
          tokenAMint: minMint,
          tokenBMint: maxMint,
          tokenAVault: vaultA,
          tokenBVault: vaultB,
          lpMint: lpMintAddress,
          payer: publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        }).instruction();
      transaction.add(initTx);

      const depositTx = await program.methods
        .deposit(initialAmountA, initialAmountB)
        .accounts({
          pool: poolAddress,
          tokenAMint: minMint,
          tokenBMint: maxMint,
          tokenAVault: vaultA,
          tokenBVault: vaultB,
          userTokenA: userTokenA,
          userTokenB: userTokenB,
          lpMint: lpMintAddress,
          userLpAccount: userLpToken,
          payer: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        }).instruction();
      transaction.add(depositTx);

      // Use program.provider.connection for consistency
      const signature = await sendTransaction(transaction, program.provider.connection);

      console.log("Initialization signature: ", signature);
      await program.provider.connection.confirmTransaction(signature, "confirmed");
      alert("Pool Initialized & Liquidity Added!");
      
      setAmountA("");
      setAmountB("");
      refetch();

    } catch (error: any) {
      console.error("Initializing Pool Failed: ", error);
      // Log more details
      if (error.logs) {
        console.error("Transaction logs:", error.logs);
      }
      if (error.message) {
        console.error("Error message:", error.message);
      }
      if (error.stack) {
        console.error("Error stack:", error.stack);
      }
      alert(`Failed to initialize pool: ${error.message || "See console for details"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[480px] mx-auto">
      <div className="bg-card rounded-3xl p-1 shadow-2xl shadow-black/10 border border-border/50">
        <div className="bg-background/50 rounded-3xl p-4">
          
          <div className="flex justify-between items-center mb-4 px-2">
            <h2 className="text-xl font-semibold text-foreground">Create Liquidity</h2>
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className="w-5 h-5" onClick={() => refetch()} />
            </button>
      </div>

          {/* Token A Section */}
          <div className="bg-card rounded-2xl p-4 mb-2 border border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted-foreground text-sm">Token A</span>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  Balance: {tokenA?.balance.toLocaleString(undefined, { maximumFractionDigits: 6 }) || "0"}
                </span>
                <button onClick={handleMaxClickA} className="text-[#F0926A] hover:text-[#e8845c] px-2 py-0.5 rounded bg-[#F0926A]/10 text-xs font-medium transition-colors">Max</button>
                <button onClick={handleHalfClickA} className="text-[#F0926A] hover:text-[#e8845c] px-2 py-0.5 rounded bg-[#F0926A]/10 text-xs font-medium transition-colors">50%</button>
              </div>
      </div>

            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => setShowSelectorA(true)}
                className="flex items-center gap-2 bg-background hover:bg-accent px-3 py-2 rounded-xl transition-colors min-w-[120px]"
              >
                <div className="w-6 h-6 rounded-full bg-linear-to-br from-[#F0926A] to-orange-600 flex items-center justify-center overflow-hidden text-white">
                  {tokenA?.icon ? (
                    <img src={tokenA.icon} alt={tokenA.symbol} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold">{tokenA?.symbol?.slice(0, 2) || "?"}</span>
                  )}
                </div>
                <span className="text-foreground font-semibold truncate max-w-[80px]">{tokenA?.symbol || "Select"}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />
              </button>
              
              <div className="flex-1 text-right">
        <input 
          type="number"
          value={amountA}
          onChange={(e) => setAmountA(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent text-foreground text-3xl font-semibold text-right focus:outline-none placeholder-muted-foreground/50"
        />
      </div>
            </div>
          </div>

          {/* Plus Icon */}
          <div className="flex justify-center -my-3 relative z-10">
            <div className="w-10 h-10 bg-card border-4 border-background rounded-xl flex items-center justify-center shadow-sm">
              <Plus className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>

          {/* Token B Section */}
          <div className="bg-card border border-border rounded-2xl p-4 mt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted-foreground text-sm">Token B</span>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  Balance: {tokenB?.balance.toLocaleString(undefined, { maximumFractionDigits: 6 }) || "0"}
                </span>
                <button onClick={handleMaxClickB} className="text-[#F0926A] hover:text-[#e8845c] px-2 py-0.5 rounded bg-[#F0926A]/10 text-xs font-medium transition-colors">Max</button>
                <button onClick={handleHalfClickB} className="text-[#F0926A] hover:text-[#e8845c] px-2 py-0.5 rounded bg-[#F0926A]/10 text-xs font-medium transition-colors">50%</button>
              </div>
            </div>
            
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => setShowSelectorB(true)}
                className="flex items-center gap-2 bg-background hover:bg-accent px-3 py-2 rounded-xl transition-colors min-w-[120px]"
              >
                <div className="w-6 h-6 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center overflow-hidden text-white">
                  {tokenB?.icon ? (
                    <img src={tokenB.icon} alt={tokenB.symbol} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold">{tokenB?.symbol?.slice(0, 2) || "?"}</span>
                  )}
                </div>
                <span className="text-foreground font-semibold truncate max-w-[80px]">{tokenB?.symbol || "Select"}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />
              </button>
              
              <div className="flex-1 text-right">
        <input 
          type="number"
          value={amountB}
          onChange={(e) => setAmountB(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent text-foreground text-3xl font-semibold text-right focus:outline-none placeholder-muted-foreground/50"
                />
              </div>
            </div>
          </div>

          {/* Info Panel */}
          <div className="mt-4 bg-card rounded-2xl p-4 space-y-3 border border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="w-4 h-4" />
              <p>Initial liquidity deposit will set the pool price.</p>
            </div>
      </div>

          <Button 
            onClick={handleInitialize} 
            disabled={loading || !publicKey || !tokenA || !tokenB || !amountA || !amountB} 
            className="w-full mt-4 h-14 bg-[#F0926A] hover:bg-[#e8845c] text-white font-semibold text-lg rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#F0926A]/20"
          >
            {loading ? "Creating Pool..." : "Initialize & Deposit"}
        </Button>

        </div>
      </div>

      <TokenSelector
        isOpen={showSelectorA}
        onClose={() => setShowSelectorA(false)}
        onSelect={setTokenA}
        tokens={tokens}
        selectedMint={tokenA?.mint}
      />
      <TokenSelector
        isOpen={showSelectorB}
        onClose={() => setShowSelectorB(false)}
        onSelect={setTokenB}
        tokens={tokens}
        selectedMint={tokenB?.mint}
      />
    </div>
  );
}

export default InitLP
