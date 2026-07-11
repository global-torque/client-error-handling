import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.django-venv',
  'coverage',
  'node_modules',
  'release',
  'temp',
]);

const TEXT_RULES = [
  ['private package scope', /@webdevelop-pro\//],
  ['direct environment read', /import\.meta\.env/],
  ['mutable GitHub dependency', /github:[^\s"'`]+#(?:main|master)\b/i],
  [
    'private product URL',
    /https?:\/\/(?:[^/\s"'`]+\.)?(?:webdevelop\.biz|webdevelop\.pro|dashboard\.webdevelop\.biz|invest\.webdevelop\.biz)\b/i,
  ],
  ['obsolete security mailbox', /security@global-torque\.dev/i],
  [
    'private content taxonomy',
    /CORE SYSTEMS|FINANCE & TRANSACTIONS|INTEGRATION & OPTIMIZATION|SECURITY & COMPLIANCE|FINANCIAL ECOSYSTEM|INTELLIGENT ECOSYSTEM|BLOCKCHAIN\//,
  ],
  [
    'agent or private task path',
    /(?:^|['"`\s])(?:apps|openspec|tasks|\.codex|\.agents)\//m,
  ],
  [
    'secret assignment',
    /\b(?:GITHUB_TOKEN|NPM_TOKEN|PRIVATE_KEY|CLIENT_SECRET|PASSWORD)\b\s*=(?!=)/,
  ],
];

function walkFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (EXCLUDED_DIRECTORIES.has(entry.name)) return [];
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Public source contains a symbolic link: ${entryPath}`);
    }
    if (entry.isDirectory()) return walkFiles(entryPath);
    return [entryPath];
  });
}

function validateManifest(root, options) {
  const manifestPath = path.join(root, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const errors = [];

  if (manifest.private !== false)
    errors.push('package.json must set private to false');
  if (manifest.publishConfig?.access !== 'public') {
    errors.push('package.json must set publishConfig.access to public');
  }
  if (manifest.engines?.node !== '>=22') {
    errors.push('package.json must declare engines.node as >=22');
  }
  if (!options.packed && manifest.packageManager !== 'pnpm@10.33.0') {
    errors.push('package.json must pin packageManager to pnpm@10.33.0');
  }
  if (!Object.hasOwn(manifest, 'sideEffects')) {
    errors.push('package.json must declare intentional sideEffects');
  }
  for (const lifecycle of ['prepare', 'prepack', 'postinstall']) {
    if (manifest.scripts?.[lifecycle]) {
      errors.push(`consumer-side lifecycle script is forbidden: ${lifecycle}`);
    }
  }

  for (const section of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
    'devDependencies',
  ]) {
    for (const [name, specifier] of Object.entries(manifest[section] ?? {})) {
      if (/^(?:workspace|file|link):/i.test(String(specifier))) {
        errors.push(`${section} ${name} uses forbidden ${specifier}`);
      }
      if (/github:[^#]+#(?:main|master)\b/i.test(String(specifier))) {
        errors.push(`${section} ${name} uses a mutable GitHub branch`);
      }
      if (
        section === 'devDependencies' &&
        name.startsWith('@global-torque/') &&
        !(
          /^https:\/\/github\.com\/global-torque\/[^/]+\/releases\/download\/v[^/]+\/global-torque-[^/]+\.tgz$/.test(
            String(specifier),
          ) || /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(specifier))
        )
      ) {
        errors.push(
          `${section} ${name} must use an immutable release asset or exact registry version`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Public package manifest failed:\n- ${errors.join('\n- ')}`,
    );
  }
  return manifest;
}

export function verifyPublicContent(rootDirectory, options = {}) {
  const root = path.resolve(rootDirectory);
  const manifest = validateManifest(root, { packed: options.packed === true });
  const decoder = new TextDecoder('utf-8', { fatal: true });

  for (const filePath of walkFiles(root)) {
    let source;
    try {
      source = decoder.decode(fs.readFileSync(filePath));
    } catch {
      continue;
    }
    const relativePath = path
      .relative(root, filePath)
      .split(path.sep)
      .join('/');
    if (relativePath === 'scripts/verify-public-content.mjs') continue;
    for (const [label, rule] of TEXT_RULES) {
      if (rule.test(source)) {
        throw new Error(`${relativePath} contains ${label}`);
      }
    }
    if (
      relativePath !== 'NOTICE.md' &&
      /\bWebdevelop(?:\.biz| Pro)?\b/i.test(source)
    ) {
      throw new Error(
        `${relativePath} contains a private product name outside NOTICE.md`,
      );
    }
  }

  return {
    package: manifest.name,
    version: manifest.version,
    files: walkFiles(root).length,
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = verifyPublicContent(process.argv[2] ?? process.cwd());
  console.info(JSON.stringify(result));
}
