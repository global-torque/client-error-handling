import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const releaseDirectory = path.resolve(process.argv[2] ?? 'release');
const manager = process.argv[3];
if (manager !== 'npm' && manager !== 'pnpm') {
  throw new Error(
    'Usage: verify-installed-artifact.mjs <release-dir> <npm|pnpm>',
  );
}

const sidecars = fs
  .readdirSync(releaseDirectory)
  .filter((name) => name.endsWith('.tgz.manifest.json'));
if (sidecars.length !== 1) {
  throw new Error('Expected exactly one artifact manifest');
}
const manifest = JSON.parse(
  fs.readFileSync(path.join(releaseDirectory, sidecars[0]), 'utf8'),
);
const artifactPath = path.join(releaseDirectory, manifest.artifact);
const dependencySpecs = JSON.parse(
  fs.readFileSync(
    new URL('../.github/release-dependencies.json', import.meta.url),
    'utf8',
  ),
);

const run = (command, commandArguments, options = {}) => {
  const result = spawnSync(command, commandArguments, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${commandArguments.join(' ')} failed:\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
};
const sha512 = (filePath) =>
  crypto.createHash('sha512').update(fs.readFileSync(filePath)).digest('hex');
const walk = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules') return [];
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(entryPath);
    return [entryPath];
  });
const relative = (root, filePath) =>
  path.relative(root, filePath).split(path.sep).join('/');

if (sha512(artifactPath) !== manifest.sha512) {
  throw new Error('Candidate tarball SHA-512 does not match its manifest');
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), `gt-${manager}-`));
try {
  fs.writeFileSync(
    path.join(fixture, 'package.json'),
    JSON.stringify(
      {
        name: 'global-torque-clean-room',
        private: true,
        type: 'module',
        packageManager: 'pnpm@10.33.0',
      },
      null,
      2,
    ),
  );

  const fixtureArtifactPath = path.join(fixture, 'candidate.tgz');
  fs.copyFileSync(artifactPath, fixtureArtifactPath);
  const installSpecs = [
    'typescript@6.0.3',
    ...dependencySpecs,
    fixtureArtifactPath,
  ];
  if (manager === 'npm') {
    run(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--save-exact',
        ...installSpecs,
      ],
      { cwd: fixture },
    );
  } else {
    run('pnpm', ['add', '--ignore-scripts', '--save-exact', ...installSpecs], {
      cwd: fixture,
    });
  }

  const packageRoot = path.join(
    fixture,
    'node_modules',
    ...manifest.package.split('/'),
  );
  const installedFiles = walk(packageRoot)
    .map((filePath) => relative(packageRoot, filePath))
    .sort();
  const expectedFiles = manifest.files.map(({ path: filePath }) => filePath);
  if (JSON.stringify(installedFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      'Installed package file list differs from the candidate manifest',
    );
  }
  for (const entry of manifest.files) {
    if (sha512(path.join(packageRoot, entry.path)) !== entry.sha512) {
      throw new Error(`Installed file digest differs: ${entry.path}`);
    }
  }

  const installedManifest = JSON.parse(
    fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
  );
  const specifiers = Object.entries(installedManifest.exports ?? {})
    .filter(([, target]) => {
      const importTarget = typeof target === 'string' ? target : target?.import;
      return typeof importTarget === 'string' && importTarget.endsWith('.js');
    })
    .map(([subpath]) =>
      subpath === '.'
        ? manifest.package
        : `${manifest.package}/${subpath.replace(/^\.\//, '')}`,
    );

  const imports = specifiers
    .map(
      (specifier, index) =>
        `import * as export${index} from ${JSON.stringify(specifier)}; void export${index};`,
    )
    .join('\n');
  fs.writeFileSync(path.join(fixture, 'smoke.mts'), `${imports}\n`);
  fs.writeFileSync(path.join(fixture, 'runtime.mjs'), `${imports}\n`);

  const baseCompilerOptions = {
    target: 'ES2022',
    strict: true,
    skipLibCheck: false,
    noEmit: true,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
  };
  for (const [name, compilerOptions] of [
    [
      'nodenext',
      {
        ...baseCompilerOptions,
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
      },
    ],
    [
      'bundler',
      {
        ...baseCompilerOptions,
        module: 'ESNext',
        moduleResolution: 'Bundler',
      },
    ],
  ]) {
    const configPath = path.join(fixture, `tsconfig.${name}.json`);
    fs.writeFileSync(
      configPath,
      JSON.stringify({ compilerOptions, files: ['./smoke.mts'] }, null, 2),
    );
    run(
      path.join(fixture, 'node_modules', '.bin', 'tsc'),
      ['--project', configPath],
      { cwd: fixture },
    );
  }
  run(process.execPath, [path.join(fixture, 'runtime.mjs')], { cwd: fixture });

  console.info(
    JSON.stringify({
      package: manifest.package,
      version: manifest.version,
      manager,
      node: process.version,
      imports: specifiers.length,
      files: installedFiles.length,
    }),
  );
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
