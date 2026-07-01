import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CustomerCategory, Department } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Departments } from '../common/decorators/access.decorator';
import { CatalogService } from './catalog.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

@ApiTags('Catalog')
@Controller('products')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // ---- Public / customer-facing reads (real-time stock + per-category price) ----
  @Public()
  @Get()
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'inStockOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'customerCategory', required: false, enum: CustomerCategory })
  list(
    @Query('category') category?: string,
    @Query('inStockOnly') inStockOnly?: string,
    @Query('customerCategory') customerCategory?: CustomerCategory,
  ) {
    return this.catalog.list({
      category,
      inStockOnly: inStockOnly === 'true',
      customerCategory,
    });
  }

  @Public()
  @Get(':id')
  @ApiQuery({ name: 'customerCategory', required: false, enum: CustomerCategory })
  findOne(@Param('id') id: string, @Query('customerCategory') customerCategory?: CustomerCategory) {
    return this.catalog.findOne(id, customerCategory);
  }

  // ---- Catalog Management (Admin view, Warehouse/Sales staff) ----
  @ApiBearerAuth()
  @Departments(Department.WAREHOUSE, Department.SALES, Department.MANAGEMENT)
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.catalog.create(dto);
  }

  @ApiBearerAuth()
  @Departments(Department.WAREHOUSE, Department.SALES, Department.MANAGEMENT)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.catalog.update(id, dto);
  }

  @ApiBearerAuth()
  @Departments(Department.WAREHOUSE, Department.MANAGEMENT)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.catalog.remove(id);
  }
}
