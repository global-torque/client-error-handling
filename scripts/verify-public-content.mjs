import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const EXPECTED_PACKAGE_NAME = '@global-torque/client-error-handling';

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.django-venv',
  'coverage',
  'node_modules',
  'release',
  'temp',
]);
const EXPECTED_PACKAGE_FILES = new Map([
  [
    '@global-torque/admin-toolkit',
    [
      'dist',
      'README.md',
      'LICENSE',
      'NOTICE.md',
      'CHANGELOG.md',
      'SECURITY.md',
      'docs/api',
      'docs/api-styles',
      'etc/admin-toolkit.api.md',
      'etc/admin-toolkit-styles.api.md',
    ],
  ],
  [
    '@global-torque/client-error-handling',
    [
      'dist',
      'README.md',
      'LICENSE',
      'NOTICE.md',
      'CHANGELOG.md',
      'SECURITY.md',
      'docs/api',
      'etc/client-error-handling.api.md',
    ],
  ],
  [
    '@global-torque/content-toolkit',
    [
      'dist',
      'README.md',
      'LICENSE',
      'NOTICE.md',
      'CHANGELOG.md',
      'SECURITY.md',
      'docs/api',
      'etc/content-toolkit.api.md',
    ],
  ],
  [
    '@global-torque/design-tokens',
    [
      'dist',
      'README.md',
      'LICENSE',
      'NOTICE.md',
      'CHANGELOG.md',
      'SECURITY.md',
      'docs/api',
      'docs/api-css',
      'docs/api-theme',
      'etc/design-tokens.api.md',
      'etc/design-tokens-css.api.md',
      'etc/design-tokens-theme.api.md',
    ],
  ],
  [
    '@global-torque/markdown-it-wikilinks',
    [
      'dist',
      'README.md',
      'LICENSE',
      'NOTICE.md',
      'CHANGELOG.md',
      'SECURITY.md',
      'docs/api',
      'docs/api-node',
      'etc/markdown-it-wikilinks.api.md',
      'etc/markdown-it-wikilinks-node.api.md',
    ],
  ],
  [
    '@global-torque/vitepress-toolkit',
    [
      'dist',
      'README.md',
      'LICENSE',
      'NOTICE.md',
      'CHANGELOG.md',
      'SECURITY.md',
      'docs/api',
      'docs/api-node-build-metadata',
      'docs/api-node-drafts',
      'etc/vitepress-toolkit.api.md',
      'etc/vitepress-toolkit-node-build-metadata.api.md',
      'etc/vitepress-toolkit-node-drafts.api.md',
    ],
  ],
]);
const EXPECTED_EXPORT_SUBPATHS = new Map([
  [
    '@global-torque/admin-toolkit',
    ['.', './alpine', './htmx', './patterns', './styles'],
  ],
  [
    '@global-torque/client-error-handling',
    [
      '.',
      './dedupe',
      './normalize',
      './pipeline',
      './reporter',
      './sanitize',
      './types',
    ],
  ],
  [
    '@global-torque/content-toolkit',
    [
      '.',
      './allData',
      './image-srcset',
      './pageData',
      './pages',
      './types',
      './url',
    ],
  ],
  [
    '@global-torque/design-tokens',
    ['.', './css', './source', './theme', './tokens', './tokens.json'],
  ],
  ['@global-torque/markdown-it-wikilinks', ['.', './node', './url']],
  [
    '@global-torque/vitepress-toolkit',
    [
      '.',
      './content',
      './head',
      './node/build-metadata',
      './node/drafts',
      './seo',
      './sitemap',
    ],
  ],
]);
const EXPECTED_PACKAGE_VERSIONS = new Map([
  ['@global-torque/admin-toolkit', '0.2.0-beta.2'],
  ['@global-torque/client-error-handling', '0.1.0-beta.4'],
  ['@global-torque/content-toolkit', '0.2.0-beta.7'],
  ['@global-torque/design-tokens', '0.1.0-beta.2'],
  ['@global-torque/markdown-it-wikilinks', '0.2.0-beta.3'],
  ['@global-torque/vitepress-toolkit', '0.2.0-beta.6'],
]);
const EXPECTED_SIDE_EFFECTS = new Map([
  ['@global-torque/admin-toolkit', ['./dist/styles.css']],
  ['@global-torque/client-error-handling', false],
  ['@global-torque/content-toolkit', false],
  ['@global-torque/design-tokens', ['./dist/*.css']],
  ['@global-torque/markdown-it-wikilinks', false],
  ['@global-torque/vitepress-toolkit', false],
]);
const APPROVED_LICENSE_SHA256 = new Map([
  [
    '@global-torque/markdown-it-wikilinks',
    '1cefe478d2b2fd9f666b096a79935040b838eac9a5dbdb0631bb72c87f7cfb71',
  ],
  [
    '@global-torque/admin-toolkit',
    'b8aa8454486ed55f426feb44113a322ecdad534a6afe4e0b9b1732efe60abd0a',
  ],
  [
    '@global-torque/client-error-handling',
    'b8aa8454486ed55f426feb44113a322ecdad534a6afe4e0b9b1732efe60abd0a',
  ],
  [
    '@global-torque/content-toolkit',
    'b8aa8454486ed55f426feb44113a322ecdad534a6afe4e0b9b1732efe60abd0a',
  ],
  [
    '@global-torque/design-tokens',
    'b8aa8454486ed55f426feb44113a322ecdad534a6afe4e0b9b1732efe60abd0a',
  ],
  [
    '@global-torque/vitepress-toolkit',
    'b8aa8454486ed55f426feb44113a322ecdad534a6afe4e0b9b1732efe60abd0a',
  ],
]);
const PACKED_TEXT_FILE = /(?:^LICENSE$|\.(?:css|js|json|map|md|mjs|ts))$/;
const WORKSPACE_OVERRIDE_PACKAGES = new Set([
  '@global-torque/client-error-handling',
  '@global-torque/content-toolkit',
  '@global-torque/design-tokens',
  '@global-torque/markdown-it-wikilinks',
]);
const EXPECTED_RELEASE_DEPENDENCIES = new Map([
  [
    '@global-torque/admin-toolkit',
    [
      '@global-torque/design-tokens@https://github.com/global-torque/design-tokens/releases/download/v0.1.0-beta.2/global-torque-design-tokens-0.1.0-beta.2.tgz',
    ],
  ],
  ['@global-torque/client-error-handling', []],
  ['@global-torque/content-toolkit', []],
  ['@global-torque/design-tokens', []],
  ['@global-torque/markdown-it-wikilinks', ['markdown-it@14.3.0']],
  [
    '@global-torque/vitepress-toolkit',
    [
      '@global-torque/content-toolkit@https://github.com/global-torque/content-toolkit/releases/download/v0.2.0-beta.7/global-torque-content-toolkit-0.2.0-beta.7.tgz',
      'vitepress@1.6.4',
      'vue@3.5.39',
    ],
  ],
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

const GLOBAL_TORQUE_RELEASE_ASSET_PATTERN =
  /^https:\/\/github\.com\/global-torque\/([a-z0-9-]+)\/releases\/download\/v([^/\s#]+)\/global-torque-([a-z0-9-]+)-([^/\s#]+)\.tgz$/i;
const EXACT_GITHUB_COMMIT_PATTERNS = [
  /^github:[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]+#[0-9a-f]{40}$/i,
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]+#[0-9a-f]{40}$/i,
  /^(?:git(?:\+https|\+ssh)?|https?|ssh):\/\/(?:git@)?github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]+(?:\.git)?#[0-9a-f]{40}$/i,
  /^git@github\.com:[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]+(?:\.git)?#[0-9a-f]{40}$/i,
];

const isSemverIdentifierCharacter = (character) => {
  const codePoint = character.codePointAt(0);
  return (
    character === '-' ||
    (codePoint >= 0x30 && codePoint <= 0x39) ||
    (codePoint >= 0x41 && codePoint <= 0x5a) ||
    (codePoint >= 0x61 && codePoint <= 0x7a)
  );
};

const isSemverNumericIdentifier = (value) =>
  value.length > 0 &&
  (value === '0' || value[0] !== '0') &&
  [...value].every((character) => character >= '0' && character <= '9');

const isSemverIdentifier = (value, enforceNumericLeadingZero) => {
  if (value.length === 0 || ![...value].every(isSemverIdentifierCharacter)) {
    return false;
  }
  const numeric = [...value].every(
    (character) => character >= '0' && character <= '9',
  );
  return (
    !enforceNumericLeadingZero || !numeric || isSemverNumericIdentifier(value)
  );
};

const isFullSemver = (value) => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    return false;
  }
  const buildParts = value.split('+');
  if (
    buildParts.length > 2 ||
    (buildParts[1] !== undefined &&
      !buildParts[1]
        .split('.')
        .every((part) => isSemverIdentifier(part, false)))
  ) {
    return false;
  }
  const core = buildParts[0];
  const prereleaseSeparator = core.indexOf('-');
  const main =
    prereleaseSeparator === -1 ? core : core.slice(0, prereleaseSeparator);
  const prerelease =
    prereleaseSeparator === -1
      ? undefined
      : core.slice(prereleaseSeparator + 1);
  const mainParts = main.split('.');
  if (mainParts.length !== 3 || !mainParts.every(isSemverNumericIdentifier)) {
    return false;
  }
  return (
    prerelease === undefined ||
    prerelease.split('.').every((part) => isSemverIdentifier(part, true))
  );
};

const isSemverRange = (value) => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    return false;
  }
  const clauses = value.split('||');
  if (clauses.length > 16) return false;
  return clauses.every((rawClause) => {
    const clause = rawClause.trim();
    if (clause.length === 0) return false;
    const comparators = clause.split(/[ \t]+/u);
    if (comparators.length > 16) return false;
    return comparators.every((comparator) => {
      const prefix = ['>=', '<=', '^', '~', '>', '<', '='].find((candidate) =>
        comparator.startsWith(candidate),
      );
      const version = prefix ? comparator.slice(prefix.length) : comparator;
      return isFullSemver(version);
    });
  });
};

function isExactGlobalTorqueReleaseAsset(name, value) {
  const match = GLOBAL_TORQUE_RELEASE_ASSET_PATTERN.exec(value);
  const expectedRepository = name.startsWith('@global-torque/')
    ? name.slice('@global-torque/'.length).toLowerCase()
    : undefined;
  return (
    match !== null &&
    expectedRepository !== undefined &&
    match[1]?.toLowerCase() === expectedRepository &&
    match[1]?.toLowerCase() === match[3]?.toLowerCase() &&
    match[2] === match[4] &&
    isFullSemver(match[2] ?? '')
  );
}

function dependencySourcePolicyError(name, specifier) {
  const value = String(specifier);
  if (value !== value.trim()) {
    return 'must not contain leading or trailing whitespace';
  }
  if (isExactGlobalTorqueReleaseAsset(name, value)) return undefined;
  if (EXACT_GITHUB_COMMIT_PATTERNS.some((pattern) => pattern.test(value))) {
    return undefined;
  }
  if (isSemverRange(value)) return undefined;
  return 'must use a full semver version/range, an exact 40-hex GitHub commit, or a version-consistent Global Torque release asset';
}

function validateReleaseDependencies(manifest, dependencySpecs) {
  const expected = EXPECTED_RELEASE_DEPENDENCIES.get(manifest.name);
  if (
    expected === undefined ||
    !Array.isArray(dependencySpecs) ||
    dependencySpecs.some((specifier) => typeof specifier !== 'string') ||
    JSON.stringify(dependencySpecs) !== JSON.stringify(expected)
  ) {
    throw new Error(
      '.github/release-dependencies.json must match the package policy exactly',
    );
  }
  for (const dependencySpec of dependencySpecs) {
    const match = /^(@global-torque\/[^@]+)@(.+)$/.exec(dependencySpec);
    if (match && manifest.devDependencies?.[match[1]] !== match[2]) {
      throw new Error(
        `${match[1]} release dependency must match package.json devDependencies`,
      );
    }
  }
}

for (const hostileDependencies of [
  ['https://gitlab.com/owner/repository.git#main'],
  ['https://downloads.example/package-latest.tgz'],
]) {
  try {
    validateReleaseDependencies(
      { name: '@global-torque/content-toolkit' },
      hostileDependencies,
    );
  } catch {
    continue;
  }
  throw new Error(
    `Release-dependency self-test accepted ${hostileDependencies[0]}`,
  );
}

for (const [dependencyName, mutableSource] of [
  ['example-dependency', 'github:owner/repository'],
  ['example-dependency', 'github:owner/repository#dev'],
  ['example-dependency', 'owner/repository#latest'],
  ['example-dependency', `./repository#${'a'.repeat(40)}`],
  ['example-dependency', `../repository#${'a'.repeat(40)}`],
  ['example-dependency', `.hidden/repository#${'a'.repeat(40)}`],
  ['example-dependency', 'gitlab:owner/repository#main'],
  ['example-dependency', 'bitbucket:owner/repository#release'],
  ['example-dependency', 'gist:0123456789abcdef#main'],
  ['example-dependency', 'git+https://github.com/owner/repository.git#main'],
  [
    'example-dependency',
    'git+ssh://git@github.com/owner/repository.git#release',
  ],
  ['example-dependency', 'https://github.com/owner/repository.git'],
  [
    'example-dependency',
    'https://user:pass@github.com/owner/repository.git#main',
  ],
  ['example-dependency', 'git@github.com:owner/repository.git#v1.0.0'],
  [
    'example-dependency',
    'git+https://gitlab.example/owner/repository.git#main',
  ],
  ['example-dependency', 'https://gitlab.com/owner/repository.git#main'],
  ['example-dependency', 'https://downloads.example/package-latest.tgz'],
  ['example-dependency', 'workspace:*'],
  ['example-dependency', 'file:../package'],
  ['example-dependency', 'link:../package'],
  ['example-dependency', 'portal:../package'],
  ['example-dependency', 'catalog:default'],
  ['example-dependency', 'patch:package@1.0.0#patches/package.patch'],
  ['example-dependency', 'latest'],
  ['example-dependency', 'next'],
  ['example-dependency', '*'],
  ['example-dependency', '^1'],
  ['example-dependency', '1.2.3-01'],
  ['example-dependency', '1.2.3-alpha.01'],
  [
    'example-dependency',
    'https://github.com/other/repository/releases/download/v1.0.0/package.tgz',
  ],
  [
    '@global-torque/package',
    'https://github.com/global-torque/package/releases/download/v1.0.0/global-torque-package-1.0.1.tgz',
  ],
  [
    '@global-torque/content-toolkit',
    'https://github.com/global-torque/design-tokens/releases/download/v1.0.0/global-torque-design-tokens-1.0.0.tgz',
  ],
]) {
  if (
    dependencySourcePolicyError(dependencyName, mutableSource) === undefined
  ) {
    throw new Error(`Dependency-source self-test accepted ${mutableSource}`);
  }
}
for (const [dependencyName, immutableSource] of [
  ['example-dependency', `github:owner/repository#${'a'.repeat(40)}`],
  [
    'example-dependency',
    `git+https://github.com/owner/repository.git#${'b'.repeat(40)}`,
  ],
  [
    'example-dependency',
    `git@github.com:owner/repository.git#${'c'.repeat(40)}`,
  ],
  [
    '@global-torque/package',
    'https://github.com/global-torque/package/releases/download/v1.0.0/global-torque-package-1.0.0.tgz',
  ],
  ['example-dependency', '1.2.3'],
  ['example-dependency', '1.2.3-01a'],
  ['example-dependency', '^1.2.3'],
  ['example-dependency', '>=1.2.3-0 <2.0.0'],
  ['example-dependency', '~4.5.6 || ^5.0.0'],
]) {
  const policyError = dependencySourcePolicyError(
    dependencyName,
    immutableSource,
  );
  if (policyError !== undefined) {
    throw new Error(
      `Dependency-source self-test rejected ${immutableSource}: ${policyError}`,
    );
  }
}

function validatePublicPath(relativePath) {
  for (const [label, rule] of TEXT_RULES) {
    if (rule.test(relativePath)) {
      throw new Error(`${relativePath} path contains ${label}`);
    }
  }
  if (/\bWebdevelop(?:\.biz| Pro)?\b/i.test(relativePath)) {
    throw new Error(`${relativePath} path contains a private product name`);
  }
  if (/(?:^|\/)(?:apps|openspec|tasks|\.codex|\.agents)\//.test(relativePath)) {
    throw new Error(`${relativePath} contains a private path segment`);
  }
}

for (const hostilePath of [
  'dist/Webdevelop.js',
  'dist/apps/private.js',
  'dist/openspec/private.js',
  'dist/tasks/private.js',
  'dist/.codex/private.js',
  'dist/.agents/private.js',
]) {
  try {
    validatePublicPath(hostilePath);
  } catch {
    continue;
  }
  throw new Error(`Public-path self-test accepted ${hostilePath}`);
}

function walkFiles(directory, excludedDirectories) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (excludedDirectories.has(entry.name)) return [];
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Public source contains a symbolic link: ${entryPath}`);
    }
    if (entry.isDirectory()) return walkFiles(entryPath, excludedDirectories);
    return [entryPath];
  });
}

function validateManifest(root, options) {
  const manifestPath = path.join(root, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const errors = [];

  const expectedRepositoryUrl = `git+https://github.com/global-torque/${EXPECTED_PACKAGE_NAME.slice('@global-torque/'.length)}.git`;
  const expectedHomepage = `https://github.com/global-torque/${EXPECTED_PACKAGE_NAME.slice('@global-torque/'.length)}#readme`;
  const expectedBugsUrl = `https://github.com/global-torque/${EXPECTED_PACKAGE_NAME.slice('@global-torque/'.length)}/issues`;
  if (manifest.name !== EXPECTED_PACKAGE_NAME) {
    errors.push(`package.json name must be ${EXPECTED_PACKAGE_NAME}`);
  }
  if (
    manifest.version !== EXPECTED_PACKAGE_VERSIONS.get(EXPECTED_PACKAGE_NAME) ||
    !isFullSemver(String(manifest.version))
  ) {
    errors.push(
      'package.json version must match the reviewed candidate version',
    );
  }
  if (
    manifest.repository?.type !== 'git' ||
    manifest.repository?.url !== expectedRepositoryUrl ||
    manifest.homepage !== expectedHomepage ||
    manifest.bugs?.url !== expectedBugsUrl
  ) {
    errors.push(
      'package.json repository identity must match the public repository',
    );
  }

  if (manifest.private !== false)
    errors.push('package.json must set private to false');
  if (manifest.license !== 'MIT')
    errors.push('package.json must declare license as MIT');
  if (manifest.publishConfig?.access !== 'public') {
    errors.push('package.json must set publishConfig.access to public');
  }
  const unexpectedPublishConfigKeys = Object.keys(
    manifest.publishConfig ?? {},
  ).filter((key) => key !== 'access');
  if (unexpectedPublishConfigKeys.length > 0) {
    errors.push(
      `package.json publishConfig contains forbidden keys: ${unexpectedPublishConfigKeys.join(', ')}`,
    );
  }
  if (manifest.engines?.node !== '>=22') {
    errors.push('package.json must declare engines.node as >=22');
  }
  if (!options.packed && manifest.packageManager !== 'pnpm@10.33.0') {
    errors.push('package.json must pin packageManager to pnpm@10.33.0');
  }
  if (
    JSON.stringify(manifest.sideEffects) !==
    JSON.stringify(EXPECTED_SIDE_EFFECTS.get(manifest.name))
  ) {
    errors.push(
      'package.json sideEffects must match the package policy exactly',
    );
  }
  const expectedExportSubpaths = EXPECTED_EXPORT_SUBPATHS.get(manifest.name);
  const actualExportSubpaths =
    manifest.exports &&
    typeof manifest.exports === 'object' &&
    !Array.isArray(manifest.exports)
      ? Object.keys(manifest.exports).sort()
      : [];
  if (
    expectedExportSubpaths === undefined ||
    JSON.stringify(actualExportSubpaths) !==
      JSON.stringify([...expectedExportSubpaths].sort())
  ) {
    errors.push('package.json exports must match the package policy exactly');
  }
  const expectedFiles = EXPECTED_PACKAGE_FILES.get(manifest.name);
  const actualFiles = Array.isArray(manifest.files)
    ? manifest.files.filter((entry) => typeof entry === 'string').sort()
    : [];
  if (
    expectedFiles === undefined ||
    !Array.isArray(manifest.files) ||
    actualFiles.length !== manifest.files.length ||
    JSON.stringify(actualFiles) !== JSON.stringify([...expectedFiles].sort())
  ) {
    errors.push('package.json files must match the package policy exactly');
  }
  for (const bundledKey of ['bundledDependencies', 'bundleDependencies']) {
    if (Object.hasOwn(manifest, bundledKey)) {
      errors.push(`package.json must not declare ${bundledKey}`);
    }
  }
  for (const resolutionKey of [
    'overrides',
    'resolutions',
    'packageExtensions',
    'pnpm',
  ]) {
    if (Object.hasOwn(manifest, resolutionKey)) {
      errors.push(`package.json must not declare ${resolutionKey}`);
    }
  }
  for (const lifecycle of [
    'preinstall',
    'install',
    'postinstall',
    'preprepare',
    'prepare',
    'postprepare',
    'prepack',
    'postpack',
    'prepublish',
    'prepublishOnly',
    'publish',
    'postpublish',
    'preci',
    'postci',
  ]) {
    if (manifest.scripts?.[lifecycle]) {
      errors.push(`consumer-side lifecycle script is forbidden: ${lifecycle}`);
    }
  }
  const scriptNames = new Set(Object.keys(manifest.scripts ?? {}));
  for (const scriptName of scriptNames) {
    if (
      (scriptName.startsWith('pre') && scriptNames.has(scriptName.slice(3))) ||
      (scriptName.startsWith('post') && scriptNames.has(scriptName.slice(4)))
    ) {
      errors.push(`implicit pre/post script hook is forbidden: ${scriptName}`);
    }
  }

  for (const section of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
    'devDependencies',
  ]) {
    for (const [name, specifier] of Object.entries(manifest[section] ?? {})) {
      const sourcePolicyError = dependencySourcePolicyError(name, specifier);
      if (sourcePolicyError !== undefined) {
        errors.push(`${section} ${name} ${sourcePolicyError}`);
      }
      if (
        section === 'devDependencies' &&
        name.startsWith('@global-torque/') &&
        !(
          /^https:\/\/github\.com\/global-torque\/[^/]+\/releases\/download\/v[^/]+\/global-torque-[^/]+\.tgz$/.test(
            String(specifier),
          ) || isFullSemver(String(specifier))
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
  if (!options.packed) {
    const workspacePath = path.join(root, 'pnpm-workspace.yaml');
    if (!fs.existsSync(workspacePath)) {
      throw new Error('Public source must contain pnpm-workspace.yaml');
    }
    const workspace = fs
      .readFileSync(workspacePath, 'utf8')
      .replaceAll('\r\n', '\n');
    const expectedWorkspace = WORKSPACE_OVERRIDE_PACKAGES.has(manifest.name)
      ? /^packages:\n {2}- \.\noverrides:\n {2}(?:'js-yaml@4\.1\.1'|"js-yaml@4\.1\.1"|js-yaml@4\.1\.1): 4\.3\.0\n?$/
      : /^packages:\n {2}- \.\n?$/;
    if (!expectedWorkspace.test(workspace)) {
      throw new Error(
        'pnpm-workspace.yaml contains unapproved resolution policy',
      );
    }
  }
  return manifest;
}

export function verifyPublicContent(rootDirectory, options = {}) {
  const root = path.resolve(rootDirectory);
  const packed = options.packed === true;
  const manifest = validateManifest(root, { packed });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const files = walkFiles(root, packed ? new Set() : EXCLUDED_DIRECTORIES);
  const expectedLicenseDigest = APPROVED_LICENSE_SHA256.get(manifest.name);
  const licenseContents = fs.readFileSync(path.join(root, 'LICENSE'));
  const actualLicenseDigest = crypto
    .createHash('sha256')
    .update(licenseContents)
    .digest('hex');
  if (
    expectedLicenseDigest === undefined ||
    licenseContents.length === 0 ||
    actualLicenseDigest !== expectedLicenseDigest
  ) {
    throw new Error('LICENSE must match the approved MIT license bytes');
  }
  if (!packed) {
    const dependencySpecs = JSON.parse(
      fs.readFileSync(
        path.join(root, '.github/release-dependencies.json'),
        'utf8',
      ),
    );
    validateReleaseDependencies(manifest, dependencySpecs);
  }

  for (const filePath of files) {
    const relativePath = path
      .relative(root, filePath)
      .split(path.sep)
      .join('/');
    if (packed && !PACKED_TEXT_FILE.test(relativePath)) {
      throw new Error(
        `Packed package contains an unsupported file type: ${relativePath}`,
      );
    }
    validatePublicPath(relativePath);
    let source;
    try {
      source = decoder.decode(fs.readFileSync(filePath));
    } catch {
      if (packed) {
        throw new Error(`Packed file is not valid UTF-8 text: ${relativePath}`);
      }
      continue;
    }
    if (!packed && ['.npmrc', '.pnpmfile.cjs'].includes(relativePath)) {
      throw new Error(`${relativePath} is forbidden in public source`);
    }
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
    files: files.length,
  };
}

function runPackedPolicySelfTest() {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'public-content-policy-'),
  );
  const repositorySlug = EXPECTED_PACKAGE_NAME.slice('@global-torque/'.length);
  const baseManifest = {
    name: EXPECTED_PACKAGE_NAME,
    private: false,
    version: EXPECTED_PACKAGE_VERSIONS.get(EXPECTED_PACKAGE_NAME),
    license: 'MIT',
    publishConfig: { access: 'public' },
    engines: { node: '>=22' },
    sideEffects: EXPECTED_SIDE_EFFECTS.get(EXPECTED_PACKAGE_NAME),
    repository: {
      type: 'git',
      url: `git+https://github.com/global-torque/${repositorySlug}.git`,
    },
    homepage: `https://github.com/global-torque/${repositorySlug}#readme`,
    bugs: { url: `https://github.com/global-torque/${repositorySlug}/issues` },
    files: EXPECTED_PACKAGE_FILES.get(EXPECTED_PACKAGE_NAME),
    exports: Object.fromEntries(
      EXPECTED_EXPORT_SUBPATHS.get(EXPECTED_PACKAGE_NAME).map((subpath) => [
        subpath,
        './dist/index.js',
      ]),
    ),
  };
  const manifestPath = path.join(fixtureRoot, 'package.json');
  const expectManifestRejected = (label, manifest) => {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    try {
      validateManifest(fixtureRoot, { packed: true });
    } catch {
      return;
    }
    throw new Error(`Packed-policy self-test accepted ${label}`);
  };

  try {
    expectManifestRejected('unreviewed version', {
      ...baseManifest,
      version: 'not-semver',
    });
    expectManifestRejected('incorrect sideEffects', {
      ...baseManifest,
      sideEffects: true,
    });
    expectManifestRejected('non-MIT license', {
      ...baseManifest,
      license: 'UNLICENSED',
    });
    expectManifestRejected('postpack lifecycle', {
      ...baseManifest,
      scripts: { postpack: 'node mutate-release.mjs' },
    });
    expectManifestRejected('nested prebuild hook', {
      ...baseManifest,
      scripts: {
        ci: 'pnpm run build',
        build: 'node build.mjs',
        prebuild: 'node mutate-dist.mjs',
      },
    });
    expectManifestRejected('publishConfig.directory', {
      ...baseManifest,
      publishConfig: { access: 'public', directory: 'temp' },
    });
    expectManifestRejected('bundled dependencies', {
      ...baseManifest,
      bundledDependencies: [],
    });
    expectManifestRejected('resolution override', {
      ...baseManifest,
      overrides: { dependency: 'https://downloads.example/mutable.tgz' },
    });
    expectManifestRejected('extra packed directory', {
      ...baseManifest,
      files: [...baseManifest.files, 'temp'],
    });

    fs.writeFileSync(manifestPath, JSON.stringify(baseManifest));
    fs.copyFileSync(
      new URL('../LICENSE', import.meta.url),
      path.join(fixtureRoot, 'LICENSE'),
    );
    const privateDirectory = path.join(fixtureRoot, 'temp');
    fs.mkdirSync(privateDirectory);
    fs.writeFileSync(
      path.join(privateDirectory, 'unscanned-secret.md'),
      'PASSWORD=CANARY_PRIVATE',
    );
    try {
      verifyPublicContent(fixtureRoot, { packed: true });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('secret assignment')
      ) {
        return;
      }
      throw error;
    }
    throw new Error('Packed-policy self-test skipped excluded private content');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

runPackedPolicySelfTest();

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = verifyPublicContent(process.argv[2] ?? process.cwd());
  console.info(JSON.stringify(result));
}
