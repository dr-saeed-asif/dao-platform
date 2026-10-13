export type { ComplianceResult } from '../analysis-data-types/governance-compliance-results.types';
import Joi from 'joi';
import { ToolExecutionError, type Schema } from '../read-only-tool-execution/read-only-tool-contracts.types';





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

