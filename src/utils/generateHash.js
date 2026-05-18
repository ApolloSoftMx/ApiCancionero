const bcrypt = require('bcryptjs');

async function main() {
    const hash = await bcrypt.hash('Admin123*', 10);
    console.log(hash);
}

main();