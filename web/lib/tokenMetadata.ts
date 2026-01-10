import { Connection, PublicKey } from "@solana/web3.js";

const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export interface TokenMetadata {
  name: string | null;
  symbol: string | null;
  uri: string | null;
}

/**
 * Fetches Metaplex token metadata for a given mint address
 */
export async function getTokenMetadata(
  connection: Connection,
  mintAddress: PublicKey
): Promise<TokenMetadata | null> {
  try {
    // Derive metadata PDA
    const [metadataPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        METADATA_PROGRAM_ID.toBuffer(),
        mintAddress.toBuffer(),
      ],
      METADATA_PROGRAM_ID
    );

    const accountInfo = await connection.getAccountInfo(metadataPDA);
    if (!accountInfo) {
      return null;
    }

    const data = accountInfo.data;

    // Metaplex Token Metadata v1.1.0 structure:
    // - Key (1 byte)
    // - Update Authority (32 bytes)
    // - Mint (32 bytes)
    // - Data struct:
    //   - Name (4 bytes length + string, max 32 bytes)
    //   - Symbol (4 bytes length + string, max 10 bytes)
    //   - URI (4 bytes length + string, max 200 bytes)
    //   - Seller Fee Basis Points (2 bytes)
    //   - Creators (optional, 4 bytes + array)

    let offset = 1 + 32 + 32; // Skip key, update authority, mint

    // Read name
    const nameLength = data.readUInt32LE(offset);
    offset += 4;
    const nameBytes = data.slice(offset, offset + nameLength);
    const name = nameBytes.toString('utf8').replace(/\0/g, '').trim() || null;
    offset += 32; // Name is max 32 bytes

    // Read symbol
    const symbolLength = data.readUInt32LE(offset);
    offset += 4;
    const symbolBytes = data.slice(offset, offset + symbolLength);
    const symbol = symbolBytes.toString('utf8').replace(/\0/g, '').trim() || null;
    offset += 10; // Symbol is max 10 bytes

    // Read URI
    const uriLength = data.readUInt32LE(offset);
    offset += 4;
    const uriBytes = data.slice(offset, offset + uriLength);
    const uri = uriBytes.toString('utf8').replace(/\0/g, '').trim() || null;

    return { name, symbol, uri };
  } catch (error) {
    console.error("Failed to fetch metadata for", mintAddress.toString(), error);
    return null;
  }
}
