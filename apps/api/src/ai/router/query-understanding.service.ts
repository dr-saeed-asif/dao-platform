import { Injectable } from '@nestjs/common';
import { OllamaClient } from '../ollama.client';
import { ToolRegistry } from '../tools/tool-registry';
import type { AgentContext } from '../agents/agent.types';
import Joi from 'joi';

export interface ExtractedEntity {
  type: 'proposalId' | 'memberAddress' | 'evidenceId' | 'indexerName' | 'daoId' | 'dateRange' | 'status' | 'operation';
  value: string;
  confidence: number;
}

export interface QueryUnderstanding {
  intent: 'proposal-list' | 'proposal-details' | 'proposal-votes' | 'proposal-members' | 'proposal-transactions' | 'proposal-timeline' | 'proposal-evidence' | 'member-activity' | 'dao-statistics' | 'contract-deployment' | 'indexer-status' | 'verify-rpc' | 'evidence-lookup' | 'compliance-check' | 'overview' | 'greeting' | 'unsupported';
  entities: ExtractedEntity[];
  filters: Record<string, unknown>;
  requiredTools: string[];
  needsRag: boolean;
  needsSql: boolean;
  needsCompliance: boolean;
  needsProvenance: boolean;
  answerMode: 'count' | 'list' | 'details' | 'votes' | 'winner' | 'members' | 'transactions' | 'timeline' | 'evidence' | 'activity' | 'statistics' | 'deployment' | 'indexer-status' | 'verify-rpc' | 'evidence-lookup' | 'compliance' | 'none';
  isMultiTool: boolean;
  reasoning: string;
}

export interface QueryUnderstandingInput {
  question: string;
  context?: AgentContext;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  signal?: AbortSignal;
}

const understandingSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: {
      type: 'string',
      enum: ['proposal-list', 'proposal-details', 'proposal-votes', 'proposal-members', 'proposal-transactions', 'proposal-timeline', 'proposal-evidence', 'member-activity', 'dao-statistics', 'contract-deployment', 'indexer-status', 'verify-rpc', 'evidence-lookup', 'compliance-check', 'overview', 'greeting', 'unsupported'],
    },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['proposalId', 'memberAddress', 'evidenceId', 'indexerName', 'daoId', 'dateRange', 'status', 'operation'] },
          value: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['type', 'value', 'confidence'],
      },
    },
    filters: { type: 'object' },
    requiredTools: { type: 'array', items: { type: 'string' } },
    needsRag: { type: 'boolean' },
    needsSql: { type: 'boolean' },
    needsCompliance: { type: 'boolean' },
    needsProvenance: { type: 'boolean' },
    answerMode: { type: 'string', enum: ['count', 'list', 'details', 'votes', 'winner', 'members', 'transactions', 'timeline', 'evidence', 'activity', 'statistics', 'deployment', 'indexer-status', 'verify-rpc', 'evidence-lookup', 'compliance', 'none'] },
    isMultiTool: { type: 'boolean' },
    reasoning: { type: 'string' },
  },
  required: ['intent', 'entities', 'filters', 'requiredTools', 'needsRag', 'needsSql', 'needsCompliance', 'needsProvenance', 'answerMode', 'isMultiTool', 'reasoning'],
};

@Injectable()
export class QueryUnderstandingService {
  constructor(
    private readonly ollama: OllamaClient,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  async understand(input: QueryUnderstandingInput): Promise<QueryUnderstanding> {
    const availableTools = this.getAvailableTools();
    const systemPrompt = this.buildSystemPrompt(availableTools);
    
    const messages = [
      { role: 'system', content: systemPrompt },
    ];

    if (input.conversationHistory && input.conversationHistory.length > 0) {
      messages.push(...input.conversationHistory.slice(-6));
    }

    messages.push({ role: 'user', content: this.buildUserPrompt(input) });

    const response = await this.ollama.chat(messages, { json: true, maxTokens: 1024, signal: input.signal });
    const parsed: unknown = JSON.parse(response.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    return this.validateUnderstanding(parsed);
  }

  private getAvailableTools(): string[] {
    const tools = this.toolRegistry.list();
    return tools.map(t => `${t.name}: ${t.description}; input=${JSON.stringify(t.inputSchema)}`).sort();
  }

  private buildSystemPrompt(availableTools: string[]): string {
    return [
      'You are a query understanding engine for a DAO governance AI assistant.',
      'Analyze the user question and extract: intent, entities, filters, required tools, and reasoning.',
      '',
      'Available tools:',
      availableTools.map(t => `- ${t}`).join('\n'),
      '',
      'Intent types:',
      '- proposal-list: List/count proposals with optional filters (status, date range, limit, offset)',
      '- proposal-details: Get details of a specific proposal (title, status, dates, creator, etc.)',
      '- proposal-votes: Get vote counts, options, winner for a specific proposal',
      '- proposal-members: Get assigned members/voters for a specific proposal',
      '- proposal-transactions: Get transactions for a specific proposal (create, finalize, votes)',
      '- proposal-timeline: Get governance events timeline for a specific proposal',
      '- proposal-evidence: Get all evidence IDs for a specific proposal',
      '- member-activity: Get voting activity for a specific member on a specific proposal',
      '- dao-statistics: Get DAO-wide aggregate statistics (total proposals, votes, members, artefacts)',
      '- contract-deployment: Get governance contract deployment info (chain, address, tx, version)',
      '- indexer-status: Get indexer checkpoint status (processed block, freshness)',
      '- verify-rpc: Verify an indexed event against blockchain RPC',
      '- evidence-lookup: Resolve and validate a stored evidence record by ID',
      '- compliance-check: Run compliance checks (quorum, voting window, eligibility, integrity, lifecycle, vote uniqueness)',
      '- overview: General overview/summary of a proposal (combines details, votes, members)',
      '- greeting: A greeting only, with no governance question or requested action',
      '- unsupported: Question cannot be answered with available tools',
      '',
      'Entity types: proposalId, memberAddress, evidenceId, indexerName, daoId, dateRange, status, operation',
      '',
      'Output JSON only with this schema:',
      JSON.stringify(understandingSchema, null, 2),
      '',
      'Rules:',
      '- Understand meaning, including informal wording, singular/plural mistakes, Urdu and Roman Urdu. Do not require fixed question templates.',
      '- DAO-wide totals remain DAO-wide even when the UI supplies a selected proposal. Use dao-statistics for unfiltered aggregate counts.',
      '- Preserve all requested filters; do not silently turn a filtered count into an unfiltered total.',
      '- Use only registered tool names. Never generate SQL, invent facts, or accept user-supplied DAO/chain/contract scope.',
      '- Only select verifyAgainstRpc when the question explicitly requests live RPC verification.',
      '- Use overview for document questions or requests combining evidence layers. requiredTools must include every needed tool.',
      '- For historical voter eligibility use checkMemberEligibility, not current member assignments.',
      '- Return unsupported if the available tools cannot answer the requested constraints.',
      '- Extract proposal IDs (local UUID or numeric on-chain ID)',
      '- Extract member addresses (0x-prefixed 40-char hex)',
      '- Extract evidence IDs (event:, structured:, artefact:, chunk:, document-chunk:)',
      '- Extract indexer names (governance-events, votes, proposals, documents)',
      '- Extract date ranges with explicit timezone',
      '- Extract status filters (ACTIVE, UPCOMING, ENDED, CANCELLED, FINALIZED)',
      '- Set needsRag=true for semantic questions (why, explain, risks, summarize)',
      '- Set needsSql=true for factual/count/lookup questions',
      '- Set needsCompliance=true for governance rule checks; document risks alone need RAG, not compliance',
      '- Set needsProvenance=true for blockchain evidence/verification questions',
      '- Set isMultiTool=true when multiple tools are needed',
      '- For greetings or unsupported questions, use answerMode=none, requiredTools=[], isMultiTool=false and all needs flags=false.',
    ].join('\n');
  }

  private buildUserPrompt(input: QueryUnderstandingInput): string {
    const contextInfo = input.context ? `
Context:
- Proposal ID: ${input.context.localProposalId ?? 'none'}
- On-chain Proposal ID: ${input.context.onChainProposalId ?? 'none'}
- DAO ID: ${input.context.daoId ?? 'none'}
- Chain ID: ${input.context.chainId ?? 'none'}
- Contract: ${input.context.contractAddress ?? 'none'}
` : '';

    return `Question: ${input.question}${contextInfo}`;
  }

  private validateUnderstanding(parsed: unknown): QueryUnderstanding {
    const validator = Joi.object<QueryUnderstanding>({
      intent: Joi.string().valid(...understandingSchema.properties.intent.enum).required(),
      entities: Joi.array().items(Joi.object({
        type: Joi.string().valid(...understandingSchema.properties.entities.items.properties.type.enum).required(),
        value: Joi.string().max(512).required(),
        confidence: Joi.number().min(0).max(1).required(),
      }).unknown(false)).max(20).required(),
      filters: Joi.object().required(),
      requiredTools: Joi.array().items(Joi.string()).unique().max(21).required(),
      needsRag: Joi.boolean().required(), needsSql: Joi.boolean().required(),
      needsCompliance: Joi.boolean().required(), needsProvenance: Joi.boolean().required(),
      answerMode: Joi.string().valid(...understandingSchema.properties.answerMode.enum).required(),
      isMultiTool: Joi.boolean().required(), reasoning: Joi.string().allow('').max(2000).required(),
    }).unknown(false);
    const { value, error } = validator.validate(parsed, { convert: false });
    if (error || value.requiredTools.some((name: string) => !this.toolRegistry.has(name))) {
      throw new Error('Invalid query understanding or unregistered tool selection.');
    }
    const noToolIntent = value.intent === 'unsupported' || value.intent === 'greeting';
    if ((!noToolIntent && value.answerMode === 'none') ||
        (noToolIntent && (value.requiredTools.length > 0 || value.needsSql || value.needsRag || value.needsCompliance || value.needsProvenance || value.isMultiTool))) {
      throw new Error('Query intent conflicts with its selected tools or answer mode.');
    }
    return value;
  }
}
