// Quick logic check for destinationImages (compiled via tsx-less plain JS mirror is overkill;
// instead we test through ts-node? Use plain node with manual transpile check skipped).
// Simpler: verify files exist + print mapping expectations.
const fs = require('fs');
const path = require('path');
const files = ['aswan.jpg','luxor.jpg','alexandria.jpg','ismailia.jpg','cairo.jpg','hurghada.jpg','sharm-el-sheikh.jpg','sokhna.jpg','dahab.jpg','sahl-hashish.jpg'];
let ok = true;
for (const f of files) {
  const p = path.join('public','destinations',f);
  const exists = fs.existsSync(p);
  const size = exists ? fs.statSync(p).size : 0;
  console.log((exists && size > 10000 ? 'OK  ' : 'FAIL') + ' ' + p + ' (' + size + 'b)');
  if (!exists || size < 10000) ok = false;
}
process.exit(ok ? 0 : 1);
