// RFC 6238 단위 검증 — functions/_shared/totp.js (Google Authenticator 호환).
//   node scripts/test-totp.mjs
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const { base32Encode, base32Decode, totp, verifyTotp } =
  await import(resolve(here, '../functions/_shared/totp.js'));

const secret = base32Encode(new TextEncoder().encode('12345678901234567890'));
const vectors = [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],
  [1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']];
let fail = 0;
for (const [t, exp] of vectors) {
  const got = await totp(secret, t, { digits: 8 });
  if (got !== exp) { console.log(`FAIL T=${t} got ${got} exp ${exp}`); fail++; }
}
const c = await totp(secret, 1234567890, { digits: 6 });
const vOk = (await verifyTotp(secret, c, 1234567890)) && (await verifyTotp(secret, c, 1234567920))
  && !(await verifyTotp(secret, c, 1234568010)) && !(await verifyTotp(secret, '000000', 1234567890));
if (!vOk) { console.log('FAIL verify window'); fail++; }
console.log(fail === 0 ? `OK — ${vectors.length} RFC vectors + verify window pass` : `${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
