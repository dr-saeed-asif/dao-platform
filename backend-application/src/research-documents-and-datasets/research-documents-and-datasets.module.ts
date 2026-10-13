import { Module } from '@nestjs/common';
import { PostgresModule } from '../infrastructure-connections/database/postgresql-connection.module';
import { ResearchController } from './research-documents-and-datasets.controller';
import { ResearchService } from './research-documents-and-datasets.service';
import { LocalArtefactStorage } from '../infrastructure-connections/document-storage/local-research-document-storage.adapter';
import { ResearchRunsController } from '../research-execution-records/research-execution-history.controller';
import { ResearchRunsService } from '../research-execution-records/save-and-query-research-executions.service';
@Module({imports:[PostgresModule],controllers:[ResearchController,ResearchRunsController],providers:[ResearchService,LocalArtefactStorage,ResearchRunsService],exports:[ResearchService,LocalArtefactStorage,ResearchRunsService]})
export class ResearchModule {}
