import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../src/', import.meta.url);
for (const file of readdirSync(root).filter(name => name.endsWith('.js'))) {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL(file, root))], { stdio: 'inherit' });
}
execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../vite.config.js', import.meta.url))], { stdio: 'inherit' });
console.log('前端 JavaScript 语法检查通过');
