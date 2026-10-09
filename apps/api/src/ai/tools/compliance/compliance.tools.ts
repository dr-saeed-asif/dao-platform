import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import {
  GovernanceToolsService,
  type ComplianceResult,
} from '../../agents/governance-tools.service';
import { ToolRegistry } from '../tool-registry';
import {
  ToolExecutionError,
  type AiTool,
  type Schema,
  type ToolContext,
} from '../tool.types';

export type { ComplianceResult } from '../../agents/governance-tools.service';

export interface ProposalComplianceInput {
  proposalId: string;
}

export interface QuorumComplianceInput extends ProposalComplianceInput {
  policyVersion?: string;
}

export interface MemberComplianceInput extends ProposalComplianceInput {
  memberAddress?: string;
}

function schema<Input extends ProposalComplianceInput>(
  options: {
    policyVersion?: boolean;
    memberAddress?: boolean;
  } = {},
): Schema<Input> {
  const properties: Record<string, unknown> = {
    proposalId: { type: 'string', minLength: 1 },
  };
  const fields: Record<string, Joi.Schema> = {
    proposalId: Joi.string().trim().min(1).required(),
  };
  if (options.policyVersion) {
    properties.policyVersion = { type: 'string', minLength: 1 };
    fields.policyVersion = Joi.string().trim().min(1).optional();
  }
  if (options.memberAddress) {
    properties.memberAddress = {
      type: 'string',
      pattern: '^0x[0-9a-fA-F]{40}$',
    };
    fields.memberAddress = Joi.string()
      .trim()
      .pattern(/^0x[0-9a-fA-F]{40}$/)
      .lowercase()
      .optional();
  }
  const validator = Joi.object(fields).unknown(false).required();
  return {
    jsonSchema: {
      type: 'object',
      additionalProperties: false,
      properties,
      required: ['proposalId'],
    },
    parse(input) {
      const value = validator.validate(input, { convert: true });
      if (value.error) {
        throw new ToolExecutionError('INVALID_INPUT', value.error.message);
      }
      return value.value as Input;
    },
  };
}

export const calculateQuorumInputSchema = schema<QuorumComplianceInput>({
  policyVersion: true,
});
export const checkVotingWindowInputSchema = schema<MemberComplianceInput>({
  memberAddress: true,
});
export const checkMemberEligibilityInputSchema = schema<MemberComplianceInput>({
  memberAddress: true,
});
export const proposalComplianceInputSchema = schema<ProposalComplianceInput>();

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
