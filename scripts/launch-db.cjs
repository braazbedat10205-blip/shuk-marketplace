const path = require("node:path");

require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { PrismaClient } = require("@prisma/client");

const TEST_DATABASE_NAME = "shuk_launch_readiness_test";

function databaseUrlFor(databaseName) {
  const source = process.env.DATABASE_URL;
  if (!source) throw new Error("DATABASE_URL is not configured");
  const url = new URL(source);
  url.pathname = `/${databaseName}`;
  url.searchParams.delete("schema");
  return url.toString();
}

async function inspect(prisma) {
  const [connection] = await prisma.$queryRawUnsafe(
    "SELECT current_database() AS database, current_user AS username",
  );
  return {
    database: connection.database,
    counts: {
      users: await prisma.user.count(),
      sellers: await prisma.sellerProfile.count(),
      products: await prisma.product.count(),
      orders: await prisma.order.count(),
      payments: await prisma.payment.count(),
    },
  };
}

async function main() {
  const command = process.argv[2] || "inspect-current";
  const current = new PrismaClient();

  try {
    if (command === "inspect-current") {
      console.log(JSON.stringify(await inspect(current), null, 2));
      return;
    }

    const [{ database: currentDatabase }] = await current.$queryRawUnsafe(
      "SELECT current_database() AS database",
    );
    if (currentDatabase === TEST_DATABASE_NAME) {
      throw new Error("Refusing to manage a test database from the test database connection");
    }

    if (command === "create-test") {
      const existing = await current.$queryRawUnsafe(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        TEST_DATABASE_NAME,
      );
      if (existing.length === 0) {
        await current.$executeRawUnsafe(`CREATE DATABASE ${TEST_DATABASE_NAME}`);
      }
      console.log(JSON.stringify({ created: existing.length === 0, database: TEST_DATABASE_NAME }));
      return;
    }

    if (command === "print-test-url") {
      process.stdout.write(databaseUrlFor(TEST_DATABASE_NAME));
      return;
    }

    if (command === "inspect-test") {
      const test = new PrismaClient({ datasourceUrl: databaseUrlFor(TEST_DATABASE_NAME) });
      try {
        console.log(JSON.stringify(await inspect(test), null, 2));
      } finally {
        await test.$disconnect();
      }
      return;
    }

    throw new Error(`Unknown command: ${command}`);
  } finally {
    await current.$disconnect();
  }
}

main().catch((error) => {
  const safeMessage = String(error?.message || error).replace(/postgresql:\/\/\S+/gi, "<redacted-url>");
  console.error(safeMessage);
  process.exitCode = 1;
});
