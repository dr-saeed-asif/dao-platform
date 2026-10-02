import { BadRequestException, Body, Controller, Get, Param, PayloadTooLargeException, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ResearchService } from './research.service';
import { ArtefactStateDto, CreateDatasetDto, FreezeDatasetDto, LinkArtefactsDto, ManifestDto } from './research.dto';

@Controller()
export class ResearchController {
  constructor(private readonly service: ResearchService) {}
  @Post('artefacts/stage')
  async stage(@Req() request: FastifyRequest) {
    const files=[];
    try {
      for await (const part of request.files()) files.push({filename:part.filename,mediaType:part.mimetype,bytes:await part.toBuffer()});
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'FST_REQ_FILE_TOO_LARGE' || code === 'FST_FILES_LIMIT' || code === 'FST_PARTS_LIMIT') throw new PayloadTooLargeException('Document upload limit exceeded.');
      if (code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') throw new BadRequestException('Multipart file upload required.');
      throw error;
    }
    return { items: await this.service.stage(files) };
  }
  @Get('artefacts/:id') get(@Param('id') id:string){ return this.service.getArtefact(id); }
  @Get('artefacts/:id/download') async download(@Param('id') id:string,@Res() reply:FastifyReply){ const file=await this.service.download(id); return reply.header('content-type',file.mediaType).header('content-disposition',`inline; filename="${file.filename.replace(/["\\]/g,'_')}"`).send(file.bytes); }
  @Get('proposals/:proposalId/artefacts') list(@Param('proposalId') id:string){ return this.service.listProposalArtefacts(id); }
   @Post('artefacts/manifest') manifest(@Body() body:ManifestDto){ return this.service.createManifest(body); }
   @Post('artefacts/state') state(@Body() body:ArtefactStateDto){ return this.service.setLifecycle(body.evidenceIds,body.state); }
   @Post('proposals/:proposalId/artefacts/link') link(@Param('proposalId') proposalId:string,@Body() body:LinkArtefactsDto){ return this.service.link(proposalId,body.evidenceIds,body.onChainProposalId,body.creationEvidenceId); }
   @Post('datasets') createDataset(@Body() body:CreateDatasetDto){ return this.service.createDataset(body); }
  @Get('datasets') datasets(){ return this.service.listDatasets(); }
  @Get('datasets/:id') dataset(@Param('id') id:string){ return this.service.getDataset(id); }
   @Post('datasets/:id/freeze') freeze(@Param('id') id:string,@Body() body:FreezeDatasetDto){ return this.service.freezeDataset(id,body.endBlock,body.endBlockHash); }
}
