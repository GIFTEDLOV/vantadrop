/**
 * Deploy VantaDropRegistry.
 *
 * This deploys ONLY the optional public-metadata registry — it does not touch
 * TokenOps, does not create or fund any confidential airdrop, and does not deploy
 * anything beyond this one thin contract. See docs/research/registry-decision.md
 * for what this contract is and is not.
 *
 * Run with: npx hardhat run scripts/deployRegistry.ts --network <network>
 * (defaults to Hardhat's in-memory simulated network if --network is omitted)
 */
import { network } from "hardhat";

const { viem } = await network.create();

const registry = await viem.deployContract("VantaDropRegistry");

console.log("VantaDropRegistry deployed to:", registry.address);
