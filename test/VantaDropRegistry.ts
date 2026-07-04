import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { getAddress, zeroAddress } from "viem";

describe("VantaDropRegistry", async function () {
  const { viem } = await network.create();

  async function deployRegistry() {
    return viem.deployContract("VantaDropRegistry");
  }

  const sampleArgs = [
    "0x1111111111111111111111111111111111111111", // token
    "0x2222222222222222222222222222222222222222", // tokenOpsAirdrop
    "Genesis investor round", // title
    "Investor distribution", // useCase
    5n, // recipientCount
    "ipfs://example", // metadataURI
  ] as const;

  it("registerDistribution stores correct public metadata", async function () {
    const registry = await deployRegistry();
    const [sender] = await viem.getWalletClients();

    await registry.write.registerDistribution(sampleArgs);

    const d = await registry.read.getDistribution([1n]);
    assert.equal(d.id, 1n);
    assert.equal(getAddress(d.sender), getAddress(sender.account.address));
    assert.equal(getAddress(d.token), getAddress(sampleArgs[0]));
    assert.equal(getAddress(d.tokenOpsAirdrop), getAddress(sampleArgs[1]));
    assert.equal(d.title, sampleArgs[2]);
    assert.equal(d.useCase, sampleArgs[3]);
    assert.equal(d.recipientCount, sampleArgs[4]);
    assert.equal(d.status, 0);
    assert.equal(d.metadataURI, sampleArgs[5]);
    assert.ok(d.createdAt > 0n);
  });

  it("emits DistributionRegistered", async function () {
    const registry = await deployRegistry();
    const [sender] = await viem.getWalletClients();

    await viem.assertions.emitWithArgs(
      registry.write.registerDistribution(sampleArgs),
      registry,
      "DistributionRegistered",
      [
        1n,
        getAddress(sender.account.address),
        getAddress(sampleArgs[0]),
        getAddress(sampleArgs[1]),
        sampleArgs[2],
        sampleArgs[3],
        sampleArgs[4],
      ],
    );
  });

  it("totalDistributions increments", async function () {
    const registry = await deployRegistry();

    assert.equal(await registry.read.totalDistributions(), 0n);
    await registry.write.registerDistribution(sampleArgs);
    assert.equal(await registry.read.totalDistributions(), 1n);
    await registry.write.registerDistribution(sampleArgs);
    assert.equal(await registry.read.totalDistributions(), 2n);
  });

  it("getSenderDistributions returns ids for sender", async function () {
    const registry = await deployRegistry();
    const [sender] = await viem.getWalletClients();

    await registry.write.registerDistribution(sampleArgs);
    await registry.write.registerDistribution(sampleArgs);

    const ids = await registry.read.getSenderDistributions([sender.account.address]);
    assert.deepEqual(ids, [1n, 2n]);
  });

  it("multiple senders are isolated", async function () {
    const registry = await deployRegistry();
    const [senderA, senderB] = await viem.getWalletClients();

    await registry.write.registerDistribution(sampleArgs, { account: senderA.account });
    await registry.write.registerDistribution(sampleArgs, { account: senderB.account });
    await registry.write.registerDistribution(sampleArgs, { account: senderB.account });

    const idsA = await registry.read.getSenderDistributions([senderA.account.address]);
    const idsB = await registry.read.getSenderDistributions([senderB.account.address]);
    assert.deepEqual(idsA, [1n]);
    assert.deepEqual(idsB, [2n, 3n]);

    const distA = await registry.read.getDistribution([1n]);
    assert.equal(getAddress(distA.sender), getAddress(senderA.account.address));
  });

  it("updateStatus works for original sender", async function () {
    const registry = await deployRegistry();
    const [sender] = await viem.getWalletClients();

    await registry.write.registerDistribution(sampleArgs, { account: sender.account });
    await registry.write.updateStatus([1n, 2], { account: sender.account });

    const d = await registry.read.getDistribution([1n]);
    assert.equal(d.status, 2);
  });

  it("updateStatus rejects non-sender", async function () {
    const registry = await deployRegistry();
    const [senderA, senderB] = await viem.getWalletClients();

    await registry.write.registerDistribution(sampleArgs, { account: senderA.account });

    await viem.assertions.revertWithCustomError(
      registry.write.updateStatus([1n, 2], { account: senderB.account }),
      registry,
      "NotOriginalSender",
    );
  });

  it("rejects zero token", async function () {
    const registry = await deployRegistry();

    await viem.assertions.revertWithCustomError(
      registry.write.registerDistribution([
        zeroAddress,
        sampleArgs[1],
        sampleArgs[2],
        sampleArgs[3],
        sampleArgs[4],
        sampleArgs[5],
      ]),
      registry,
      "ZeroAddress",
    );
  });

  it("rejects zero tokenOpsAirdrop", async function () {
    const registry = await deployRegistry();

    await viem.assertions.revertWithCustomError(
      registry.write.registerDistribution([
        sampleArgs[0],
        zeroAddress,
        sampleArgs[2],
        sampleArgs[3],
        sampleArgs[4],
        sampleArgs[5],
      ]),
      registry,
      "ZeroAddress",
    );
  });

  it("rejects empty title", async function () {
    const registry = await deployRegistry();

    await viem.assertions.revertWithCustomError(
      registry.write.registerDistribution([
        sampleArgs[0],
        sampleArgs[1],
        "",
        sampleArgs[3],
        sampleArgs[4],
        sampleArgs[5],
      ]),
      registry,
      "EmptyTitle",
    );
  });

  it("rejects empty useCase", async function () {
    const registry = await deployRegistry();

    await viem.assertions.revertWithCustomError(
      registry.write.registerDistribution([
        sampleArgs[0],
        sampleArgs[1],
        sampleArgs[2],
        "",
        sampleArgs[4],
        sampleArgs[5],
      ]),
      registry,
      "EmptyUseCase",
    );
  });

  it("rejects zero recipientCount", async function () {
    const registry = await deployRegistry();

    await viem.assertions.revertWithCustomError(
      registry.write.registerDistribution([
        sampleArgs[0],
        sampleArgs[1],
        sampleArgs[2],
        sampleArgs[3],
        0n,
        sampleArgs[5],
      ]),
      registry,
      "InvalidRecipientCount",
    );
  });

  it("getDistribution rejects nonexistent id", async function () {
    const registry = await deployRegistry();

    await viem.assertions.revertWithCustomError(
      registry.read.getDistribution([999n]),
      registry,
      "DistributionNotFound",
    );
  });

  it("confirms there is no function or field for recipient lists or allocation amounts", async function () {
    const registry = await deployRegistry();

    // Structural privacy check: assert the ABI itself has no shape that could hold a
    // recipient list or an allocation amount. This is a codified version of the
    // privacy rule documented in VantaDropRegistry.sol's contract-level comment —
    // if this test ever fails, someone added exactly the kind of field this
    // contract must never have.
    const abi = registry.abi;
    const forbiddenNamePattern = /recipient(list|s|address(es)?)|allocation|amount|claimsignature|encryptedhandle/i;

    const functionNames = abi
      .filter((item): item is Extract<typeof item, { type: "function" }> => item.type === "function")
      .map((item) => item.name);
    for (const name of functionNames) {
      assert.ok(
        !forbiddenNamePattern.test(name),
        `function "${name}" looks like it could hold recipient/allocation data — not allowed in this registry`,
      );
    }

    const distributionStruct = abi.find(
      (item): item is Extract<typeof item, { type: "function"; name: "getDistribution" }> =>
        item.type === "function" && item.name === "getDistribution",
    );
    assert.ok(distributionStruct, "getDistribution not found in ABI");
    const structFields = (distributionStruct.outputs?.[0] as { components?: { name: string }[] })?.components ?? [];
    const fieldNames = structFields.map((c) => c.name);

    assert.deepEqual(
      fieldNames.sort(),
      [
        "id",
        "sender",
        "token",
        "tokenOpsAirdrop",
        "title",
        "useCase",
        "recipientCount",
        "createdAt",
        "status",
        "metadataURI",
      ].sort(),
      "Distribution struct fields changed — verify no recipient-list or allocation-amount field was added",
    );
    for (const name of fieldNames) {
      assert.ok(
        !forbiddenNamePattern.test(name),
        `Distribution struct field "${name}" looks like it could hold recipient/allocation data — not allowed`,
      );
    }
  });
});
