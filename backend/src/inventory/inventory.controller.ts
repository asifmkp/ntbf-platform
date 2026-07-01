import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Department } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Departments } from '../common/decorators/access.decorator';
import { InventoryService } from './inventory.service';
import { AdjustStockDto, TransferStockDto } from './dto/inventory.dto';

@ApiTags('Inventory & Warehouse')
@ApiBearerAuth()
@Controller()
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Departments(Department.WAREHOUSE, Department.PURCHASE, Department.MANAGEMENT)
  @Get('inventory/:warehouseId')
  byWarehouse(@Param('warehouseId') warehouseId: string) {
    return this.inventory.byWarehouse(warehouseId);
  }

  @Departments(Department.WAREHOUSE, Department.PURCHASE, Department.MANAGEMENT)
  @Get('inventory/check/:productId')
  availability(@Param('productId') productId: string) {
    return this.inventory.availability(productId);
  }

  @Departments(Department.WAREHOUSE, Department.MANAGEMENT)
  @Post('inventory/adjustments')
  adjust(@CurrentUser('id') userId: string, @Body() dto: AdjustStockDto) {
    return this.inventory.adjust({ ...dto, adjustedById: userId });
  }

  @Departments(Department.WAREHOUSE, Department.MANAGEMENT)
  @Post('stock-transfers')
  transfer(@CurrentUser('id') userId: string, @Body() dto: TransferStockDto) {
    return this.inventory.transfer({ ...dto, initiatedById: userId });
  }

  @Departments(Department.WAREHOUSE, Department.MANAGEMENT)
  @Patch('stock-transfers/:id/receive')
  receive(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.inventory.receiveTransfer(id, userId);
  }
}
