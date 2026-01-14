"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useState, useMemo } from "react";
import { 
  createUmi,
} from "@metaplex-foundation/umi-bundle-defaults";
import {
  fromWeb3JsPublicKey,
  fromWeb3JsTransaction,
  toWeb3JsTransaction,
} from "@metaplex-foundation/umi-web3js-adapters";
import { 
  createFungible,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { generateSigner, percentAmount, some, signerIdentity } from "@metaplex-foundation/umi";
import { Button } from "./ui/button";
import { Coins, Copy, Check, Info, RefreshCw } from "lucide-react";

const CreateToken = () => {
  const {connection} = useConnection();
  const wallet = useWallet();

  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [initialSupply, setInitialSupply] = useState("");
  const [decimals, setDecimals] = useState("6");
  const [loading, setLoading] = useState(false);
  const [createdMint, setCreatedMint] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Create UMI instance with wallet adapter signer
  const umi = useMemo(() => {
    if (!connection || !wallet.publicKey) return null;

    const umiInstance = createUmi(connection.rpcEndpoint).use(mplTokenMetadata());

    // Create a custom signer from the wallet adapter
    const walletSigner = {
      publicKey: fromWeb3JsPublicKey(wallet.publicKey),
      signMessage: wallet.signMessage ? async (message: Uint8Array) => {
        // Keep as Uint8Array, don't convert to Buffer
        const signed = await wallet.signMessage!(message);
        return signed;
      } : undefined,
      signTransaction: wallet.signTransaction ? async (transaction: any) => {
        const web3Tx = toWeb3JsTransaction(transaction);
        const signed = await wallet.signTransaction!(web3Tx);
        // Convert back to UMI transaction format
        return fromWeb3JsTransaction(signed);
      } : undefined,
      signAllTransactions: wallet.signAllTransactions ? async (transactions: any[]) => {
        const web3Txs = transactions.map(tx => toWeb3JsTransaction(tx));
        const signed = await wallet.signAllTransactions!(web3Txs);
        // Convert back to UMI transaction format
        return signed.map(tx => fromWeb3JsTransaction(tx));
      } : undefined,
    };

    umiInstance.use(signerIdentity(walletSigner as any));
    return umiInstance;
  }, [connection, wallet]);

  const handleCreateToken = async () => {
    if(!wallet.publicKey || !umi) return;
    setLoading(true);
    setCreatedMint(null);

    try {
      // Generate a new signer for the mint
      const mint = generateSigner(umi);

      // Create the fungible token with metadata
      await createFungible(umi, {
        mint,
        name: tokenName || "My Token",
        symbol: tokenSymbol || "TKN",
        uri: "", // Optional: metadata URI
        sellerFeeBasisPoints: percentAmount(0),
        decimals: some(parseInt(decimals)),
      }).sendAndConfirm(umi);

      console.log("Created mint: ", mint.publicKey.toString());
      setCreatedMint(mint.publicKey.toString());

      // If initial supply is provided, mint tokens to user's wallet
      if (initialSupply && parseFloat(initialSupply) > 0 && wallet.sendTransaction) {
        const amount = BigInt(Math.floor(parseFloat(initialSupply) * Math.pow(10, parseInt(decimals))));
        
        // Convert mint public key back to Web3.js format for SPL token functions
        const mintPublicKey = new PublicKey(mint.publicKey.toString());
        
        // Get associated token address
        const associatedTokenAddress = await getAssociatedTokenAddress(
          mintPublicKey,
          wallet.publicKey
        );

        // Build transaction
        const transaction = new Transaction();

        // Check if token account exists, if not create it
        try {
          await getAccount(connection, associatedTokenAddress);
        } catch (error) {
          // Account doesn't exist, create it
          const createATAInstruction = createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            associatedTokenAddress,
            wallet.publicKey,
            mintPublicKey
          );
          transaction.add(createATAInstruction);
        }

        // Create mint to instruction
        const mintToInstruction = createMintToInstruction(
          mintPublicKey,
          associatedTokenAddress,
          wallet.publicKey, // mint authority
          amount
        );
        transaction.add(mintToInstruction);

        // Send transaction
        const signature = await wallet.sendTransaction(transaction, connection);
        await connection.confirmTransaction(signature, 'confirmed');

        console.log(`Minted ${initialSupply} tokens to wallet`);
      }

    } catch (error) {
      console.error("Token Creation Failed: ", error);
      alert("Token creation failed. Check console.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setTokenName("");
    setTokenSymbol("");
    setInitialSupply("");
    setDecimals("6");
    setCreatedMint(null);
  };

  return (
    <div className="w-full max-w-[480px] mx-auto">
      <div className="bg-card rounded-3xl p-1 shadow-2xl shadow-black/10 border border-border/50">
        <div className="bg-background/50 rounded-3xl p-4">
          
          <div className="flex justify-between items-center mb-6 px-2">
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Coins className="w-5 h-5 text-[#F0926A]" />
              Create Token
            </h2>
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className="w-5 h-5" onClick={handleReset} />
            </button>
          </div>

          <div className="space-y-4">
            
            {/* Token Name Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground ml-1">Token Name</label>
              <div className="bg-card rounded-xl p-3 border border-border focus-within:border-[#F0926A]/50 transition-colors">
        <input 
          type="text"
          value={tokenName}
          onChange={(e) => setTokenName(e.target.value)}
                  placeholder="e.g. Solana"
                  className="w-full bg-transparent text-foreground placeholder-muted-foreground/50 focus:outline-none"
        />
              </div>
      </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Symbol Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground ml-1">Symbol</label>
                <div className="bg-card rounded-xl p-3 border border-border focus-within:border-[#F0926A]/50 transition-colors">
        <input 
          type="text"
          value={tokenSymbol}
          onChange={(e) => setTokenSymbol(e.target.value)}
                    placeholder="e.g. SOL"
                    className="w-full bg-transparent text-foreground placeholder-muted-foreground/50 focus:outline-none uppercase"
        />
                </div>
      </div>

              {/* Decimals Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground ml-1">Decimals</label>
                <div className="bg-card rounded-xl p-3 border border-border focus-within:border-[#F0926A]/50 transition-colors">
        <input 
          type="number"
          value={decimals}
          onChange={(e) => setDecimals(e.target.value)}
          placeholder="6"
                    className="w-full bg-transparent text-foreground placeholder-muted-foreground/50 focus:outline-none"
        />
                </div>
              </div>
      </div>

            {/* Initial Supply Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground ml-1">Initial Supply</label>
              <div className="bg-card rounded-xl p-3 border border-border focus-within:border-[#F0926A]/50 transition-colors">
        <input 
          type="number"
          value={initialSupply}
          onChange={(e) => setInitialSupply(e.target.value)}
                  placeholder="e.g. 1000000"
                  className="w-full bg-transparent text-foreground placeholder-muted-foreground/50 focus:outline-none"
                />
              </div>
            </div>

            {/* Info Panel */}
            <div className="bg-card rounded-2xl p-4 border border-border flex gap-3">
              <Info className="w-5 h-5 text-[#F0926A] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm text-foreground font-medium">Standard SPL Token</p>
                <p className="text-xs text-muted-foreground">
                  Creates a standard SPL token with metadata on Solana. Initial supply will be minted to your wallet.
                </p>
              </div>
      </div>

      <Button 
        onClick={handleCreateToken} 
              disabled={loading || !wallet.publicKey || !umi || !tokenName || !tokenSymbol} 
              className="w-full h-14 bg-[#F0926A] hover:bg-[#e8845c] text-white font-semibold text-lg rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#F0926A]/20"
            >
              {loading ? (
          <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating...
                </div>
              ) : (
                "Create Token"
              )}
            </Button>

            {/* Success State */}
            {createdMint && (
              <div className="mt-4 bg-green-500/10 border border-green-500/20 rounded-2xl p-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Check className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Token Created!</p>
                    <p className="text-xs text-green-500/80">Minted {initialSupply} {tokenSymbol}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 bg-background/50 rounded-xl p-2 border border-border/50">
                  <code className="text-xs text-muted-foreground flex-1 truncate font-mono ml-1">
                    {createdMint}
                  </code>
                  <button
                    onClick={() => copyToClipboard(createdMint)}
                    className="p-1.5 hover:bg-background rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

export default CreateToken;
