import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Department, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Departments, Roles } from '../common/decorators/access.decorator';
import { OrdersService } from './orders.service';
import { PlaceOrderDto, UpdateOrderStatusDto } from './dto/order.dto';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Roles(UserRole.CUSTOMER)
  @Post('orders')
  place(@CurrentUser('id') userId: string, @Body() dto: PlaceOrderDto) {
    return this.orders.place(userId, dto);
  }

  @Get('orders/:id')
  findOne(@Param('id') id: string) {
    return this.orders.findOne(id);
  }

  @Get('orders/:id/tracking')
  tracking(@Param('id') id: string) {
    return this.orders.tracking(id);
  }

  @Roles(UserRole.CUSTOMER)
  @Get('orders/history/me')
  history(@CurrentUser('id') userId: string) {
    return this.orders.history(userId);
  }

  // Admin (Order Management) or Driver delivery status updates.
  @Departments(Department.SALES, Department.DELIVERY, Department.WAREHOUSE, Department.MANAGEMENT)
  @Patch('orders/:id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orders.updateStatus(id, dto.status);
  }
}
