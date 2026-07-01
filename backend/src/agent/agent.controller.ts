import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { ApiGateGuard } from '../common/guards/api-gate.guard';
import { AgentService } from './agent.service';

class ChatDto {
  @IsOptional()
  @IsString()
  role: string;

  @IsArray()
  messages: any[];
}

/**
 * Role-aware copilot. The browser drives the tool loop: it posts the
 * conversation, gets back Claude's reply (possibly tool_use blocks),
 * executes those tools against the live app data, then posts the
 * tool_result back for the next turn.
 */
@ApiTags('Copilot agent')
@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Public()
  @Get('status')
  status() {
    return this.agent.status();
  }

  @Public()
  @UseGuards(ApiGateGuard)
  @Post('chat')
  chat(@Body() dto: ChatDto) {
    return this.agent.chat(dto.role, dto.messages);
  }
}
