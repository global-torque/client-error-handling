import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const packageDirectory = path.resolve(import.meta.dirname, '..');
const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'client-error-api-docs-'),
);

const run = (args) => {
  const result = spawnSync('pnpm', args, {
    cwd: packageDirectory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(
      `pnpm ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`,
    );
  }
};

const canonicalDocument = (contents) =>
  `${contents
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trimEnd()}\n`;

const snapshot = (directory) =>
  Object.fromEntries(
    fs
      .readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => [
        entry.name,
        canonicalDocument(
          fs.readFileSync(path.join(directory, entry.name), 'utf8'),
        ),
      ])
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );

try {
  run([
    'exec',
    'api-documenter',
    'markdown',
    '--input',
    path.join('temp', 'root'),
    '--output',
    temporaryDirectory,
  ]);
  const committed = path.join(packageDirectory, 'docs', 'api');
  if (
    JSON.stringify(snapshot(temporaryDirectory)) !==
    JSON.stringify(snapshot(committed))
  ) {
    throw new Error('docs/api is stale; run pnpm run docs:api.');
  }
  console.info('Generated client-error API documentation is current.');
} finally {
  fs.rmSync(temporaryDirectory, { force: true, recursive: true });
}
