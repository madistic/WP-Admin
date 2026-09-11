import { authOptions } from './src/lib/auth';
import prisma from './src/lib/prisma';
import bcrypt from 'bcryptjs';

async function testAuthorize() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'admin@spiceroute.com' }
    });
    console.log("User fetched:", user ? "yes" : "no", user?.is_active);
    if (user) {
      const isValid = await bcrypt.compare('admin', user.password_hash);
      console.log("Is valid with 'admin':", isValid);
    }
  } catch (e) {
    console.error("Authorize error:", e);
  }
}

testAuthorize().catch(console.error).finally(() => process.exit(0));
