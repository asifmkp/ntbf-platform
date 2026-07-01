import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Department, POSelectionMethod, SupplierStatus } from '@prisma/client';
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

// ---- Suppliers ----
export class CreateSupplierDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactInfo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentTerms?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() rating?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() productsSupplied?: string[];
}
export class UpdateSupplierDto {
  @ApiPropertyOptional() @IsOptional() @IsString() contactInfo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentTerms?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() rating?: number;
  @ApiPropertyOptional({ enum: SupplierStatus }) @IsOptional() @IsEnum(SupplierStatus) status?: SupplierStatus;
}

// ---- Requisition ----
export class RequisitionItemDto {
  @ApiProperty() @IsString() product: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
}
export class CreateRequisitionDto {
  @ApiProperty({ type: [RequisitionItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => RequisitionItemDto)
  items: RequisitionItemDto[];

  @ApiPropertyOptional({ enum: Department })
  @IsOptional() @IsEnum(Department) sourceDepartment?: Department;
}

// ---- Quotation ----
export class CreateQuotationDto {
  @ApiProperty() @IsString() supplierId: string;
  @ApiProperty() @IsNumber() @Min(0) quotedPrice: number;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentTerms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deliveryLeadTime?: string;
}

// ---- Purchase Order ----
export class POItemDto {
  @ApiProperty() @IsString() product: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
  @ApiProperty() @IsNumber() @Min(0) unitPrice: number;
}
export class CreatePurchaseOrderDto {
  @ApiProperty() @IsString() supplierId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() requisitionId?: string;
  @ApiProperty({ type: [POItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => POItemDto)
  items: POItemDto[];
  @ApiPropertyOptional({ enum: POSelectionMethod })
  @IsOptional() @IsEnum(POSelectionMethod) selectionMethod?: POSelectionMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentTerms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expectedDate?: string;
}

// ---- GRN ----
export class GrnItemDto {
  @ApiProperty() @IsString() product: string;
  @ApiProperty() @IsInt() qtyOrdered: number;
  @ApiProperty() @IsInt() qtyReceived: number;
  @ApiPropertyOptional() @IsOptional() @IsString() batchNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expiryDate?: string;
  @ApiProperty({ description: 'Warehouse inventory id this product lands in' })
  @IsString() inventoryProductId: string;
}
export class CreateGrnDto {
  @ApiProperty() @IsString() poId: string;
  @ApiProperty() @IsString() warehouseId: string;
  @ApiProperty({ type: [GrnItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => GrnItemDto)
  itemsReceived: GrnItemDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// ---- Supplier Invoice ----
export class CreateSupplierInvoiceDto {
  @ApiProperty() @IsString() poId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() grnId?: string;
  @ApiProperty() @IsString() invoiceNo: string;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
}
