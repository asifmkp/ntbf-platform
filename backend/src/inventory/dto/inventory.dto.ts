import { ApiProperty } from '@nestjs/swagger';
import { StockAdjustmentReason } from '@prisma/client';
import { IsEnum, IsInt, IsString } from 'class-validator';

export class AdjustStockDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty()
  @IsString()
  warehouseId: string;

  @ApiProperty({ description: 'Positive to add, negative to write off' })
  @IsInt()
  quantityChange: number;

  @ApiProperty({ enum: StockAdjustmentReason })
  @IsEnum(StockAdjustmentReason)
  reason: StockAdjustmentReason;
}

export class TransferStockDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty()
  @IsInt()
  quantity: number;

  @ApiProperty()
  @IsString()
  fromWarehouseId: string;

  @ApiProperty()
  @IsString()
  toWarehouseId: string;
}
