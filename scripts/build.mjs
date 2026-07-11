import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const packageDirectory = path.resolve(import.meta.dirname, '..');
const distDirectory = path.join(packageDirectory, 'dist');
fs.rmSync(distDirectory, { force: true, recursive: true });

const result = spawnSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json'], {
  cwd: packageDirectory,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
if (result.status !== 0) {
  throw new Error(
    `TypeScript build failed:\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  );
}

// The public `./types` subpath intentionally emits an empty ESM runtime module.
// TypeScript creates an empty mappings table for a type-only source, which is
// not a usable source map. Keep the module and declaration, but do not publish
// a misleading map reference for it.
const typeModulePath = path.join(distDirectory, 'types.js');
const typeModule = fs.readFileSync(typeModulePath, 'utf8');
fs.writeFileSync(
  typeModulePath,
  typeModule.replace(/\n?\/\/# sourceMappingURL=types\.js\.map\s*$/u, '\n'),
);
fs.rmSync(path.join(distDirectory, 'types.js.map'), { force: true });
