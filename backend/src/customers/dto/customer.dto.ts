import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerCategory } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty()
  @IsString()
  businessName: string;

  @ApiProperty({ enum: CustomerCategory })
  @IsEnum(CustomerCategory)
  category: CustomerCategory;

  @ApiPropertyOptional({ description: 'Requested credit limit' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  // Salesman captures the customer's GPS at the point of visit.
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressLine?: string;
}

export class SetCreditDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  creditLimit: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  creditPeriodDays: number;
}

export class UpdateLocationDto {
  @ApiProperty()
  @IsNumber()
  lat: number;

  @ApiProperty()
  @IsNumber()
  lng: number;
}
