import Joi from 'joi';
import { ToolExecutionError, type Schema } from '../read-only-tool-execution/read-only-tool-contracts.types';
import type { ProposalTimelineResult, ProposalEvidenceResult, EvidenceLookupResult } from '../analysis-data-types/proposal-evidence-query-results.types';



export interface GetProposalTimelineInput { proposalId: string }
export type GetProposalTimelineOutput = ProposalTimelineResult;
const validator = Joi.object({ proposalId: Joi.string().trim().min(1).required() }).unknown(false).required();
export const getProposalTimelineInputSchema: Schema<GetProposalTimelineInput> = {
  jsonSchema: { type: 'object', additionalProperties: false, properties: { proposalId: { type: 'string', minLength: 1 } }, required: ['proposalId'] },
  parse(input) {
    const result = validator.validate(input, { convert: false });
    if (result.error) throw new ToolExecutionError('INVALID_INPUT', 'A nonempty proposalId is required.');
    return result.value;
  },
};

