"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ThemeToggle } from "./ThemeToggle";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

const Navbar = () => {
  return (
    <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] md:w-[60%]">
      <div className="flex items-center justify-between px-6 py-3 bg-card/80 backdrop-blur-md rounded-full border border-border shadow-2xl shadow-black/20 w-full">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold text-foreground">
            Turbin3
          </Link>
          
          <div className="hidden md:flex items-center gap-6">
              <Link 
              href="/swap" 
              className="text-muted-foreground hover:text-foreground transition-colors font-medium text-sm"
              >
              Swap
              </Link>
              <Link 
              href="/deposit" 
              className="text-muted-foreground hover:text-foreground transition-colors font-medium text-sm"
              >
              Pools
              </Link>
              <Link 
              href="/init-lp" 
              className="text-muted-foreground hover:text-foreground transition-colors font-medium text-sm"
              >
              Liquidity
              </Link>
              <Link 
              href="/create-token" 
              className="text-muted-foreground hover:text-foreground transition-colors font-medium text-sm"
              >
              Create Token
      </Link>
          </div>
        </div>

      <div className="flex items-center gap-4">
          <div className="hidden md:block w-px h-6 bg-border" />
          <ThemeToggle />
          <div className="wallet-button-wrapper">
        <WalletMultiButton />
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
