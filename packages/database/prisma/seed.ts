import { hash } from 'bcryptjs';
import { PrismaClient, ProductStatus, Role, SellerStatus } from '@prisma/client';

const db = new PrismaClient();
const cities = ['תל אביב', 'חיפה', 'ירושלים', 'באר שבע', 'אילת', 'עכו'];
const categoryNames = ['אלקטרוניקה', 'אופנה', 'לבית', 'טיפוח', 'ספורט', 'ילדים', 'לרכב', 'מתנות'];

async function main() {
  const passwordHash = await hash('ShukDemo123!', 12);
  await db.user.upsert({
    where: { email: 'admin@shuk.test' }, update: { passwordHash },
    create: { email: 'admin@shuk.test', passwordHash, firstName: 'מנהל', lastName: 'שוק', roles: { create: [{ role: Role.ADMIN }, { role: Role.CUSTOMER }] } },
  });
  const categories = await Promise.all(categoryNames.map((nameHe, index) => db.category.upsert({
    where: { slug: `category-${index + 1}` }, update: { nameHe }, create: { slug: `category-${index + 1}`, nameHe, nameEn: `Category ${index + 1}`, position: index },
  })));
  for (let sellerNumber = 1; sellerNumber <= 20; sellerNumber++) {
    const email = `seller${sellerNumber}@example.test`;
    const user = await db.user.upsert({
      where: { email }, update: { passwordHash },
      create: { email, passwordHash, firstName: 'מוכר', lastName: `דמו ${sellerNumber}`, roles: { create: [{ role: Role.SELLER }, { role: Role.CUSTOMER }] } },
    });
    const seller = await db.sellerProfile.upsert({
      where: { userId: user.id }, update: {},
      create: { userId: user.id, businessName: `חנות מקומית ${sellerNumber}`, status: SellerStatus.APPROVED, verificationLevel: sellerNumber % 4 === 0 ? 'TOP' : 'VERIFIED', rating: (44 + (sellerNumber % 6)) / 10, store: { create: { slug: `local-store-${sellerNumber}`, name: `חנות מקומית ${sellerNumber}`, city: cities[sellerNumber % cities.length] } } },
    });
    for (let productNumber = 1; productNumber <= 10; productNumber++) {
      const slug = `demo-product-${sellerNumber}-${productNumber}`;
      await db.product.upsert({
        where: { slug }, update: {},
        create: { sellerId: seller.id, categoryId: categories[(sellerNumber + productNumber) % categories.length].id, slug, sku: `D-${sellerNumber}-${productNumber}`, nameHe: `מוצר מקומי ${sellerNumber}-${productNumber}`, nameEn: `Local product ${sellerNumber}-${productNumber}`, descriptionHe: 'מוצר דמו איכותי מחנות מקומית מאומתת.', status: ProductStatus.ACTIVE, priceAgorot: 9900 + ((sellerNumber * productNumber) % 25) * 1000, compareAtAgorot: 14900 + ((sellerNumber * productNumber) % 25) * 1000, supportsFastDelivery: (sellerNumber + productNumber) % 3 !== 0, variants: { create: { sku: `D-${sellerNumber}-${productNumber}-STD`, name: 'רגיל', inventory: { create: { quantity: 10 + (sellerNumber * productNumber) % 40 } } } } },
      });
    }
  }
}

main().finally(() => db.$disconnect());
