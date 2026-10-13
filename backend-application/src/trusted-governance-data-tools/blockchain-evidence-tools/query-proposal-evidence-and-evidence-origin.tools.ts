import { Injectable, type OnModuleInit } from '@nestjs/common';
import Joi from 'joi';
import { ProposalQueryService, type EvidenceLookupResult, type ProposalEvidenceResult } from '../../governance-proposal-management/governance-proposal-query.service';
import { ToolRegistry } from '@dao-platform/language-models/read-only-tool-execution/registered-read-only-tools.service';
import { ToolExecutionError, type AiTool, type Schema, type ToolContext } from '@dao-platform/language-models/read-only-tool-execution/read-only-tool-contracts.types';
import { GetProposalEvidenceInput, GetProposalEvidenceOutput, getProposalEvidenceInputSchema, GetEvidenceByIdInput, GetEvidenceByIdOutput, getEvidenceByIdInputSchema } from '@dao-platform/language-models/read-only-tool-contracts/query-proposal-evidence-and-evidence-origin.contracts';
export * from '@dao-platform/language-models/read-only-tool-contracts/query-proposal-evidence-and-evidence-origin.contracts';

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

