import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { verifyPublicContent } from './verify-public-content.mjs';

const releaseDirectory = path.resolve(process.argv[2] ?? 'release');
const artifacts = fs
  .readdirSync(releaseDirectory)
  .filter((name) => name.endsWith('.tgz'));

if (artifacts.length !== 1) {
  throw new Error(`Expected exactly one .tgz in ${releaseDirectory}`);
}

const artifact = artifacts[0];
const artifactPath = path.join(releaseDirectory, artifact);
const run = (command, commandArguments, options = {}) => {
  const result = spawnSync(command, commandArguments, {
    cwd: options.cwd ?? process.cwd(),
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
const digest = (contents) =>
  crypto.createHash('sha512').update(contents).digest();
const fileDigest = (filePath) =>
  digest(fs.readFileSync(filePath)).toString('hex');
const relative = (root, filePath) =>
  path.relative(root, filePath).split(path.sep).join('/');
const walk = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Packed artifact contains a symbolic link: ${filePath}`);
    }
    if (entry.isDirectory()) return walk(filePath);
    return [filePath];
  });
const flattenTargets = (value) => {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.values(value).flatMap(flattenTargets);
};

const sourceCommit = run('git', ['rev-parse', 'HEAD']);
const sourceStatus = run('git', ['status', '--porcelain=v1']);
if (sourceStatus) {
  throw new Error(
    'Release artifact must be created from a clean source commit',
  );
}

const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'global-torque-release-'),
);
try {
  run('tar', ['-xzf', artifactPath, '-C', temporaryDirectory]);
  const packageRoot = path.join(temporaryDirectory, 'package');
  const packageManifest = JSON.parse(
    fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
  );
  // pnpm intentionally removes repository-only packageManager metadata from
  // the npm-format manifest. Source CI validates that field before packing.
  verifyPublicContent(packageRoot, { packed: true });

  const configuredEntries = new Set([
    'package.json',
    ...(packageManifest.files ?? []),
  ]);
  const isAllowed = (filePath) =>
    [...configuredEntries].some(
      (entry) => filePath === entry || filePath.startsWith(`${entry}/`),
    );
  const files = walk(packageRoot)
    .map((filePath) => relative(packageRoot, filePath))
    .sort();
  const unexpected = files.filter((filePath) => !isAllowed(filePath));
  if (unexpected.length > 0) {
    throw new Error(
      `Artifact contains files outside package.json files:\n${unexpected.join('\n')}`,
    );
  }

  const exportTargets = [
    packageManifest.main,
    packageManifest.types,
    ...flattenTargets(packageManifest.exports),
  ].filter(
    (target, index, targets) =>
      typeof target === 'string' && targets.indexOf(target) === index,
  );
  for (const target of exportTargets) {
    if (!target.startsWith('./')) {
      throw new Error(`Export target is not package-relative: ${target}`);
    }
    const resolved = path.resolve(packageRoot, target);
    const contained = path.relative(packageRoot, resolved);
    if (
      contained.startsWith('..') ||
      path.isAbsolute(contained) ||
      !fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()
    ) {
      throw new Error(
        `Export target is missing or escapes the package: ${target}`,
      );
    }
  }

  for (const mapPath of walk(path.join(packageRoot, 'dist')).filter(
    (filePath) => filePath.endsWith('.map'),
  )) {
    const sourceMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    if (
      !Array.isArray(sourceMap.sources) ||
      !Array.isArray(sourceMap.sourcesContent) ||
      sourceMap.sources.length === 0 ||
      sourceMap.sources.length !== sourceMap.sourcesContent.length ||
      sourceMap.sources.some(
        (source) => path.isAbsolute(source) || /^file:/i.test(source),
      )
    ) {
      throw new Error(
        `Invalid or non-portable source map: ${relative(packageRoot, mapPath)}`,
      );
    }
  }

  const artifactDigest = digest(fs.readFileSync(artifactPath));
  const verificationManifest = {
    schemaVersion: 1,
    package: packageManifest.name,
    version: packageManifest.version,
    artifact,
    sha512: artifactDigest.toString('hex'),
    integrity: `sha512-${artifactDigest.toString('base64')}`,
    sourceCommit,
    sourceDirty: false,
    exportTargets,
    files: files.map((filePath) => ({
      path: filePath,
      sha512: fileDigest(path.join(packageRoot, filePath)),
    })),
  };
  const sidecarPath = `${artifactPath}.manifest.json`;
  const digestPath = `${artifactPath}.sha512`;
  fs.writeFileSync(
    sidecarPath,
    `${JSON.stringify(verificationManifest, null, 2)}\n`,
    { flag: 'wx' },
  );
  fs.writeFileSync(
    digestPath,
    `${verificationManifest.sha512}  ${artifact}\n`,
    { flag: 'wx' },
  );
  console.info(JSON.stringify(verificationManifest, null, 2));
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
