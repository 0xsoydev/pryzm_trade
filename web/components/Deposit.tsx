"use client";

import { useAnchorProgram } from "@/src/hooks/useAnchorProgram";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { useState, useEffect, useCallback } from "react";
import { BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Button } from "./ui/button";
import { RefreshCw, Plus, ArrowRight, Wallet, Info, Loader2, X, LayoutGrid, List, Minus } from "lucide-react";
import Link from "next/link";
import { getTokenMetadata } from "@/lib/tokenMetadata";

// --- Types ---

interface PoolInfo {
  address: PublicKey;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAVault: PublicKey;
  tokenBVault: PublicKey;
  lpMint: PublicKey;
  tokenAReserve: number;
  tokenBReserve: number;
  tokenASymbol: string;
  tokenBSymbol: string;
  lpSupply: number; // Add LP supply for calculations
}

interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
  icon?: string;
}

// --- Hooks ---

// Hook to fetch all existing pools
function useExistingPools() {
  const { program } = useAnchorProgram();
  const { connection } = useConnection();
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPools = useCallback(async () => {
    if (!program) return;
    setLoading(true);
    
    try {
      // 1. Fetch all LiquidityPool accounts
      const allPools = await program.account.liquidityPool.all();
      
      // 2. For each pool, fetch vault balances and metadata
      const enrichedPools = await Promise.all(
        allPools.map(async (pool) => {
          try {
            const vaultABalance = await connection.getTokenAccountBalance(pool.account.tokenAVault);
            const vaultBBalance = await connection.getTokenAccountBalance(pool.account.tokenBVault);
            const lpMintInfo = await connection.getTokenSupply(pool.account.lpMint);
            
            // Fetch metadata for both tokens
            const [tokenAMetadata, tokenBMetadata] = await Promise.all([
              getTokenMetadata(connection, pool.account.tokenAMint),
              getTokenMetadata(connection, pool.account.tokenBMint),
            ]);
            
            return {
              address: pool.publicKey,
              tokenAMint: pool.account.tokenAMint,
              tokenBMint: pool.account.tokenBMint,
              tokenAVault: pool.account.tokenAVault,
              tokenBVault: pool.account.tokenBVault,
              lpMint: pool.account.lpMint,
              tokenAReserve: vaultABalance.value.uiAmount || 0,
              tokenBReserve: vaultBBalance.value.uiAmount || 0,
              tokenASymbol: tokenAMetadata?.symbol || pool.account.tokenAMint.toString().slice(0,4).toUpperCase(),
              tokenBSymbol: tokenBMetadata?.symbol || pool.account.tokenBMint.toString().slice(0,4).toUpperCase(),
              lpSupply: lpMintInfo.value.uiAmount || 0,
            };
          } catch (e) {
            console.error("Error fetching vault balance for pool:", pool.publicKey.toString(), e);
            return null;
          }
        })
      );
      
      // Filter out failed pools
      setPools(enrichedPools.filter((p): p is PoolInfo => p !== null));
    } catch (e) {
      console.error("Error fetching pools:", e);
    } finally {
      setLoading(false);
    }
  }, [program, connection]);

  useEffect(() => { fetchPools(); }, [fetchPools]);

  return { pools, loading, refetch: fetchPools };
}

// Hook to fetch wallet tokens (reused from InitLP)
function useWalletTokens() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [tokens, setTokens] = useState<TokenInfo[]>([]);

  const fetchTokens = useCallback(async () => {
    if (!publicKey || !connection) return;

    try {
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
    }
  }, [publicKey, connection]);

  useEffect(() => { fetchTokens(); }, [fetchTokens]);

  return { tokens, refetch: fetchTokens };
}

// --- Components ---

function PoolCard({ pool, onDeposit, onWithdraw }: { pool: PoolInfo; onDeposit: () => void; onWithdraw: () => void }) {
  return (
    <div className="bg-card rounded-3xl p-6 border border-border shadow-lg hover:shadow-xl transition-all hover:border-[#F0926A]/50 group flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-3">
            <div className="w-10 h-10 rounded-full bg-linear-to-br from-[#F0926A] to-orange-600 flex items-center justify-center text-white text-xs font-bold ring-2 ring-card shadow-md">
              {pool.tokenASymbol.slice(0,2)}
            </div>
            <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold ring-2 ring-card shadow-md">
              {pool.tokenBSymbol.slice(0,2)}
            </div>
          </div>
          <div>
            <h3 className="font-bold text-lg text-foreground">{pool.tokenASymbol} / {pool.tokenBSymbol}</h3>
            <p className="text-xs text-muted-foreground font-mono truncate w-24 bg-accent/50 px-1.5 py-0.5 rounded-md">
              {pool.address.toString().slice(0,4)}...{pool.address.toString().slice(-4)}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-3 mb-6 bg-background/50 rounded-2xl p-4 border border-border/50 flex-grow">
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground font-medium">Pool Liquidity</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#F0926A]" />
            <span className="text-foreground font-medium">{pool.tokenAReserve.toLocaleString()} {pool.tokenASymbol}</span>
          </div>
        </div>
        <div className="flex justify-between items-center text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-foreground font-medium">{pool.tokenBReserve.toLocaleString()} {pool.tokenBSymbol}</span>
          </div>
        </div>
      </div>

      {/* Action */}
      <div className="grid grid-cols-2 gap-3 mt-auto">
        <Button 
          onClick={onDeposit} 
          className="bg-[#F0926A] hover:bg-[#e8845c] text-white rounded-xl shadow-lg shadow-[#F0926A]/20 transition-all"
        >
          Deposit
        </Button>
        <Button 
          onClick={onWithdraw} 
          variant="outline"
          className="rounded-xl border-border hover:bg-accent hover:text-accent-foreground transition-all"
        >
          Withdraw
        </Button>
      </div>
    </div>
  );
}

function PoolList({ pools, onDeposit, onWithdraw }: { pools: PoolInfo[]; onDeposit: (pool: PoolInfo) => void; onWithdraw: (pool: PoolInfo) => void }) {
  return (
    <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-lg">
      <div className="grid grid-cols-4 gap-4 px-6 py-4 bg-background/50 border-b border-border text-sm font-medium text-muted-foreground">
        <div className="col-span-2">Pool</div>
        <div>Liquidity</div>
        <div className="text-right">Action</div>
      </div>
      
      <div className="divide-y divide-border/50">
        {pools.map((pool) => (
          <div 
            key={pool.address.toString()} 
            className="grid grid-cols-4 gap-4 px-6 py-4 hover:bg-accent/50 transition-colors items-center"
          >
            {/* Pool Name */}
            <div className="col-span-2 flex items-center gap-3">
              <div className="flex -space-x-2 shrink-0">
                <div className="w-8 h-8 rounded-full bg-linear-to-br from-[#F0926A] to-orange-600 flex items-center justify-center text-white text-xs font-bold ring-2 ring-card shadow-sm">
                  {pool.tokenASymbol.slice(0,2)}
                </div>
                <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold ring-2 ring-card shadow-sm">
                  {pool.tokenBSymbol.slice(0,2)}
                </div>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground truncate">{pool.tokenASymbol} / {pool.tokenBSymbol}</p>
                <p className="text-xs text-muted-foreground font-mono truncate bg-accent/50 px-1.5 py-0.5 rounded-md inline-block mt-1">
                  {pool.address.toString().slice(0,4)}...{pool.address.toString().slice(-4)}
                </p>
              </div>
            </div>
            
            {/* Liquidity */}
            <div className="text-sm space-y-1">
              <p className="text-foreground truncate font-medium">{pool.tokenAReserve.toLocaleString()} {pool.tokenASymbol}</p>
              <p className="text-muted-foreground truncate">{pool.tokenBReserve.toLocaleString()} {pool.tokenBSymbol}</p>
            </div>
            
            {/* Action */}
            <div className="text-right flex justify-end gap-2">
              <Button 
                onClick={() => onDeposit(pool)}
                size="sm"
                className="bg-[#F0926A] hover:bg-[#e8845c] text-white rounded-lg shadow-sm"
              >
                Deposit
              </Button>
              <Button 
                onClick={() => onWithdraw(pool)}
                size="sm"
                variant="outline"
                className="rounded-lg border-border hover:bg-accent"
              >
                Withdraw
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DepositModal({ isOpen, onClose, pool, onSuccess }: { isOpen: boolean; onClose: () => void; pool: PoolInfo | null; onSuccess: () => void }) {
  const { program } = useAnchorProgram();
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { tokens } = useWalletTokens();
  
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [loading, setLoading] = useState(false);

  // Find user's token info if available
  const userTokenA = tokens.find(t => t.mint === pool?.tokenAMint.toString());
  const userTokenB = tokens.find(t => t.mint === pool?.tokenBMint.toString());

  const handleMaxA = () => {
    if (userTokenA) setAmountA(userTokenA.balance.toString());
  };

  const handleMaxB = () => {
    if (userTokenB) setAmountB(userTokenB.balance.toString());
  };

  const handleDeposit = async () => {
    if (!pool || !publicKey || !program || !amountA || !amountB) return;
    setLoading(true);

    try {
      const amountABN = new BN(parseFloat(amountA) * 1_000_000); // Assuming 6 decimals for simplicity/demo
      const amountBBN = new BN(parseFloat(amountB) * 1_000_000);

      const userTokenAAddr = await getAssociatedTokenAddress(pool.tokenAMint, publicKey);
      const userTokenBAddr = await getAssociatedTokenAddress(pool.tokenBMint, publicKey);
      const userLpTokenAddr = await getAssociatedTokenAddress(pool.lpMint, publicKey);

      const transaction = new Transaction();

      const depositTx = await program.methods
        .deposit(amountABN, amountBBN)
        .accounts({
          pool: pool.address,
          tokenAMint: pool.tokenAMint,
          tokenBMint: pool.tokenBMint,
          tokenAVault: pool.tokenAVault,
          tokenBVault: pool.tokenBVault,
          userTokenA: userTokenAAddr,
          userTokenB: userTokenBAddr,
          lpMint: pool.lpMint,
          userLpAccount: userLpTokenAddr,
          payer: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        }).instruction();
      
      transaction.add(depositTx);

      const signature = await sendTransaction(transaction, program.provider.connection);
      await program.provider.connection.confirmTransaction(signature, "confirmed");
      
      alert("Liquidity Deposited Successfully!");
      setAmountA("");
      setAmountB("");
      onSuccess();
      
    } catch (error: any) {
      console.error("Deposit Failed:", error);
      alert(`Deposit failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !pool) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative w-full max-w-[480px] animate-in zoom-in-95 duration-200">
        <div className="bg-card rounded-3xl p-1 shadow-2xl shadow-black/20 border border-border/50">
          <div className="bg-background/50 rounded-3xl p-4">
            
            {/* Header */}
            <div className="flex justify-between items-center mb-6 px-2">
              <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#F0926A]" />
                Deposit Liquidity
              </h3>
              <button 
                onClick={onClose} 
                className="text-muted-foreground hover:text-foreground transition-colors p-2 hover:bg-accent rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pool Info Badge */}
            <div className="mb-4 px-2">
              <div className="inline-flex items-center gap-2 bg-accent/50 px-3 py-1.5 rounded-full text-sm border border-border/50">
                <span className="font-semibold text-foreground">{pool.tokenASymbol}/{pool.tokenBSymbol}</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground font-mono text-xs">
                  {pool.address.toString().slice(0, 4)}...{pool.address.toString().slice(-4)}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {/* Token A Input */}
              <div className="bg-card rounded-2xl p-4 border border-border/50 hover:border-border transition-colors group">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-linear-to-br from-[#F0926A] to-orange-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-[#F0926A]/20">
                      {pool.tokenASymbol.charAt(0)}
                    </div>
                    <span className="font-semibold text-foreground">{pool.tokenASymbol}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Wallet className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{userTokenA?.balance.toLocaleString() || "0"}</span>
                    <button 
                      onClick={handleMaxA} 
                      className="text-[#F0926A] font-medium hover:text-[#e8845c] transition-colors px-2 py-0.5 rounded-lg hover:bg-[#F0926A]/10"
                    >
                      Max
                    </button>
                  </div>
                </div>
                <input 
                  type="number" 
                  value={amountA}
                  onChange={(e) => setAmountA(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent text-3xl font-semibold outline-none placeholder-muted-foreground/30 focus:placeholder-muted-foreground/50 transition-colors"
                />
                <div className="text-xs text-muted-foreground mt-2 pl-1">
                  Pool reserve: {pool.tokenAReserve.toLocaleString()} {pool.tokenASymbol}
                </div>
              </div>

              {/* Plus Divider */}
              <div className="flex justify-center -my-3 relative z-10">
                <div className="w-10 h-10 bg-card border-4 border-background rounded-xl flex items-center justify-center shadow-sm">
                  <Plus className="w-5 h-5 text-muted-foreground" />
                </div>
              </div>

              {/* Token B Input */}
              <div className="bg-card rounded-2xl p-4 border border-border/50 hover:border-border transition-colors group">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-500/20">
                      {pool.tokenBSymbol.charAt(0)}
                    </div>
                    <span className="font-semibold text-foreground">{pool.tokenBSymbol}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Wallet className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{userTokenB?.balance.toLocaleString() || "0"}</span>
                    <button 
                      onClick={handleMaxB} 
                      className="text-[#F0926A] font-medium hover:text-[#e8845c] transition-colors px-2 py-0.5 rounded-lg hover:bg-[#F0926A]/10"
                    >
                      Max
                    </button>
                  </div>
                </div>
                <input 
                  type="number" 
                  value={amountB}
                  onChange={(e) => setAmountB(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent text-3xl font-semibold outline-none placeholder-muted-foreground/30 focus:placeholder-muted-foreground/50 transition-colors"
                />
                <div className="text-xs text-muted-foreground mt-2 pl-1">
                  Pool reserve: {pool.tokenBReserve.toLocaleString()} {pool.tokenBSymbol}
                </div>
              </div>

              {/* Info Panel */}
              <div className="bg-accent/30 rounded-xl p-3 flex gap-3 border border-border/30">
                <Info className="w-5 h-5 shrink-0 text-[#F0926A] mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <p>You will receive LP tokens representing your share of the pool.</p>
                  <p className="text-xs mt-1 text-muted-foreground/70">Trading fee: 0.3%</p>
                </div>
              </div>

              {/* Deposit Button */}
              <Button 
                onClick={handleDeposit} 
                disabled={loading || !amountA || !amountB}
                className="w-full h-14 bg-[#F0926A] hover:bg-[#e8845c] text-white rounded-2xl text-lg font-semibold shadow-lg shadow-[#F0926A]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirm Deposit"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WithdrawModal({ isOpen, onClose, pool, onSuccess }: { isOpen: boolean; onClose: () => void; pool: PoolInfo | null; onSuccess: () => void }) {
  const { program } = useAnchorProgram();
  const { publicKey, sendTransaction } = useWallet();
  const { tokens } = useWalletTokens();
  
  const [amountLP, setAmountLP] = useState("");
  const [loading, setLoading] = useState(false);

  // User's LP token balance
  const userLpToken = tokens.find(t => t.mint === pool?.lpMint.toString());

  // Estimates
  const estimatedAmountA = pool && amountLP 
    ? (parseFloat(amountLP) * pool.tokenAReserve) / (pool.lpSupply || 1)
    : 0;
  const estimatedAmountB = pool && amountLP 
    ? (parseFloat(amountLP) * pool.tokenBReserve) / (pool.lpSupply || 1)
    : 0;

  const handleMaxLP = () => {
    if (userLpToken) setAmountLP(userLpToken.balance.toString());
  };

  const handleWithdraw = async () => {
    if (!pool || !publicKey || !program || !amountLP) return;
    setLoading(true);

    try {
      // Assuming 6 decimals for LP token
      const lpTokensIn = new BN(parseFloat(amountLP) * 1_000_000);

      const userTokenAAddr = await getAssociatedTokenAddress(pool.tokenAMint, publicKey);
      const userTokenBAddr = await getAssociatedTokenAddress(pool.tokenBMint, publicKey);
      const userLpTokenAddr = await getAssociatedTokenAddress(pool.lpMint, publicKey);

      const transaction = new Transaction();

      const withdrawTx = await program.methods
        .withdraw(lpTokensIn)
        .accounts({
          pool: pool.address,
          tokenAMint: pool.tokenAMint,
          tokenBMint: pool.tokenBMint,
          tokenAVault: pool.tokenAVault,
          tokenBVault: pool.tokenBVault,
          userTokenA: userTokenAAddr,
          userTokenB: userTokenBAddr,
          lpMint: pool.lpMint,
          userLpAccount: userLpTokenAddr,
          payer: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        }).instruction();
      
      transaction.add(withdrawTx);

      const signature = await sendTransaction(transaction, program.provider.connection);
      await program.provider.connection.confirmTransaction(signature, "confirmed");
      
      alert("Liquidity Withdrawn Successfully!");
      setAmountLP("");
      onSuccess();
      
    } catch (error: any) {
      console.error("Withdraw Failed:", error);
      alert(`Withdraw failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !pool) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-[480px] animate-in zoom-in-95 duration-200">
        <div className="bg-card rounded-3xl p-1 shadow-2xl shadow-black/20 border border-border/50">
          <div className="bg-background/50 rounded-3xl p-4">
            
            {/* Header */}
            <div className="flex justify-between items-center mb-6 px-2">
              <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">
                <Minus className="w-5 h-5 text-[#F0926A]" />
                Withdraw Liquidity
              </h3>
              <button 
                onClick={onClose} 
                className="text-muted-foreground hover:text-foreground transition-colors p-2 hover:bg-accent rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pool Info Badge */}
            <div className="mb-4 px-2">
              <div className="inline-flex items-center gap-2 bg-accent/50 px-3 py-1.5 rounded-full text-sm border border-border/50">
                <span className="font-semibold text-foreground">{pool.tokenASymbol}/{pool.tokenBSymbol}</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground font-mono text-xs">
                  {pool.address.toString().slice(0, 4)}...{pool.address.toString().slice(-4)}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {/* LP Token Input */}
              <div className="bg-card rounded-2xl p-4 border border-border/50 hover:border-border transition-colors group">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-purple-500/20">
                      LP
                    </div>
                    <span className="font-semibold text-foreground">LP Tokens</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Wallet className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{userLpToken?.balance.toLocaleString() || "0"}</span>
                    <button 
                      onClick={handleMaxLP} 
                      className="text-[#F0926A] font-medium hover:text-[#e8845c] transition-colors px-2 py-0.5 rounded-lg hover:bg-[#F0926A]/10"
                    >
                      Max
                    </button>
                  </div>
                </div>
                <input 
                  type="number" 
                  value={amountLP}
                  onChange={(e) => setAmountLP(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent text-3xl font-semibold outline-none placeholder-muted-foreground/30 focus:placeholder-muted-foreground/50 transition-colors"
                />
              </div>

              {/* Estimate Output */}
              <div className="bg-accent/30 rounded-xl p-4 border border-border/30 space-y-2">
                <p className="text-sm font-medium text-muted-foreground mb-2">You will receive (estimated):</p>
                <div className="flex justify-between items-center">
                  <span className="text-foreground">{estimatedAmountA.toLocaleString(undefined, {maximumFractionDigits: 6})} {pool.tokenASymbol}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-foreground">{estimatedAmountB.toLocaleString(undefined, {maximumFractionDigits: 6})} {pool.tokenBSymbol}</span>
                </div>
              </div>

              <Button 
                onClick={handleWithdraw} 
                disabled={loading || !amountLP}
                className="w-full h-14 bg-[#F0926A] hover:bg-[#e8845c] text-white rounded-2xl text-lg font-semibold shadow-lg shadow-[#F0926A]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirm Withdraw"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main Page Component ---

const Deposit = () => {
  const { pools, loading, refetch } = useExistingPools();
  const [selectedPool, setSelectedPool] = useState<PoolInfo | null>(null);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  const openDepositModal = (pool: PoolInfo) => {
    setSelectedPool(pool);
    setIsDepositModalOpen(true);
  };

  const openWithdrawModal = (pool: PoolInfo) => {
    setSelectedPool(pool);
    setIsWithdrawModalOpen(true);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* Page Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Liquidity Pools</h1>
          <p className="text-muted-foreground">Provide liquidity to earn trading fees.</p>
        </div>
        <div className="flex gap-4 items-center">
            
            {/* View Toggle */}
            <div className="bg-card border border-border rounded-xl p-1 flex gap-1 h-10 items-center">
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            <Button variant="outline" size="icon" onClick={() => refetch()} className="rounded-xl h-10 w-10">
                <RefreshCw className="w-5 h-5" />
            </Button>
            <Link href="/init-lp">
                <Button className="bg-[#F0926A] hover:bg-[#e8845c] text-white rounded-xl shadow-lg shadow-[#F0926A]/20">
                    <Plus className="w-5 h-5 mr-2" />
                    Create Pool
                </Button>
            </Link>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-10 h-10 text-[#F0926A] animate-spin" />
        </div>
      ) : pools.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-3xl border border-border border-dashed">
          <Wallet className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No active pools found</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            There are no liquidity pools active on the platform yet. Be the first to create one!
          </p>
          <Link href="/init-lp">
            <Button className="bg-[#F0926A] hover:bg-[#e8845c] text-white rounded-xl">
              Initialize Liquidity Pool
            </Button>
          </Link>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pools.map((pool) => (
            <PoolCard 
              key={pool.address.toString()} 
              pool={pool} 
              onDeposit={() => openDepositModal(pool)}
              onWithdraw={() => openWithdrawModal(pool)}
            />
          ))}
        </div>
      ) : (
        <PoolList 
          pools={pools} 
          onDeposit={openDepositModal}
          onWithdraw={openWithdrawModal}
        />
      )}

      {/* Deposit Modal */}
      <DepositModal
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        pool={selectedPool}
        onSuccess={() => { refetch(); setIsDepositModalOpen(false); }}
      />

      {/* Withdraw Modal */}
      <WithdrawModal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        pool={selectedPool}
        onSuccess={() => { refetch(); setIsWithdrawModalOpen(false); }}
      />
    </div>
  );
};

export default Deposit;
