import { authOptions } from './src/lib/auth';
import prisma from './src/lib/prisma';
import bcrypt from 'bcryptjs';

async function testAuthorize() {
  try {
    const testEmail = process.env.TEST_EMAIL || 'test@example.com';
    const testPassword = process.env.TEST_PASSWORD || '';
    const user = await prisma.user.findUnique({
      where: { email: testEmail }
    });
    console.log("User fetched:", user ? "yes" : "no", user?.is_active);
    if (user && testPassword) {
      const isValid = await bcrypt.compare(testPassword, user.password_hash);
      console.log("Is valid:", isValid);
    }
  } catch (e) {
    console.error("Authorize error:", e);
  }
}

testAuthorize().catch(console.error).finally(() => process.exit(0));
