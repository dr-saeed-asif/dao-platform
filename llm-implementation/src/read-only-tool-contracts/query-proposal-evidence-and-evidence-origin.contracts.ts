import Joi from 'joi';
import { ToolExecutionError, type Schema } from '../read-only-tool-execution/read-only-tool-contracts.types';
import type { ProposalTimelineResult, ProposalEvidenceResult, EvidenceLookupResult } from '../analysis-data-types/proposal-evidence-query-results.types';



export interface GetProposalEvidenceInput { proposalId: string }
export type GetProposalEvidenceOutput = ProposalEvidenceResult;
const proposalValidator = Joi.object({ proposalId: Joi.string().trim().min(1).required() }).unknown(false).required();
export const getProposalEvidenceInputSchema: Schema<GetProposalEvidenceInput> = {
  jsonSchema: { type: 'object', additionalProperties: false, properties: { proposalId: { type: 'string', minLength: 1 } }, required: ['proposalId'] },
  parse(input) {
    const result = proposalValidator.validate(input, { convert: false });
    if (result.error) throw new ToolExecutionError('INVALID_INPUT', 'A nonempty proposalId is required.');
    return result.value;
  },
};

export interface GetEvidenceByIdInput { evidenceId: string; datasetVersion?: string }
export type GetEvidenceByIdOutput = EvidenceLookupResult;
const evidenceValidator = Joi.object({ evidenceId: Joi.string().trim().min(1).required(), datasetVersion: Joi.string().trim().min(1).optional() }).unknown(false).required();
export const getEvidenceByIdInputSchema: Schema<GetEvidenceByIdInput> = {
  jsonSchema: { type: 'object', additionalProperties: false, properties: { evidenceId: { type: 'string', minLength: 1 }, datasetVersion: { type: 'string', minLength: 1 } }, required: ['evidenceId'] },
  parse(input) {
    const result = evidenceValidator.validate(input, { convert: false });
    if (result.error) throw new ToolExecutionError('INVALID_INPUT', 'A nonempty evidenceId is required.');
    return result.value;
  },
};

