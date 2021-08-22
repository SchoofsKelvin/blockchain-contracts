
const fs = require('fs');

for (const file of fs.readdirSync('./typechain')) {
    if (!file.endsWith('.d.ts')) continue;
    fs.copyFileSync(`./typechain/${file}`, `./dist/typechain/${file}`);
}
for (const file of fs.readdirSync('./typechain/factories')) {
    if (!file.endsWith('.d.ts')) continue;
    fs.copyFileSync(`./typechain/factories/${file}`, `./dist/typechain/factories/${file}`);
}
