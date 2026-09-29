import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { AuthModule } from './auth';
import { CatalogController, CatalogService, CategoriesController, DiscoveryController, StoresController } from './catalog';
import { CheckoutController, CheckoutService, CustomerOrdersController, calculateCommission, resolveCommissionBps } from './checkout';
import { AdminController, dashboardProviders, SellerController } from './dashboards';
import { PrismaModule } from './prisma';
import { AddressesController } from './addresses';
import { ProductMediaController,ProductMediaService } from './media';
import { APP_FILTER } from '@nestjs/core';
import { UploadSizeFilter } from './upload-filter';
import {PaymentsController,PaymentsService} from './payments';
import {AdminOrdersManagementController,CustomerOrderManagementController,OrdersService,SellerOrderManagementController} from './orders';
import {PrismaService} from './prisma';

export { calculateCommission, resolveCommissionBps };

@Controller()
class HealthController {
  constructor(private readonly db:PrismaService){}
  @Get('health') health() { return { status: 'ok', service: 'shuk-api' }; }
  @Get('health/ready') async ready(){try{await this.db.$queryRaw`SELECT 1`;return{status:'ready',service:'shuk-api',checks:{database:'up'}}}catch{throw new ServiceUnavailableException({status:'not_ready',service:'shuk-api',checks:{database:'down'}})}}
}

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [HealthController, AddressesController, CatalogController, CategoriesController, StoresController, DiscoveryController, CheckoutController, CustomerOrdersController, CustomerOrderManagementController, PaymentsController, SellerController, SellerOrderManagementController, ProductMediaController, AdminController, AdminOrdersManagementController],
  providers: [CatalogService, CheckoutService, OrdersService, PaymentsService, ProductMediaService, ...dashboardProviders,{provide:APP_FILTER,useClass:UploadSizeFilter}],
})
export class AppModule {}
