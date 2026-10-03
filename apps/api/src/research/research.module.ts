import { Module } from '@nestjs/common';
import { PostgresModule } from '../database/postgres.module';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { LocalArtefactStorage } from './local-artefact.storage';
import { ResearchRunsController } from './research-runs.controller';
import { ResearchRunsService } from './research-runs.service';
@Module({imports:[PostgresModule],controllers:[ResearchController,ResearchRunsController],providers:[ResearchService,LocalArtefactStorage,ResearchRunsService],exports:[ResearchService,LocalArtefactStorage,ResearchRunsService]})
export class ResearchModule {}
