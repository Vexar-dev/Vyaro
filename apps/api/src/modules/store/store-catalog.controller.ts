import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/roles.decorator';
import { StoreCatalogService } from './store-catalog.service';

@Controller('store')
export class StoreCatalogController {
  constructor(private readonly catalog: StoreCatalogService) {}

  @Public()
  @Get('categories')
  listCategories() {
    return this.catalog.listCategories();
  }

  @Public()
  @Get('products')
  listProducts(@Query('category') category?: string) {
    return this.catalog.listProducts(category);
  }

  @Public()
  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    if (!/^\d+$/.test(id)) throw new BadRequestException({ code: 'PRODUCT_NOT_FOUND', message: 'المنتج غير موجود' });
    return this.catalog.getProduct(BigInt(id));
  }
}
