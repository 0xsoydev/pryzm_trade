"use client";

import { useAnchorProgram } from "@/src/hooks/useAnchorProgram";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { useState, useEffect, useCallback } from "react";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Button } from "./ui/button";
import { ChevronDown, ArrowDown, RefreshCw, Info } from "lucide-react";
import { SystemProgram } from "@solana/web3.js";
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

      const tokenList: TokenInfo[] = [];

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

const Swap = () => {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const { program } = useAnchorProgram();
  const { tokens, loading: tokensLoading, refetch } = useWalletTokens();

  const [fromToken, setFromToken] = useState<TokenInfo | null>(null);
  const [toToken, setToToken] = useState<TokenInfo | null>(null);
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [showFromSelector, setShowFromSelector] = useState(false);
  const [showToSelector, setShowToSelector] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [priceImpact, setPriceImpact] = useState<number>(0);
  const [slippage] = useState(0.5);

  // Calculate output amount based on constant product formula
  const calculateSwapOutput = useCallback(async () => {
    if (!fromToken || !toToken || !fromAmount || !program || !connection) {
        if (!fromAmount) setToAmount("");
        return;
    }

    try {
      const inputAmount = parseFloat(fromAmount);
      if (isNaN(inputAmount) || inputAmount <= 0) {
        setToAmount("");
        return;
      }

      const mintA = new PublicKey(fromToken.mint);
      const mintB = new PublicKey(toToken.mint);

      // Sort mints to find the correct pool address
      const [minMint, maxMint] = mintA.toBuffer().compare(mintB.toBuffer()) < 0 
        ? [mintA, mintB] 
        : [mintB, mintA];

      const [poolAddress] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), minMint.toBuffer(), maxMint.toBuffer()],
        program.programId
      );

      const [vaultA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_a"), poolAddress.toBuffer()],
        program.programId
      );

      const [vaultB] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_b"), poolAddress.toBuffer()],
        program.programId
      );

      // Fetch vault balances
      const vaultABalance = await connection.getTokenAccountBalance(vaultA);
      const vaultBBalance = await connection.getTokenAccountBalance(vaultB);

      const reserveA = vaultABalance.value.uiAmount || 0;
      const reserveB = vaultBBalance.value.uiAmount || 0;

      // Determine which reserve is input/output based on mint order
      // If mintA < mintB: pool has token_a (minMint) and token_b (maxMint).
      // vaultA holds minMint, vaultB holds maxMint.
      
      // If we are swapping FROM mintA TO mintB:
      // If mintA == minMint: we are inputting into vaultA, outputting from vaultB.
      // inputReserve = reserveA, outputReserve = reserveB.
      
      const isSellingMinMint = mintA.equals(minMint);
      const [inputReserve, outputReserve] = isSellingMinMint 
        ? [reserveA, reserveB] 
        : [reserveB, reserveA];

      if (inputReserve === 0 || outputReserve === 0) {
          console.warn("One of the reserves is empty");
          setToAmount("0");
          setExchangeRate(0);
          return;
      }

      // x * y = k formula with 0.3% fee
      // (inputReserve + inputWithFee) * (outputReserve - outputAmount) = k = inputReserve * outputReserve
      // outputAmount = outputReserve - (inputReserve * outputReserve) / (inputReserve + inputWithFee)
      //              = outputReserve * (1 - inputReserve / (inputReserve + inputWithFee))
      //              = outputReserve * (inputWithFee / (inputReserve + inputWithFee))
      
      const fee = 0.003;
      const inputWithFee = inputAmount * (1 - fee);
      const outputAmount = (outputReserve * inputWithFee) / (inputReserve + inputWithFee);
      
      setToAmount(outputAmount.toFixed(toToken.decimals));
      setExchangeRate(outputAmount / inputAmount);
      
      // Calculate price impact
      // impact = (market_price - execution_price) / market_price
      // market_price = outputReserve / inputReserve
      // execution_price = outputAmount / inputAmount
      const marketPrice = outputReserve / inputReserve;
      const executionPrice = outputAmount / inputAmount;
      const impact = ((marketPrice - executionPrice) / marketPrice) * 100;
      
      setPriceImpact(Math.max(0, Math.min(impact, 99.99)));
      
    } catch (error) {
      console.log("Pool not found or error calculating:", error);
      // Don't clear toAmount immediately on error to prevent flickering, but maybe indicate error
      // For now, if pool doesn't exist, we can't swap
      setToAmount("0");
      setExchangeRate(null);
    }
  }, [fromToken, toToken, fromAmount, program, connection]);

  useEffect(() => {
    const timer = setTimeout(calculateSwapOutput, 500); // Debounce
    return () => clearTimeout(timer);
  }, [calculateSwapOutput]);

  const handleSwapTokens = () => {
    const tempToken = fromToken;
    setFromToken(toToken);
    setToToken(tempToken);
    // Don't swap amounts directly as rates might change, let effect recalculate
    setFromAmount(toAmount); 
  };

  const handleMaxClick = () => {
    if (fromToken) {
      setFromAmount(fromToken.balance.toString());
    }
  };

  const handleHalfClick = () => {
    if (fromToken) {
      setFromAmount((fromToken.balance / 2).toString());
    }
  };

  const handleSwap = async () => {
    if (!publicKey || !program || !fromToken || !toToken || !fromAmount) return;
    setLoading(true);

    try {
      const mintAKey = new PublicKey(fromToken.mint);
      const mintBKey = new PublicKey(toToken.mint);
      const amountBN = new BN(Math.floor(parseFloat(fromAmount) * Math.pow(10, fromToken.decimals)));

      const [minMint, maxMint] = mintAKey.toBuffer().compare(mintBKey.toBuffer()) < 0 
        ? [mintAKey, mintBKey] 
        : [mintBKey, mintAKey];

      const isSellingTokenA = mintAKey.equals(minMint);
      
      const [poolAddress] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), minMint.toBuffer(), maxMint.toBuffer()],
        program.programId
      );

      const userTokenA = await getAssociatedTokenAddress(minMint, publicKey);
      const userTokenB = await getAssociatedTokenAddress(maxMint, publicKey);

      const [vaultA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_a"), poolAddress.toBuffer()],
        program.programId
      );

      const [vaultB] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_b"), poolAddress.toBuffer()],
        program.programId
      );

      const tx = await program.methods.swap(amountBN, isSellingTokenA).accounts({
        pool: poolAddress,
        tokenAVault: vaultA,
        tokenBVault: vaultB,
        userTokenA: userTokenA,
        userTokenB: userTokenB,
        tokenAMint: minMint,
        tokenBMint: maxMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();

      console.log("Swap Tx:", tx);
      await connection.confirmTransaction(tx, "confirmed");
      refetch();
      setFromAmount("");
      setToAmount("");
      alert("Swap successful!");
    } catch (error) {
      console.error("Swap Failed:", error);
      alert("Swap failed. See console for details.");
    } finally {
      setLoading(false);
    }
  };

  const minimumReceived = toAmount && toToken
    ? (parseFloat(toAmount) * (1 - slippage / 100)).toFixed(toToken.decimals)
    : "0";

  return (
    <div className="w-full max-w-[480px] mx-auto">
      {/* Main Swap Card */}
      <div className="bg-card rounded-3xl p-1 shadow-2xl shadow-black/10 border border-border/50">
        <div className="bg-background/50 rounded-3xl p-4">
          
          <div className="flex justify-between items-center mb-4 px-2">
              <h2 className="text-xl font-semibold text-foreground">Swap</h2>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <RefreshCw className="w-5 h-5" onClick={() => refetch()} />
              </button>
          </div>

          {/* From Section */}
          <div className="bg-card rounded-2xl p-4 mb-2 border border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted-foreground text-sm">From</span>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  Balance: {fromToken?.balance.toLocaleString(undefined, { maximumFractionDigits: 6 }) || "0"}
                </span>
                <button onClick={handleMaxClick} className="text-[#F0926A] hover:text-[#e8845c] px-2 py-0.5 rounded bg-[#F0926A]/10 text-xs font-medium transition-colors">
                  Max
                </button>
                <button onClick={handleHalfClick} className="text-[#F0926A] hover:text-[#e8845c] px-2 py-0.5 rounded bg-[#F0926A]/10 text-xs font-medium transition-colors">
                  50%
                </button>
              </div>
            </div>
            
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => setShowFromSelector(true)}
                className="flex items-center gap-2 bg-background hover:bg-accent px-3 py-2 rounded-xl transition-colors min-w-[120px]"
              >
                <div className="w-6 h-6 rounded-full bg-linear-to-br from-[#F0926A] to-orange-600 flex items-center justify-center overflow-hidden text-white">
                  {fromToken?.icon ? (
                    <img src={fromToken.icon} alt={fromToken.symbol} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold">{fromToken?.symbol?.slice(0, 2) || "?"}</span>
                  )}
                </div>
                <span className="text-foreground font-semibold truncate max-w-[80px]">{fromToken?.symbol || "Select"}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />
              </button>
              
              <div className="flex-1 text-right">
                <input
                  type="number"
                  value={fromAmount}
                  onChange={(e) => setFromAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent text-foreground text-3xl font-semibold text-right focus:outline-none placeholder-muted-foreground/50"
                />
              </div>
            </div>
          </div>

          {/* Swap Direction Button */}
          <div className="flex justify-center -my-3 relative z-10">
            <button
              onClick={handleSwapTokens}
              className="w-10 h-10 bg-card border-4 border-background rounded-xl flex items-center justify-center hover:bg-accent transition-colors group shadow-sm"
            >
              <ArrowDown className="w-5 h-5 text-muted-foreground group-hover:text-[#F0926A] transition-colors" />
            </button>
          </div>

          {/* To Section */}
          <div className="bg-card border border-border rounded-2xl p-4 mt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted-foreground text-sm">To</span>
              <div className="flex items-center gap-2 text-sm">
                 <span className="text-muted-foreground">
                  Balance: {toToken?.balance.toLocaleString(undefined, { maximumFractionDigits: 6 }) || "0"}
                </span>
              </div>
            </div>
            
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => setShowToSelector(true)}
                className="flex items-center gap-2 bg-background hover:bg-accent px-3 py-2 rounded-xl transition-colors min-w-[120px]"
              >
                <div className="w-6 h-6 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center overflow-hidden text-white">
                  {toToken?.icon ? (
                    <img src={toToken.icon} alt={toToken.symbol} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold">{toToken?.symbol?.slice(0, 2) || "?"}</span>
                  )}
                </div>
                <span className="text-foreground font-semibold truncate max-w-[80px]">{toToken?.symbol || "Select"}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />
              </button>
              
              <div className="flex-1 text-right">
                <input
                  type="text"
                  value={toAmount}
                  readOnly
                  placeholder="0.00"
                  className="w-full bg-transparent text-foreground text-3xl font-semibold text-right focus:outline-none placeholder-muted-foreground/50 cursor-default"
                />
              </div>
            </div>
          </div>

          {/* Swap Info Panel */}
          {fromToken && toToken && exchangeRate !== null && exchangeRate > 0 && (
            <div className="mt-4 bg-card rounded-2xl p-4 space-y-3 border border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">
                    1 {fromToken.symbol} ≈ {exchangeRate.toFixed(6)} {toToken.symbol}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span>Minimum Received</span>
                  <Info className="w-3 h-3" />
                </div>
                <span className="text-foreground">{minimumReceived} {toToken.symbol}</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span>Price Impact</span>
                  <Info className="w-3 h-3" />
                </div>
                <span className={`${priceImpact > 5 ? 'text-destructive' : priceImpact > 1 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {priceImpact < 0.01 ? '<0.01' : priceImpact.toFixed(2)}%
                </span>
              </div>
            </div>
          )}

          {/* Swap Button */}
          <Button
            onClick={handleSwap}
            disabled={loading || !publicKey || !fromToken || !toToken || !fromAmount}
            className="w-full mt-4 h-14 bg-[#F0926A] hover:bg-[#e8845c] text-white font-semibold text-lg rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#F0926A]/20"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Swapping...
              </div>
            ) : !publicKey ? (
              "Connect Wallet"
            ) : !fromToken || !toToken ? (
              "Select Tokens"
            ) : !fromAmount ? (
              "Enter Amount"
            ) : (
              "Swap"
            )}
          </Button>
        </div>
      </div>

      {/* Token Selectors */}
      <TokenSelector
        isOpen={showFromSelector}
        onClose={() => setShowFromSelector(false)}
        onSelect={setFromToken}
        tokens={tokens}
        selectedMint={fromToken?.mint}
      />
      <TokenSelector
        isOpen={showToSelector}
        onClose={() => setShowToSelector(false)}
        onSelect={setToToken}
        tokens={tokens}
        selectedMint={toToken?.mint}
      />
    </div>
  );
};

export default Swap;
