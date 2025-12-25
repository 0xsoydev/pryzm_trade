use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

declare_id!("3bRk2JnVyZBfDMWtFXuJW6U4dakFzsWWzqWurbdsjcBX");

#[program]
pub mod amm_dex_capstone {

    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        pool.bump = ctx.bumps.pool;
        pool.fees = 30;

        pool.token_a_mint = ctx.accounts.token_a_mint.key();
        pool.token_b_mint = ctx.accounts.token_b_mint.key();

        pool.token_a_vault = ctx.accounts.token_a_vault.key();
        pool.token_b_vault = ctx.accounts.token_b_vault.key();

        pool.lp_mint = ctx.accounts.lp_mint.key();

        msg!("Pool Initialized!");
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount_a: u64, amount_b: u64) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        let lp_mint = &ctx.accounts.lp_mint;
        let token_a_vault = &ctx.accounts.token_a_vault;
        let token_b_vault = &ctx.accounts.token_b_vault;

        //----------------------------------------------
        // Moving Token A from User's Wallet to Vault A
        //----------------------------------------------

        let accounts_a = anchor_spl::token::Transfer {
            from: ctx.accounts.user_token_a.to_account_info(),
            to: ctx.accounts.token_a_vault.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };

        //----------------------------------------------
        // Moving Token B from User's Wallet to Vault B
        //----------------------------------------------

        let accounts_b = anchor_spl::token::Transfer {
            from: ctx.accounts.user_token_b.to_account_info(),
            to: ctx.accounts.token_b_vault.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };

        //-------------------------------------------------
        // CPI Invocation for Actual Transfer to take place
        //-------------------------------------------------

        let cpi_ctx_a = CpiContext::new(ctx.accounts.token_program.to_account_info(), accounts_a);
        let cpi_ctx_b = CpiContext::new(ctx.accounts.token_program.to_account_info(), accounts_b);

        anchor_spl::token::transfer(cpi_ctx_a, amount_a)?;
        anchor_spl::token::transfer(cpi_ctx_b, amount_b)?;

        //-------------------------------------
        // Calculating the Amount of LP Tokens
        //-------------------------------------

        let amount_to_mint = if lp_mint.supply == 0 {
            (amount_a as u128)
                .checked_mul(amount_b as u128)
                .unwrap()
                .isqrt() as u64
        } else {
            let amount_a_share = (amount_a as u128)
                .checked_mul(lp_mint.supply as u128)
                .unwrap()
                .checked_div(token_a_vault.amount as u128)
                .unwrap();

            let amount_b_share = (amount_b as u128)
                .checked_mul(lp_mint.supply as u128)
                .unwrap()
                .checked_div(token_b_vault.amount as u128)
                .unwrap();

            std::cmp::min(amount_a_share, amount_b_share) as u64
        };

        //----------------------------
        // Defining the Signer Seeds
        //----------------------------
        let seeds = &[
            b"pool",
            ctx.accounts.token_a_mint.to_account_info().key.as_ref(),
            ctx.accounts.token_b_mint.to_account_info().key.as_ref(),
            &[pool.bump],
        ];

        let signer_seeds = &[&seeds[..]]; // List of Signers

        //--------------------------------------------
        // CPI Call to mint the LP Tokens to the User
        //--------------------------------------------
        let mint_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::MintTo {
                mint: ctx.accounts.lp_mint.to_account_info(),
                to: ctx.accounts.user_lp_account.to_account_info(),
                authority: pool.to_account_info(),
            },
            signer_seeds,
        );

        //----------------------------------------------------------------------------------------
        // The actual token minting takes place here which makes use of mint_ctx for minting info
        //----------------------------------------------------------------------------------------
        anchor_spl::token::mint_to(mint_ctx, amount_to_mint)?;

        msg!(
            "Deposited {} Tokens in Vault A, {} Tokens in Vault B, Minted {} LP Tokens",
            amount_a,
            amount_b,
            amount_to_mint
        );
        Ok(())
    }

    pub fn swap(ctx: Context<Swap>, amount_in: u64, is_token_a: bool) -> Result<()> {
        let (input_token, output_token, input_vault, output_vault) = if is_token_a {
            (
                &ctx.accounts.user_token_a,
                &ctx.accounts.user_token_b,
                &ctx.accounts.token_a_vault,
                &ctx.accounts.token_b_vault,
            )
        } else {
            (
                &ctx.accounts.user_token_b,
                &ctx.accounts.user_token_a,
                &ctx.accounts.token_b_vault,
                &ctx.accounts.token_a_vault,
            )
        };

        let transfer_input_accounts = anchor_spl::token::Transfer {
            from: input_token.to_account_info(),
            to: input_vault.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };

        let amount_in_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_input_accounts,
        );

        anchor_spl::token::transfer(amount_in_ctx, amount_in)?;

        let new_input_vault_balance = (input_vault.amount as u128)
            .checked_add(amount_in as u128)
            .unwrap();
        let k = (input_vault.amount as u128)
            .checked_mul(output_vault.amount as u128)
            .unwrap();

        let new_output_vault_balance = k.checked_div(new_input_vault_balance).unwrap();

        let amount_out = (output_vault.amount as u128)
            .checked_sub(new_output_vault_balance)
            .unwrap();

        let transfer_output_accounts = anchor_spl::token::Transfer {
            from: output_vault.to_account_info(),
            to: ctx.accounts.payer.to_account_info(),
            authority: ctx.accounts.pool.to_account_info(),
        };

        let seeds = &[
            b"pool",
            ctx.accounts.token_a_mint.to_account_info().key.as_ref(),
            ctx.accounts.token_b_mint.to_account_info().key.as_ref(),
            &[ctx.accounts.pool.bump],
        ];

        let signer_seeds = &[&seeds[..]];

        let amount_out_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_output_accounts,
            signer_seeds,
        );

        anchor_spl::token::transfer(amount_out_ctx, amount_out.try_into().unwrap())?;
        Ok(())
    }
}

#[account]
pub struct LiquidityPool {
    pub token_a_mint: Pubkey,
    pub token_b_mint: Pubkey,
    pub token_a_vault: Pubkey,
    pub token_b_vault: Pubkey,
    pub lp_mint: Pubkey,
    pub fees: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 32 + 32 + 32 + 8 + 1,
        seeds = [b"pool", token_a_mint.key().as_ref(), token_b_mint.key().as_ref()],
        bump,
    )]
    pub pool: Account<'info, LiquidityPool>,

    pub token_a_mint: Account<'info, Mint>,
    pub token_b_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = pool,
        seeds = [b"lp_mint", pool.key().as_ref()],
        bump,
    )]
    pub lp_mint: Account<'info, Mint>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        token::mint = token_a_mint,
        token::authority = pool,
        seeds = [b"vault_a", pool.key().as_ref()],
        bump,
    )]
    pub token_a_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = payer,
        token::mint = token_b_mint,
        token::authority = pool,
        seeds = [b"vault_b", pool.key().as_ref()],
        bump,
    )]
    pub token_b_vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        seeds = [b"pool", token_a_mint.key().as_ref(), token_b_mint.key().as_ref()],
        bump = pool.bump,
        has_one = token_a_mint,
        has_one = token_b_mint,
        has_one = lp_mint,
    )]
    pub pool: Account<'info, LiquidityPool>,

    #[account(
        mut,
        seeds = [b"vault_a", pool.key().as_ref()],
        bump,
        token::mint = token_a_mint,
        token::authority = pool,
    )]
    pub token_a_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"vault_b", pool.key().as_ref()],
        bump,
        token::mint = token_b_mint,
        token::authority = pool,
    )]
    pub token_b_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"lp_mint", pool.key().as_ref()],
        bump,
    )]
    pub lp_mint: Account<'info, Mint>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        associated_token::mint = token_a_mint,
        associated_token::authority = payer,
    )]
    pub user_token_a: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = token_b_mint,
        associated_token::authority = payer,
    )]
    pub user_token_b: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = lp_mint,
        associated_token::authority = payer,
    )]
    pub user_lp_account: Account<'info, TokenAccount>,

    pub token_a_mint: Account<'info, Mint>,
    pub token_b_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(
        seeds = [b"pool", token_a_mint.key().as_ref(), token_b_mint.key().as_ref()],
        bump = pool.bump,
        has_one = token_a_mint,
        has_one = token_b_mint,
    )]
    pub pool: Account<'info, LiquidityPool>,

    #[account(
        mut,
        seeds = [b"vault_a", pool.key().as_ref()],
        bump,
        token::mint = token_a_mint,
        token::authority = pool,
    )]
    pub token_a_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"vault_b", pool.key().as_ref()],
        bump,
        token::mint = token_b_mint,
        token::authority = pool,
    )]
    pub token_b_vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = token_a_mint,
        associated_token::authority = payer,
    )]
    pub user_token_a: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = token_b_mint,
        associated_token::authority = payer,
    )]
    pub user_token_b: Account<'info, TokenAccount>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_a_mint: Account<'info, Mint>,
    pub token_b_mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}
