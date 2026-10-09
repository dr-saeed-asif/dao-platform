import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import { ProposalQueryService, type EvidenceLookupResult, type ProposalEvidenceResult } from '../../../proposals/proposal-query.service';
import { ToolRegistry } from '../tool-registry';
import { ToolExecutionError, type AiTool, type Schema, type ToolContext } from '../tool.types';

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

@Injectable()
export class ProposalEvidenceTools implements OnModuleInit, AiTool<GetProposalEvidenceInput, GetProposalEvidenceOutput> {
  readonly name = 'getProposalEvidence';
  readonly description = 'Return only canonical governance event and linked artefact evidence IDs for a proposal.';
  readonly inputSchema = getProposalEvidenceInputSchema;
  readonly readOnly = true;
  readonly timeoutMs = 10_000;
  constructor(private readonly proposals: ProposalQueryService, private readonly registry: ToolRegistry) {}
  onModuleInit() { this.registry.registerAiTool(this, ['provenance']); }
  execute(input: GetProposalEvidenceInput, context: ToolContext) {
    context.signal?.throwIfAborted();
    return this.proposals.getProposalEvidence({ proposalId: input.proposalId, daoId: context.daoId ?? null });
  }
}

@Injectable()
export class EvidenceByIdTools implements OnModuleInit, AiTool<GetEvidenceByIdInput, GetEvidenceByIdOutput> {
  readonly name = 'getEvidenceById';
  readonly description = 'Validate a stored governance event, artefact, or document chunk and return its lineage and warnings.';
  readonly inputSchema = getEvidenceByIdInputSchema;
  readonly readOnly = true;
  readonly timeoutMs = 10_000;
  constructor(private readonly proposals: ProposalQueryService, private readonly registry: ToolRegistry) {}
  onModuleInit() { this.registry.registerAiTool(this, ['provenance']); }
  execute(input: GetEvidenceByIdInput, context: ToolContext) {
    context.signal?.throwIfAborted();
    return this.proposals.getEvidenceById(input.evidenceId, input.datasetVersion);
  }
}

