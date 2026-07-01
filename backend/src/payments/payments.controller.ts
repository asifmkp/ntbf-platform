import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessLevel, Department, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  Departments,
  MinAccessLevel,
  Roles,
} from '../common/decorators/access.decorator';
import { PaymentsService } from './payments.service';
import { ClearChequeDto, RecordPaymentDto } from './dto/payment.dto';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // Drivers collect at delivery; Finance can also record.
  @Roles(UserRole.DRIVER, UserRole.STAFF)
  @Post()
  record(@CurrentUser('id') collectorId: string, @Body() dto: RecordPaymentDto) {
    return this.payments.record(collectorId, dto);
  }

  // Mark cheque cleared/bounced — Finance (admin marks status).
  @Departments(Department.FINANCE)
  @MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)
  @Patch(':id/clear')
  clear(@Param('id') id: string, @Body() dto: ClearChequeDto) {
    return this.payments.clearCheque(id, dto.cleared);
  }

  // Sales records recovery of a bounced payment → auto-releases hold.
  @Departments(Department.SALES)
  @Patch(':id/recover')
  recover(@Param('id') id: string) {
    return this.payments.recover(id);
  }

  @Roles(UserRole.DRIVER, UserRole.STAFF)
  @Post(':id/receipt')
  receipt(@Param('id') id: string) {
    return this.payments.receipt(id);
  }
}
