import { BadRequestException,Controller, Get, Injectable, NotFoundException, Param, Query } from '@nestjs/common';
import { ProductStatus, Prisma, SellerStatus } from '@prisma/client';
import { IsBooleanString, IsIn, IsInt, IsNumber,IsOptional, IsString, Max,MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from './prisma';

class ProductsQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(100) seller?: string;
  @IsOptional() @IsBooleanString() inStock?: string;
  @IsOptional() @Type(() => Number) @IsNumber({maxDecimalPlaces:2}) @Min(0) minPrice?:number;
  @IsOptional() @Type(() => Number) @IsNumber({maxDecimalPlaces:2}) @Min(0) maxPrice?:number;
  @IsOptional() @IsIn(['newest', 'price_asc', 'price_desc', 'rating']) sort: string = 'newest';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(48) limit = 12;
}

const productSelect = {
  id: true, slug: true, sku: true, nameHe: true, descriptionHe: true, priceAgorot: true, compareAtAgorot: true, supportsFastDelivery: true,
  images: { orderBy: { position: 'asc' as const }, select: { id:true,storageUrl: true, altText: true,position:true } },
  category: { select: { slug: true, nameHe: true } },
  seller: { select: { rating: true, store: { select: { slug: true, name: true, city: true, logoUrl: true } } } },
  variants: { select: { id: true, name: true, priceAgorot: true, inventory: { select: { quantity: true, reserved: true } } } },
};

@Injectable()
export class CatalogService {
  constructor(private readonly db: PrismaService) {}
  private map(product: Prisma.ProductGetPayload<{ select: typeof productSelect }>) {
    return { ...product, rating: Number(product.seller.rating), availableQuantity: product.variants.reduce((sum, variant) => sum + Math.max(0, (variant.inventory?.quantity ?? 0) - (variant.inventory?.reserved ?? 0)), 0) };
  }
  async list(query: ProductsQueryDto) {
    const where: Prisma.ProductWhereInput = { status: ProductStatus.ACTIVE, deletedAt: null, seller:{status:SellerStatus.APPROVED} };
    const search=(query.search??query.q)?.trim();if(search)where.OR=[{nameHe:{contains:search,mode:'insensitive'}},{nameAr:{contains:search,mode:'insensitive'}},{nameEn:{contains:search,mode:'insensitive'}},{sku:{contains:search,mode:'insensitive'}}];
    if(query.minPrice!==undefined&&query.maxPrice!==undefined&&query.minPrice>query.maxPrice)throw new BadRequestException('מחיר מינימום אינו יכול להיות גבוה ממחיר מקסימום');
    if(query.minPrice!==undefined||query.maxPrice!==undefined)where.priceAgorot={...(query.minPrice!==undefined?{gte:Math.round(query.minPrice*100)}:{}),...(query.maxPrice!==undefined?{lte:Math.round(query.maxPrice*100)}:{})};
    if (query.category) where.category = { OR: [{ slug: query.category }, { parent: { slug: query.category } }] };
    if (query.seller) where.seller = { store: { slug: query.seller } };
    if (query.inStock === 'true') where.variants = { some: { inventory: { quantity: { gt: 0 } } } };
    const orderBy: Prisma.ProductOrderByWithRelationInput = query.sort === 'price_asc' ? { priceAgorot: 'asc' } : query.sort === 'price_desc' ? { priceAgorot: 'desc' } : query.sort === 'rating' ? { seller: { rating: 'desc' } } : { createdAt: 'desc' };
    const [products, total] = await this.db.$transaction([this.db.product.findMany({ where, select: productSelect, orderBy, skip: (query.page - 1) * query.limit, take: query.limit }), this.db.product.count({ where })]);
    return { data: products.map((p) => this.map(p)), pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
  }
  async bySlug(slug: string) {
    const product = await this.db.product.findFirst({ where: { slug, status: ProductStatus.ACTIVE, deletedAt: null, seller:{status:SellerStatus.APPROVED} }, select: productSelect });
    if (!product) throw new NotFoundException('המוצר לא נמצא');
    const [related, moreFromStore, reviewCount] = await this.db.$transaction([
      this.db.product.findMany({ where: { category: { slug: product.category.slug }, status: ProductStatus.ACTIVE, id: { not: product.id }, deletedAt: null, seller:{status:SellerStatus.APPROVED} }, select: productSelect, orderBy: { createdAt: 'desc' }, take: 8 }),
      this.db.product.findMany({ where: { seller: { store: { slug: product.seller.store?.slug ?? '__no-store__' },status:SellerStatus.APPROVED }, status: ProductStatus.ACTIVE, id: { not: product.id }, deletedAt: null }, select: productSelect, orderBy: { createdAt: 'desc' }, take: 4 }),
      this.db.review.count({ where: { productId: product.id, status: 'APPROVED' } }),
    ]);
    return { ...this.map(product), reviewCount, related: related.map((p) => this.map(p)), moreFromStore: moreFromStore.map((p) => this.map(p)) };
  }
}

@Controller('products')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get() list(@Query() query: ProductsQueryDto) { return this.catalog.list(query); }
  @Get(':slug') one(@Param('slug') slug: string) { return this.catalog.bySlug(slug); }
}

@Controller('categories')
export class CategoriesController {
  constructor(private readonly db: PrismaService) {}
  @Get() list() { return this.db.category.findMany({ where: { active: true }, orderBy: { position: 'asc' }, select: { id: true, slug: true, nameHe: true, nameAr: true, nameEn: true, parentId: true, children: { where: { active: true }, orderBy: { position: 'asc' }, select: { id: true, slug: true, nameHe: true } } } }); }
}

@Controller('stores')
export class StoresController {
  constructor(private readonly db: PrismaService) {}
  @Get(':slug') async one(@Param('slug') slug: string) {
    const store = await this.db.store.findFirst({ where: { slug,seller:{status:SellerStatus.APPROVED} }, select: { slug: true, name: true, description: true, city: true, logoUrl: true, seller: { select: { rating: true, verificationLevel: true } } } });
    if (!store) throw new NotFoundException('החנות לא נמצאה');
    return store;
  }
}

@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly db: PrismaService) {}
  @Get('sitemap')
  async sitemap() {
    const [categories, stores, products] = await this.db.$transaction([
      this.db.category.findMany({ where: { active: true }, select: { slug: true }, orderBy: { position: 'asc' } }),
      this.db.store.findMany({ where: { seller: { status: SellerStatus.APPROVED, products: { some: { status: ProductStatus.ACTIVE, deletedAt: null } } } }, select: { slug: true } }),
      this.db.product.findMany({ where: { status: ProductStatus.ACTIVE, deletedAt: null, seller: { status: SellerStatus.APPROVED } }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
    ]);
    return { categories, stores, products };
  }
}
