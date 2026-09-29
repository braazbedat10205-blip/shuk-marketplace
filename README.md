# Shuk — Israeli multi-vendor marketplace MVP

Hebrew-first, RTL marketplace monorepo. One checkout is split into seller orders; prices and commissions use integer agorot; financial movements are append-only ledger entries.

## Run

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev
```

Web: `http://localhost:3000` · API: `http://localhost:4000/api`

## Architecture and relationships

### Identity and tenancy

`User` owns roles, customer addresses, carts and orders. A seller has one `SellerProfile` and one `Store`; every seller-owned API resource is scoped by that seller id. Seller status and product status are moderated independently by admins.

### Catalog and inventory

`Store → Product → ProductVariant → Inventory`. Categories form a self-referencing tree. Product imagery is stored as object-storage URLs. Search uses PostgreSQL-compatible fields now and can later publish catalog events to OpenSearch.

### Checkout and money

`Order` is the customer checkout. It contains `SellerOrder` records, one per seller, each with immutable `OrderItem` snapshots. All money is integer ILS agorot. Commission precedence is product → seller → category → global. `LedgerEntry` is append-only and reversals create new entries.

### Payment and delivery

Payment providers implement a token-based adapter and never expose raw card data. Each seller order can have its own `Shipment`; providers and tracking events are normalized so multiple couriers can coexist.

## MVP notes

The included UI uses safe demo data and local cart state so it is immediately explorable. API modules provide health, catalog, checkout calculation and seller/admin summaries. Connect a real payment/courier adapter only after legal and provider requirements are confirmed.
