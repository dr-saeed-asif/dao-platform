import { DOCUMENT_EVIDENCE_SEARCH } from '@dao-platform/language-models/dependency-interfaces/document-evidence-retrieval.interface';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PostgresModule } from '../infrastructure-connections/database/postgresql-connection.module';
import { ResearchModule } from '../research-documents-and-datasets/research-documents-and-datasets.module';
import { ProposalsModule } from '../governance-proposal-management/governance-proposal-management.module';
import { TextExtractionService } from '@dao-platform/language-models/document-retrieval-and-answering/extract-research-document-text.service';
import { ChunkingService } from '@dao-platform/language-models/document-retrieval-and-answering/split-document-text-into-searchable-chunks.service';
import { OllamaClient } from '@dao-platform/language-models/model-provider-integrations/configured-language-model-client.service';
import { EmbeddingPipelineService } from '../background-processing/research-document-indexing/index-research-documents-and-embeddings.service';
import { VectorSearchService } from '../trusted-governance-data-tools/document-evidence-search/search-document-evidence.service';
import { LlmOnlySystem } from '@dao-platform/language-models/answering-strategies/answer-with-language-model-only.service';
import { VectorRagSystem } from '@dao-platform/language-models/answering-strategies/answer-with-retrieved-document-evidence.service';
import { AiController } from './governance-question-analysis.controller';
import { ToolRegistry } from '@dao-platform/language-models/read-only-tool-execution/registered-read-only-tools.service';
import { ProposalTools } from '../trusted-governance-data-tools/database-query-tools/list-governance-proposals.tool';
import { StatisticsTools } from '../trusted-governance-data-tools/database-query-tools/query-governance-statistics.tool';
import { MemberTools } from '../trusted-governance-data-tools/database-query-tools/list-proposal-members.tool';
import { ProposalDetailsTools } from '../trusted-governance-data-tools/database-query-tools/query-governance-proposal-details.tool';
import { ProposalVotesTools } from '../trusted-governance-data-tools/database-query-tools/query-proposal-votes.tool';
import { MemberActivityTools } from '../trusted-governance-data-tools/database-query-tools/query-member-governance-activity.tool';
import { TransactionTools, IndexerStatusTools, VerifyAgainstRpcTools } from '../trusted-governance-data-tools/blockchain-evidence-tools/query-transactions-indexing-status-and-verify-evidence.tools';
import { DeploymentTools } from '../trusted-governance-data-tools/blockchain-evidence-tools/query-governance-contract-deployment.tool';
import { TimelineTools } from '../trusted-governance-data-tools/blockchain-evidence-tools/query-proposal-event-timeline.tool';
import { ProposalEvidenceTools, EvidenceByIdTools } from '../trusted-governance-data-tools/blockchain-evidence-tools/query-proposal-evidence-and-evidence-origin.tools';
import { ProposalToolsController } from './proposal-query-tools.controller';
import { QueryRouter } from '@dao-platform/language-models/question-understanding-and-routing/route-governance-question.service';
import { QueryUnderstandingService } from '@dao-platform/language-models/question-understanding-and-routing/understand-governance-question.service';
import { QueryOrchestrator } from '@dao-platform/language-models/question-answering-workflows/execute-governance-question-workflow.service';
import { SynthesisService } from '@dao-platform/language-models/evidence-based-answer-generation/generate-answer-from-evidence.service';
import { GovernanceToolsService } from '../trusted-governance-data-tools/legacy-governance-tool-registration.service';
import { MultiAgentSystem } from '@dao-platform/language-models/agent-task-execution/coordinate-governance-analysis-agents.service';
import { McpToolRegistryAdapter } from '@dao-platform/language-models/read-only-tool-execution/model-context-protocol-tool.adapter';
import {
  CalculateQuorumTool,
  CheckEvidenceIntegrityTool,
  CheckLifecycleTransitionsTool,
  CheckMemberEligibilityTool,
  CheckVoteUniquenessTool,
  CheckVotingWindowTool,
} from '../trusted-governance-data-tools/governance-rule-checking-tools/check-governance-compliance.tools';

@Module({
  imports: [ConfigModule, PostgresModule, ResearchModule, ProposalsModule],
  controllers: [AiController, ProposalToolsController],
  providers: [
    TextExtractionService,
    ChunkingService,
    OllamaClient,
    EmbeddingPipelineService,
    VectorSearchService,
    { provide: DOCUMENT_EVIDENCE_SEARCH, useExisting: VectorSearchService },
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
