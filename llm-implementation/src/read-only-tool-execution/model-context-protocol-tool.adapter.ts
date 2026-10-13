import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface McpToolProvider { server:string; discover():Promise<Array<{name:string;description:string;readOnly:boolean}>>; invoke(name:string,input:Record<string,unknown>):Promise<unknown> }
@Injectable()
export class McpToolRegistryAdapter {
  private readonly providers=new Map<string,McpToolProvider>(); private readonly enabled:boolean; private readonly servers:Set<string>; private readonly tools:Set<string>; private readonly traces:Array<{server:string;tool:string;status:'success'|'error';latencyMs:number;error?:string}>=[];
  constructor(config:ConfigService){this.enabled=config.get<boolean>('MCP_ENABLED',false);this.servers=new Set(config.get<string>('MCP_SERVER_ALLOWLIST','').split(',').map(x=>x.trim()).filter(Boolean));this.tools=new Set(config.get<string>('MCP_TOOL_ALLOWLIST','').split(',').map(x=>x.trim()).filter(Boolean));}
  register(provider:McpToolProvider){this.providers.set(provider.server,provider);}
  async discover(){if(!this.enabled)return [];const output=[];for(const provider of this.providers.values()){if(!this.servers.has(provider.server))continue;for(const tool of await provider.discover())if(tool.readOnly&&this.tools.has(`${provider.server}:${tool.name}`))output.push({...tool,server:provider.server});}return output;}
  async invoke(server:string,tool:string,input:Record<string,unknown>){const start=Date.now();try{if(!this.enabled)throw new Error('MCP is disabled');if(!this.servers.has(server)||!this.tools.has(`${server}:${tool}`))throw new Error('MCP server or tool is not allowlisted');const provider=this.providers.get(server);if(!provider)throw new Error('MCP server is not registered');const discovered=await provider.discover();if(!discovered.some(x=>x.name===tool&&x.readOnly))throw new Error('MCP tool is unavailable or not read-only');const result=await provider.invoke(tool,input);this.traces.push({server,tool,status:'success',latencyMs:Date.now()-start});return result;}catch(error){const message=error instanceof Error?error.message:String(error);this.traces.push({server,tool,status:'error',latencyMs:Date.now()-start,error:message});throw error;}}
  getTrace(){return [...this.traces];}
}
