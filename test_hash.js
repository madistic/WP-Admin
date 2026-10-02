const bcrypt = require('bcryptjs');
async function test() {
  const candidate = process.env.TEST_PASSWORD || '';
  if (!candidate) return;
  console.log('Result:', await bcrypt.compare(candidate, hash));
}
test();
