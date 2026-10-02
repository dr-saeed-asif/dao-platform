import { Module } from '@nestjs/common';
import { PostgresModule } from '../database/postgres.module';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { LocalArtefactStorage } from './local-artefact.storage';
@Module({imports:[PostgresModule],controllers:[ResearchController],providers:[ResearchService, LocalArtefactStorage],exports:[ResearchService, LocalArtefactStorage]})
export class ResearchModule {}
