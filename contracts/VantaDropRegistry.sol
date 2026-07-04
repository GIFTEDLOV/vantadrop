// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title VantaDropRegistry
/// @notice Optional public metadata registry for VantaDrop confidential distributions.
/// @dev This contract is NOT a confidential distribution engine. TokenOps' audited
///      ConfidentialAirdropFactory / ConfidentialAirdropCloneable contracts remain the
///      entire confidential distribution layer — creation, funding, encrypted
///      allocations, signature-gated claims, and recipient decrypt/verify all happen
///      there, proven end to end against live Sepolia (see
///      docs/research/tokenops-sdk-notes.md). This registry only records PUBLIC
///      metadata about a distribution that already exists on TokenOps, so the
///      frontend can render "Distribution Room" pages without a backend database.
///
///      A distribution is fully valid and fully claimable via TokenOps whether or not
///      it is ever registered here. This contract is a display/discovery convenience,
///      never a dependency of the privacy-critical claim path.
///
///      PRIVACY RULES — DO NOT VIOLATE. This contract must NEVER be extended to store:
///        - recipient wallet lists
///        - allocation amounts
///        - private notes
///        - CSV contents
///        - claim signatures
///        - encrypted allocation handles
///      Every field below is either public metadata the sender supplies voluntarily
///      (title, use case, metadata URI) or a fact already public on the TokenOps
///      airdrop clone (token/clone addresses, timestamps, recipient COUNT — never the
///      list). If a future change would let this contract store anything that could
///      identify who is eligible or how much they receive, that change must be
///      rejected — that data belongs in TokenOps' encrypted layer, not here.
contract VantaDropRegistry {
    struct Distribution {
        uint256 id;
        address sender;
        address token;
        address tokenOpsAirdrop;
        string title;
        string useCase;
        uint256 recipientCount;
        uint64 createdAt;
        uint8 status;
        string metadataURI;
    }

    uint256 private _nextDistributionId = 1;
    mapping(uint256 => Distribution) private _distributions;
    mapping(address => uint256[]) private _senderDistributions;

    event DistributionRegistered(
        uint256 indexed id,
        address indexed sender,
        address indexed token,
        address tokenOpsAirdrop,
        string title,
        string useCase,
        uint256 recipientCount
    );

    event DistributionStatusUpdated(uint256 indexed id, uint8 status);

    error ZeroAddress();
    error EmptyTitle();
    error EmptyUseCase();
    error InvalidRecipientCount();
    error NotOriginalSender();
    error DistributionNotFound();

    /// @notice Register public metadata for a distribution that has ALREADY been
    ///         created (and, typically, funded) via TokenOps. Does not create, fund,
    ///         or otherwise interact with TokenOps in any way — pure metadata
    ///         bookkeeping for display/discovery purposes only.
    /// @param token The ERC-7984 confidential token being distributed.
    /// @param tokenOpsAirdrop The TokenOps ConfidentialAirdropCloneable clone address.
    /// @param title Public display name, sender-supplied.
    /// @param useCase Template label (e.g. "Investor distribution").
    /// @param recipientCount Recipient COUNT only — there is no parameter shaped to
    ///        accept a recipient list, by design. Never pass allocation amounts here.
    /// @param metadataURI Optional off-chain public metadata pointer (may be empty).
    function registerDistribution(
        address token,
        address tokenOpsAirdrop,
        string calldata title,
        string calldata useCase,
        uint256 recipientCount,
        string calldata metadataURI
    ) external returns (uint256) {
        if (token == address(0)) revert ZeroAddress();
        if (tokenOpsAirdrop == address(0)) revert ZeroAddress();
        if (bytes(title).length == 0) revert EmptyTitle();
        if (bytes(useCase).length == 0) revert EmptyUseCase();
        if (recipientCount == 0) revert InvalidRecipientCount();

        uint256 id = _nextDistributionId++;
        uint64 createdAt = uint64(block.timestamp);

        _distributions[id] = Distribution({
            id: id,
            sender: msg.sender,
            token: token,
            tokenOpsAirdrop: tokenOpsAirdrop,
            title: title,
            useCase: useCase,
            recipientCount: recipientCount,
            createdAt: createdAt,
            status: 0,
            metadataURI: metadataURI
        });

        _senderDistributions[msg.sender].push(id);

        emit DistributionRegistered(id, msg.sender, token, tokenOpsAirdrop, title, useCase, recipientCount);

        return id;
    }

    /// @notice Update the public status of a distribution. Only the original
    ///         registering sender may call this — a plain equality check, not
    ///         role-based access control, since there is exactly one privileged
    ///         actor and exactly one gated action in this thin contract.
    function updateStatus(uint256 distributionId, uint8 status) external {
        Distribution storage d = _distributions[distributionId];
        if (d.sender == address(0)) revert DistributionNotFound();
        if (d.sender != msg.sender) revert NotOriginalSender();

        d.status = status;

        emit DistributionStatusUpdated(distributionId, status);
    }

    /// @notice Read a distribution's public metadata. Anyone can call this — nothing
    ///         returned here requires gating.
    function getDistribution(uint256 distributionId) external view returns (Distribution memory) {
        Distribution memory d = _distributions[distributionId];
        if (d.sender == address(0)) revert DistributionNotFound();
        return d;
    }

    /// @notice List every distribution ID registered by a given sender. Anyone can
    ///         call this.
    function getSenderDistributions(address sender) external view returns (uint256[] memory) {
        return _senderDistributions[sender];
    }

    /// @notice Total number of distributions ever registered, across all senders.
    function totalDistributions() external view returns (uint256) {
        return _nextDistributionId - 1;
    }
}
