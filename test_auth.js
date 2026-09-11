const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function testAuth() {
  const prisma = new PrismaClient();
  const user = await prisma.user.findUnique({
    where: { email: 'admin@spiceroute.com' }
  });

  if (!user) {
    console.log("User not found");
    return;
  }
  
  console.log("User:", user);
  const passwordsToTest = ['admin', 'password', 'admin123', 'spiceroute'];
  
  for (const p of passwordsToTest) {
    const isValid = await bcrypt.compare(p, user.password_hash);
    console.log(`Password '${p}' valid:`, isValid);
  }
}

testAuth().catch(console.error).finally(() => process.exit(0));
