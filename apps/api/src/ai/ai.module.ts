import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PostgresModule } from '../database/postgres.module';
import { ResearchModule } from '../research/research.module';
import { ProposalsModule } from '../proposals/proposals.module';
import { TextExtractionService } from './text-extraction.service';
import { ChunkingService } from './chunking.service';
import { OllamaClient } from './ollama.client';
import { EmbeddingPipelineService } from './embedding-pipeline.service';
import { VectorSearchService } from './vector-search.service';
import { LlmOnlySystem } from './llm-only.system';
import { VectorRagSystem } from './vector-rag.system';
import { AiController } from './ai.controller';
import { ToolRegistry } from './tools/tool-registry';
import { ProposalTools } from './tools/offchain/proposal.tools';
import { StatisticsTools } from './tools/offchain/statistics.tools';
import { MemberTools } from './tools/offchain/member.tools';
import { ProposalDetailsTools } from './tools/offchain/proposal-details.tools';
import { ProposalVotesTools } from './tools/offchain/proposal-votes.tools';
import { MemberActivityTools } from './tools/offchain/member-activity.tools';
import { TransactionTools, IndexerStatusTools, VerifyAgainstRpcTools } from './tools/onchain/transaction.tools';
import { DeploymentTools } from './tools/onchain/deployment.tools';
import { TimelineTools } from './tools/onchain/timeline.tools';
import { ProposalEvidenceTools, EvidenceByIdTools } from './tools/onchain/provenance.tools';
import { ProposalToolsController } from './tools/proposal-tools.controller';
import { QueryRouter } from './router/query-router';
import { QueryUnderstandingService } from './router/query-understanding.service';
import { QueryOrchestrator } from './orchestration/query-orchestrator';
import { SynthesisService } from './synthesis/synthesis.service';
import { GovernanceToolsService } from './agents/governance-tools.service';
import { MultiAgentSystem } from './agents/multi-agent.system';
import { McpToolRegistryAdapter } from './agents/mcp.adapter';
import {
  CalculateQuorumTool,
  CheckEvidenceIntegrityTool,
  CheckLifecycleTransitionsTool,
  CheckMemberEligibilityTool,
  CheckVoteUniquenessTool,
  CheckVotingWindowTool,
} from './tools/compliance/compliance.tools';

@Module({
  imports: [ConfigModule, PostgresModule, ResearchModule, ProposalsModule],
  controllers: [AiController, ProposalToolsController],
  providers: [
    TextExtractionService,
    ChunkingService,
    OllamaClient,
    EmbeddingPipelineService,
    VectorSearchService,
    LlmOnlySystem,
    VectorRagSystem,
    ToolRegistry,
    ProposalTools,
    StatisticsTools,
    MemberTools,
    ProposalDetailsTools,
    ProposalVotesTools,
    MemberActivityTools,
    TransactionTools,
    IndexerStatusTools,
    VerifyAgainstRpcTools,
    DeploymentTools,
    TimelineTools,
    ProposalEvidenceTools,
    EvidenceByIdTools,
    QueryRouter,
    QueryUnderstandingService,
    QueryOrchestrator,
    SynthesisService,
    GovernanceToolsService,
    CalculateQuorumTool,
    CheckVotingWindowTool,
    CheckMemberEligibilityTool,
    CheckEvidenceIntegrityTool,
    CheckLifecycleTransitionsTool,
    CheckVoteUniquenessTool,
    MultiAgentSystem,
    McpToolRegistryAdapter,
  ],
  exports: [
    ToolRegistry,
    TextExtractionService,
    ChunkingService,
    OllamaClient,
    EmbeddingPipelineService,
    VectorSearchService,
    LlmOnlySystem,
    VectorRagSystem,
    MultiAgentSystem,
  ],
})
export class AiModule {}
