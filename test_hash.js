const bcrypt = require('bcryptjs');
async function test() {
  const hash = '$2b$10$PWd1w7Gp/N0pXa1Y7oZ2.ONR1S1aJqJjWpG50x.e5N9H35M/mR076';
  console.log('password123', await bcrypt.compare('password123', hash));
}
test();
