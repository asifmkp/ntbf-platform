import { Module } from '@nestjs/common';
import { AnthropicService } from '../ai/anthropic.service';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  controllers: [AgentController],
  providers: [AgentService, AnthropicService],
})
export class AgentModule {}
