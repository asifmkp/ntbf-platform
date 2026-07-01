import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessLevel, Department } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  Departments,
  MinAccessLevel,
} from '../common/decorators/access.decorator';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, SetCreditDto, UpdateLocationDto } from './dto/customer.dto';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  // Sales staff submit; Sales Admin approves.
  @Departments(Department.SALES)
  @Post()
  create(@CurrentUser('id') salesmanId: string, @Body() dto: CreateCustomerDto) {
    return this.customers.create(salesmanId, dto);
  }

  @Departments(Department.SALES)
  @MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)
  @Patch(':id/approve')
  approve(@Param('id') id: string, @CurrentUser('id') approverId: string) {
    return this.customers.approve(id, approverId);
  }

  @Departments(Department.SALES)
  @Patch(':id/location')
  updateLocation(
    @Param('id') id: string,
    @CurrentUser('id') salesmanId: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.customers.updateLocation(id, salesmanId, dto);
  }

  // Credit limit & period — Finance Admin only.
  @Departments(Department.FINANCE)
  @MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)
  @Patch(':id/credit')
  setCredit(
    @Param('id') id: string,
    @CurrentUser('id') approverId: string,
    @Body() dto: SetCreditDto,
  ) {
    return this.customers.setCredit(id, approverId, dto);
  }

  @Departments(Department.FINANCE, Department.SALES)
  @Get(':id/credit')
  getCredit(@Param('id') id: string) {
    return this.customers.getCredit(id);
  }
}
