import { ResearchRunsController } from './research-runs.controller';

describe('ResearchRunsController',()=>{
  const service={list:jest.fn(),detail:jest.fn(),export:jest.fn()};
  const controller=new ResearchRunsController(service as any);
  beforeEach(()=>jest.clearAllMocks());

  it('lists runs with filters',async()=>{service.list.mockResolvedValue({items:[]});await controller.list({proposalId:'p1',system:'hybrid'});expect(service.list).toHaveBeenCalledWith(expect.objectContaining({proposalId:'p1',system:'hybrid'}));});
  it('returns run detail',async()=>{service.detail.mockResolvedValue({runId:'r1'});await expect(controller.detail('r1')).resolves.toEqual({runId:'r1'});});
  it.each(['csv','json'] as const)('exports %s',async format=>{service.export.mockResolvedValue({contentType:'text/plain',filename:`runs.${format}`,body:'data'});const reply={header:jest.fn().mockReturnThis(),send:jest.fn().mockReturnValue('sent')};await expect(controller.export({format},reply as any)).resolves.toBe('sent');expect(service.export).toHaveBeenCalledWith(expect.anything(),format);});
});
