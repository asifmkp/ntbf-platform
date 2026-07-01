import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CustomerCategory, ProductStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CategoryPriceDto {
  @ApiProperty({ enum: CustomerCategory })
  @IsEnum(CustomerCategory)
  category: CustomerCategory;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price: number;
}

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  category: string;

  @ApiProperty({ example: 'kg' })
  @IsString()
  unit: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  stockQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  batchNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expiryDate?: string;

  @ApiProperty({ type: [CategoryPriceDto], description: 'Price per customer category' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryPriceDto)
  prices: CategoryPriceDto[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
