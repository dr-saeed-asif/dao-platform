// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title CyberDAO proposal assignment and voting registry
/// @notice Stores governance authorization and votes on-chain while proposal
///         documents remain in content-addressed off-chain storage.
/// @dev This contract records voting outcomes. It intentionally does not
///      execute arbitrary treasury calls in its first version.
contract CyberDAOGovernance is Ownable2Step {
    uint16 public constant MIN_OPTIONS = 2;
    uint16 public constant MAX_OPTIONS = 10;
    uint256 public constant MAX_ASSIGNMENTS_PER_TRANSACTION = 200;

    enum ProposalState {
        Pending,
        Active,
        Closed,
        Cancelled
    }

    struct Proposal {
        bytes32 metadataHash;
        string metadataURI;
        uint64 startsAt;
        uint64 endsAt;
        uint16 optionCount;
        uint16 winningOption;
        uint32 assignedMemberCount;
        uint32 voteCount;
        uint8 proposalType;
        bool cancelled;
        bool finalized;
        bool tied;
    }

    error EmptyMetadataURI();
    error InvalidMetadataHash();
    error InvalidVotingPeriod();
    error InvalidOptionCount();
    error InvalidProposal(uint256 proposalId);
    error InvalidMember(address member);
    error AssignmentBatchTooLarge();
    error AssignmentLocked(uint256 proposalId);
    error MemberAlreadyAssigned(uint256 proposalId, address member);
    error MemberNotAssigned(uint256 proposalId, address member);
    error VotingNotActive(uint256 proposalId);
    error AlreadyVoted(uint256 proposalId, address voter);
    error InvalidOption(uint16 optionIndex);
    error ProposalAlreadyCancelled(uint256 proposalId);
    error ProposalAlreadyFinalized(uint256 proposalId);
    error VotingPeriodNotEnded(uint256 proposalId);
    error OwnershipRenunciationDisabled();

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed creator,
        uint8 indexed proposalType,
        bytes32 metadataHash,
        string metadataURI,
        uint16 optionCount,
        uint64 startsAt,
        uint64 endsAt
    );
    event MemberAssigned(uint256 indexed proposalId, address indexed member);
    event MemberUnassigned(uint256 indexed proposalId, address indexed member);
    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        uint16 indexed optionIndex
    );
    event ProposalCancelled(uint256 indexed proposalId);
    event ProposalFinalized(
        uint256 indexed proposalId,
        uint16 indexed winningOption,
        bool tied,
        uint32 totalVotes
    );

    uint256 public proposalCount;

    mapping(uint256 proposalId => Proposal proposal) private _proposals;
    mapping(uint256 proposalId => mapping(address member => bool assigned))
        private _assignments;
    mapping(uint256 proposalId => mapping(address voter => bool voted))
        private _hasVoted;
    mapping(uint256 proposalId => mapping(address voter => uint16 optionIndex))
        private _votes;
    mapping(uint256 proposalId => mapping(uint16 optionIndex => uint32 count))
        private _voteCounts;

    constructor(address initialOwner) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert OwnableInvalidOwner(address(0));
    }

    function renounceOwnership() public pure override {
        revert OwnershipRenunciationDisabled();
    }

    function createProposal(
        string calldata metadataURI,
        bytes32 metadataHash,
        uint8 proposalType,
        uint16 optionCount,
        uint64 startsAt,
        uint64 endsAt
    ) external onlyOwner returns (uint256 proposalId) {
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();
        if (metadataHash == bytes32(0)) revert InvalidMetadataHash();
        if (startsAt < block.timestamp || endsAt <= startsAt) {
            revert InvalidVotingPeriod();
        }
        if (optionCount < MIN_OPTIONS || optionCount > MAX_OPTIONS) {
            revert InvalidOptionCount();
        }

        proposalId = ++proposalCount;
        Proposal storage proposal = _proposals[proposalId];
        proposal.metadataHash = metadataHash;
        proposal.metadataURI = metadataURI;
        proposal.proposalType = proposalType;
        proposal.optionCount = optionCount;
        proposal.startsAt = startsAt;
        proposal.endsAt = endsAt;

        emit ProposalCreated(
            proposalId,
            msg.sender,
            proposalType,
            metadataHash,
            metadataURI,
            optionCount,
            startsAt,
            endsAt
        );
    }

    function assignMembers(
        uint256 proposalId,
        address[] calldata members
    ) external onlyOwner {
        Proposal storage proposal = _getProposal(proposalId);
        _requireAssignmentsOpen(proposalId, proposal);
        if (
            members.length == 0 ||
            members.length > MAX_ASSIGNMENTS_PER_TRANSACTION
        ) revert AssignmentBatchTooLarge();

        for (uint256 index = 0; index < members.length; ++index) {
            address member = members[index];
            if (member == address(0)) revert InvalidMember(member);
            if (_assignments[proposalId][member]) {
                revert MemberAlreadyAssigned(proposalId, member);
            }
            _assignments[proposalId][member] = true;
            ++proposal.assignedMemberCount;
            emit MemberAssigned(proposalId, member);
        }
    }

    function unassignMember(
        uint256 proposalId,
        address member
    ) external onlyOwner {
        Proposal storage proposal = _getProposal(proposalId);
        _requireAssignmentsOpen(proposalId, proposal);
        if (!_assignments[proposalId][member]) {
            revert MemberNotAssigned(proposalId, member);
        }

        _assignments[proposalId][member] = false;
        --proposal.assignedMemberCount;
        emit MemberUnassigned(proposalId, member);
    }

    function vote(uint256 proposalId, uint16 optionIndex) external {
        Proposal storage proposal = _getProposal(proposalId);
        if (
            proposal.cancelled ||
            block.timestamp < proposal.startsAt ||
            block.timestamp >= proposal.endsAt
        ) revert VotingNotActive(proposalId);
        if (!_assignments[proposalId][msg.sender]) {
            revert MemberNotAssigned(proposalId, msg.sender);
        }
        if (_hasVoted[proposalId][msg.sender]) {
            revert AlreadyVoted(proposalId, msg.sender);
        }
        if (optionIndex >= proposal.optionCount) {
            revert InvalidOption(optionIndex);
        }

        _hasVoted[proposalId][msg.sender] = true;
        _votes[proposalId][msg.sender] = optionIndex;
        ++_voteCounts[proposalId][optionIndex];
        ++proposal.voteCount;

        emit VoteCast(proposalId, msg.sender, optionIndex);
    }

    function cancelProposal(uint256 proposalId) external onlyOwner {
        Proposal storage proposal = _getProposal(proposalId);
        if (proposal.cancelled) revert ProposalAlreadyCancelled(proposalId);
        if (proposal.finalized) revert ProposalAlreadyFinalized(proposalId);

        proposal.cancelled = true;
        emit ProposalCancelled(proposalId);
    }

    function finalizeProposal(uint256 proposalId) external {
        Proposal storage proposal = _getProposal(proposalId);
        if (proposal.cancelled) revert ProposalAlreadyCancelled(proposalId);
        if (proposal.finalized) revert ProposalAlreadyFinalized(proposalId);
        if (block.timestamp < proposal.endsAt) {
            revert VotingPeriodNotEnded(proposalId);
        }

        uint32 highestVoteCount;
        uint16 winningOption;
        bool tied;
        for (uint16 optionIndex = 0; optionIndex < proposal.optionCount; ++optionIndex) {
            uint32 count = _voteCounts[proposalId][optionIndex];
            if (count > highestVoteCount) {
                highestVoteCount = count;
                winningOption = optionIndex;
                tied = false;
            } else if (count == highestVoteCount && optionIndex > 0) {
                tied = true;
            }
        }

        proposal.finalized = true;
        proposal.winningOption = winningOption;
        proposal.tied = tied;
        emit ProposalFinalized(
            proposalId,
            winningOption,
            tied,
            proposal.voteCount
        );
    }

    function getProposal(
        uint256 proposalId
    ) external view returns (Proposal memory) {
        Proposal storage proposal = _getProposal(proposalId);
        return proposal;
    }

    function proposalState(
        uint256 proposalId
    ) external view returns (ProposalState) {
        Proposal storage proposal = _getProposal(proposalId);
        if (proposal.cancelled) return ProposalState.Cancelled;
        if (block.timestamp < proposal.startsAt) return ProposalState.Pending;
        if (block.timestamp < proposal.endsAt) return ProposalState.Active;
        return ProposalState.Closed;
    }

    function isAssigned(
        uint256 proposalId,
        address member
    ) external view returns (bool) {
        _getProposal(proposalId);
        return _assignments[proposalId][member];
    }

    function hasVoted(
        uint256 proposalId,
        address voter
    ) external view returns (bool) {
        _getProposal(proposalId);
        return _hasVoted[proposalId][voter];
    }

    function voteOf(
        uint256 proposalId,
        address voter
    ) external view returns (uint16) {
        _getProposal(proposalId);
        if (!_hasVoted[proposalId][voter]) {
            revert MemberNotAssigned(proposalId, voter);
        }
        return _votes[proposalId][voter];
    }

    function optionVoteCount(
        uint256 proposalId,
        uint16 optionIndex
    ) external view returns (uint32) {
        Proposal storage proposal = _getProposal(proposalId);
        if (optionIndex >= proposal.optionCount) {
            revert InvalidOption(optionIndex);
        }
        return _voteCounts[proposalId][optionIndex];
    }

    function _getProposal(
        uint256 proposalId
    ) private view returns (Proposal storage proposal) {
        proposal = _proposals[proposalId];
        if (proposal.startsAt == 0) revert InvalidProposal(proposalId);
    }

    function _requireAssignmentsOpen(
        uint256 proposalId,
        Proposal storage proposal
    ) private view {
        if (proposal.cancelled || block.timestamp >= proposal.startsAt) {
            revert AssignmentLocked(proposalId);
        }
    }
}
