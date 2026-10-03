import { Injectable } from '@nestjs/common';
import type { AgentName, AgentToolCall } from './agent.types';

export interface ToolDefinition {
  name:string; description:string; inputSchema:Record<string,unknown>; outputSchema:Record<string,unknown>;
  allowedAgents:AgentName[]; timeoutMs:number; readOnly:true;
  validate(input:Record<string,unknown>):void; execute(input:Record<string,unknown>):Promise<unknown>;
}

@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<string,ToolDefinition>();
  register(tool:ToolDefinition):void { if(this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`); this.tools.set(tool.name,tool); }
  list(agent?:AgentName){ return [...this.tools.values()].filter((tool)=>!agent||tool.allowedAgents.includes(agent)).map(({execute:_,validate:__,...metadata})=>metadata); }
  async invoke(agent:AgentName, name:string, args:Record<string,unknown>):Promise<{result:unknown;call:AgentToolCall}> {
    const tool=this.tools.get(name); if(!tool) throw new Error(`Unknown tool: ${name}`);
    if(!tool.allowedAgents.includes(agent)) throw new Error(`Agent ${agent} is not allowed to call ${name}`);
    tool.validate(args); const started=Date.now(); const call:AgentToolCall={tool:name,arguments:args,startedAt:new Date().toISOString()};
    try { const result=await withTimeout(tool.execute(args),tool.timeoutMs,`Tool ${name}`); return {result,call:{...call,status:'success',latencyMs:Date.now()-started}}; }
    catch(error){ const message=error instanceof Error?error.message:String(error); throw Object.assign(new Error(message),{toolCall:{...call,status:'error',latencyMs:Date.now()-started,error:message}}); }
  }
}
export function requireString(input:Record<string,unknown>,name:string){ if(typeof input[name]!=='string'||!String(input[name]).trim()) throw new Error(`Invalid arguments: ${name} is required`); }
export async function withTimeout<T>(promise:Promise<T>,milliseconds:number,label:string):Promise<T>{ let timer:NodeJS.Timeout; try{return await Promise.race([promise,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out after ${milliseconds}ms`)),milliseconds);})]);}finally{clearTimeout(timer!);} }
