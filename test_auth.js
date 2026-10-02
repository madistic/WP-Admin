const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function testAuth() {
  const testEmail = process.env.TEST_EMAIL || 'test@example.com';
  const prisma = new PrismaClient();
  const user = await prisma.user.findUnique({
    where: { email: testEmail }
  });

  if (!user) {
    console.log("User not found");
    return;
  }
  
  const candidate = process.env.TEST_PASSWORD || '';
  if (candidate) {
    const isValid = await bcrypt.compare(candidate, user.password_hash);
    console.log("Candidate valid:", isValid);
  }
}

testAuth().catch(console.error).finally(() => process.exit(0));
