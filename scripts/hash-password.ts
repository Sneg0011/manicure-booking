import { hashPassword } from '../src/auth/password';

const plain = process.argv[2];
if (!plain) {
  process.stderr.write('Использование: npm run hash-password -- <пароль>\n');
  process.exitCode = 1;
} else {
  process.stdout.write(`${hashPassword(plain)}\n`);
}
