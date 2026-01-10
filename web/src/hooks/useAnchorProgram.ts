import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useMemo } from "react";
import idl from "../idl/amm_dex_capstone.json";

const PROGRAM_ID = new PublicKey("3bRk2JnVyZBfDMWtFXuJW6U4dakFzsWWzqWurbdsjcBX");

export function useAnchorProgram() {
  const wallet = useAnchorWallet();
  const {connection} = useConnection();

  const provider = useMemo(() => {
    if (!wallet) return null;
  
  return new AnchorProvider(connection, wallet, {
      preflightCommitment: 'confirmed',
    })
  }, [connection, wallet]);

  const program = useMemo(() => {
    if (!provider) return null;

  return new Program(idl, provider);
  }, [provider])

  return {program};
}
