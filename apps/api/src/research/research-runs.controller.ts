import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ResearchRunsService, type RunFilters } from './research-runs.service';

@Controller('research/runs')
export class ResearchRunsController {
  constructor(private readonly runs:ResearchRunsService){}

  @Get('export')
  async export(@Query() query:RunFilters&{format?:string},@Res() reply:FastifyReply){
    const format=query.format==='json'?'json':'csv';
    const file=await this.runs.export(filters(query),format);
    return reply.header('content-type',file.contentType).header('content-disposition',`attachment; filename="${file.filename}"`).send(file.body);
  }

  @Get()
  list(@Query() query:RunFilters){return this.runs.list(filters(query));}

  @Get(':runId')
  detail(@Param('runId') runId:string){return this.runs.detail(runId);}
}

function filters(query:RunFilters):RunFilters{return {proposalId:query.proposalId,system:query.system,verificationStatus:query.verificationStatus,from:query.from,to:query.to,search:query.search,page:query.page?Number(query.page):undefined,limit:query.limit?Number(query.limit):undefined}}
