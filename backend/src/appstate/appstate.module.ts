import { Body, Controller, Get, Injectable, Module, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsNumber, IsObject, IsOptional } from 'class-validator';
import * as fs from 'fs';
import * as path from 'path';
import { Public } from '../common/decorators/public.decorator';
import { ApiGateGuard } from '../common/guards/api-gate.guard';

class PutStateDto {
  @IsObject() state: Record<string, unknown>;
  @IsOptional() @IsNumber() rev?: number;
}

/**
 * Shared application state for the field app + customer portal, so every device
 * sees one live dataset (orders, cash handovers, captured docs sync across phones).
 * Stored as a single JSON blob with a monotonically increasing revision.
 * Pragmatic last-write-wins with client re-sync — right-sized for a small team.
 * (For heavier concurrency, migrate to the relational Prisma models.)
 */
@Injectable()
export class AppStateService {
  private readonly file = path.join(process.env.STATE_DIR || process.cwd(), 'data', 'appstate.json');
  private mem: { rev: number; state: any } = { rev: 0, state: null };

  constructor() {
    try {
      if (fs.existsSync(this.file)) this.mem = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (e) { /* start empty */ }
  }

  get() { return this.mem; }

  put(state: any) {
    this.mem = { rev: this.mem.rev + 1, state };
    this.persist();
    return { rev: this.mem.rev };
  }

  /** Admin "clear test data": reset the shared dataset to the empty initial shape
   *  ({ rev: 0, state: null }) so the next device to sync re-seeds it fresh. */
  clear() {
    this.mem = { rev: 0, state: null };
    this.persist();
    return { rev: this.mem.rev };
  }

  private persist() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.mem));
      fs.renameSync(tmp, this.file);
    } catch (e) { /* memory-only fallback */ }
  }
}

@ApiTags('Shared state')
@UseGuards(ApiGateGuard)
@Controller('appstate')
export class AppStateController {
  constructor(private readonly svc: AppStateService) {}

  @Public()
  @Get()
  get() { return this.svc.get(); }

  @Public()
  @Put()
  put(@Body() dto: PutStateDto) { return this.svc.put(dto.state); }
}

@Module({ controllers: [AppStateController], providers: [AppStateService], exports: [AppStateService] })
export class AppStateModule {}
