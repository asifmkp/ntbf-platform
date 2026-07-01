import { Body, Controller, Get, Module, Param, Patch, Post, Injectable } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessLevel, Department, UserRole } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Departments, MinAccessLevel, Roles } from '../common/decorators/access.decorator';

class TicketDto {
  @IsOptional() @IsString() customerId?: string;
  @IsString() subject: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() type?: string;
}
class RespondDto { @IsString() response: string; }

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: TicketDto) {
    return this.prisma.supportTicket.create({ data: { customerId: dto.customerId, subject: dto.subject, body: dto.body, type: dto.type ?? 'query' } });
  }
  open() {
    return this.prisma.supportTicket.findMany({ where: { status: { not: 'resolved' } }, orderBy: { createdAt: 'desc' } });
  }
  respond(id: string, response: string, userId: string) {
    return this.prisma.supportTicket.update({ where: { id }, data: { response, status: 'answered', handledById: userId } });
  }
  close(id: string) {
    return this.prisma.supportTicket.update({ where: { id }, data: { status: 'resolved' } });
  }
}

@ApiTags('Customer Service')
@ApiBearerAuth()
@Controller('support')
export class SupportController {
  constructor(private readonly svc: SupportService) {}

  // Customers raise tickets; Customer Service staff can also log them.
  @Roles(UserRole.CUSTOMER, UserRole.STAFF)
  @Post('tickets')
  create(@Body() dto: TicketDto) { return this.svc.create(dto); }

  @Departments(Department.CUSTOMER_SERVICE, Department.MANAGEMENT)
  @Get('tickets')
  open() { return this.svc.open(); }

  @Departments(Department.CUSTOMER_SERVICE)
  @Patch('tickets/:id/respond')
  respond(@Param('id') id: string, @Body() dto: RespondDto, @CurrentUser('id') uid: string) { return this.svc.respond(id, dto.response, uid); }

  // Closing/escalation resolution — Customer Service Admin.
  @Departments(Department.CUSTOMER_SERVICE)
  @MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)
  @Patch('tickets/:id/close')
  close(@Param('id') id: string) { return this.svc.close(id); }
}

@Module({ controllers: [SupportController], providers: [SupportService] })
export class SupportModule {}
