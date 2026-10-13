import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import {
  GovernanceToolsService,
  type ComplianceResult,
} from '../legacy-governance-tool-registration.service';
import { ToolRegistry } from '@dao-platform/language-models/read-only-tool-execution/registered-read-only-tools.service';
import {
  ToolExecutionError,
  type AiTool,
  type Schema,
  type ToolContext,
} from '@dao-platform/language-models/read-only-tool-execution/read-only-tool-contracts.types';
import { ProposalComplianceInput, QuorumComplianceInput, MemberComplianceInput, calculateQuorumInputSchema, checkVotingWindowInputSchema, checkMemberEligibilityInputSchema, proposalComplianceInputSchema } from '@dao-platform/language-models/read-only-tool-contracts/check-governance-compliance.contracts';
export * from '@dao-platform/language-models/read-only-tool-contracts/check-governance-compliance.contracts';

abstract class ComplianceTool<Input extends ProposalComplianceInput>
  implements OnModuleInit, AiTool<Input, ComplianceResult>
{
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: Schema<Input>;
  readonly readOnly = true;
  readonly timeoutMs = 10_000;

  constructor(
    protected readonly governance: GovernanceToolsService,
    @Inject(ToolRegistry) private readonly registry: ToolRegistry,
  ) {}

  onModuleInit() {
    this.registry.registerAiTool(this, ['compliance']);
  }

  abstract execute(
    input: Input,
    context: ToolContext,
  ): Promise<ComplianceResult>;

  protected async checked(
    context: ToolContext,
    work: () => Promise<ComplianceResult>,
  ): Promise<ComplianceResult> {
    context.signal?.throwIfAborted();
    const result = await work();
    context.signal?.throwIfAborted();
    return result;
  }
}

@Injectable()
export class CalculateQuorumTool extends ComplianceTool<QuorumComplianceInput> {
  readonly name = 'calculateQuorum';
  readonly description =
    'Evaluate GOV-01 quorum from stored policy and canonical vote evidence.';
  readonly inputSchema = calculateQuorumInputSchema;

  execute(input: QuorumComplianceInput, context: ToolContext) {
    return this.checked(context, () =>
      this.governance.calculateQuorum(
        input.proposalId,
        input.policyVersion,
        context.daoId,
      ),
    );
  }
}

@Injectable()
export class CheckVotingWindowTool extends ComplianceTool<MemberComplianceInput> {
  readonly name = 'checkVotingWindow';
  readonly description =
    'Evaluate GOV-02 vote timestamps against the proposal voting window.';
  readonly inputSchema = checkVotingWindowInputSchema;

  execute(input: MemberComplianceInput, context: ToolContext) {
    return this.checked(context, () =>
      this.governance.checkVotingWindow(
        input.proposalId,
        input.memberAddress,
        context.daoId,
      ),
    );
  }
}

@Injectable()
export class CheckMemberEligibilityTool extends ComplianceTool<MemberComplianceInput> {
  readonly name = 'checkMemberEligibility';
  readonly description =
    'Evaluate GOV-03 member eligibility for recorded votes.';
  readonly inputSchema = checkMemberEligibilityInputSchema;

  execute(input: MemberComplianceInput, context: ToolContext) {
    return this.checked(context, () =>
      this.governance.checkMemberEligibility(
        input.proposalId,
        input.memberAddress,
        context.daoId,
      ),
    );
  }
}

@Injectable()
export class CheckEvidenceIntegrityTool extends ComplianceTool<ProposalComplianceInput> {
  readonly name = 'checkEvidenceIntegrity';
  readonly description =
    'Evaluate GOV-04 linked artefact hash and lifecycle integrity.';
  readonly inputSchema = proposalComplianceInputSchema;

  execute(input: ProposalComplianceInput, context: ToolContext) {
    return this.checked(context, () =>
      this.governance.checkEvidenceIntegrity(input.proposalId, context.daoId),
    );
  }
}

@Injectable()
export class CheckLifecycleTransitionsTool extends ComplianceTool<ProposalComplianceInput> {
  readonly name = 'checkLifecycleTransitions';
  readonly description =
    'Evaluate GOV-05 canonical governance lifecycle event order.';
  readonly inputSchema = proposalComplianceInputSchema;

  execute(input: ProposalComplianceInput, context: ToolContext) {
    return this.checked(context, () =>
      this.governance.checkLifecycleTransitions(
        input.proposalId,
        context.daoId,
      ),
    );
  }
}

@Injectable()
export class CheckVoteUniquenessTool extends ComplianceTool<ProposalComplianceInput> {
  readonly name = 'checkVoteUniqueness';
  readonly description = 'Evaluate GOV-06 one canonical vote event per member.';
  readonly inputSchema = proposalComplianceInputSchema;

  execute(input: ProposalComplianceInput, context: ToolContext) {
    return this.checked(context, () =>
      this.governance.checkVoteUniqueness(input.proposalId, context.daoId),
    );
  }
}
