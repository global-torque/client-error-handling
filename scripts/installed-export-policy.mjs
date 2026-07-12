import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PUBLIC_SUBPATH = /^(?:\.|\.\/[A-Za-z0-9][A-Za-z0-9._/-]*)$/;
const PACKAGE_TARGET = /^\.\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const SUPPORTED_CONDITIONS = new Set(['types', 'import', 'style', 'default']);
const EXPECTED_INSTALL_DEPENDENCIES = new Map([
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
const FULL_SEMVER =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const RELEASE_ASSET =
  /^https:\/\/github\.com\/global-torque\/([a-z0-9-]+)\/releases\/download\/v([^/\s]+)\/global-torque-([a-z0-9-]+)-([^/\s]+)\.tgz$/i;

const parseInstallSpecifier = (dependencySpec) => {
  const match = /^(@[^/\s]+\/[^@\s]+|[^@/\s]+)@([^\s]+)$/.exec(dependencySpec);
  if (!match)
    throw new Error(`Invalid clean-room dependency: ${dependencySpec}`);
  return { name: match[1], source: match[2] };
};

const isSafeInstallSource = (name, source) => {
  if (FULL_SEMVER.test(source)) return true;
  const asset = RELEASE_ASSET.exec(source);
  if (!asset || !name.startsWith('@global-torque/')) return false;
  const slug = name.slice('@global-torque/'.length).toLowerCase();
  return (
    asset[1]?.toLowerCase() === slug &&
    asset[3]?.toLowerCase() === slug &&
    asset[2] === asset[4] &&
    FULL_SEMVER.test(asset[2] ?? '')
  );
};

export function verifyInstallDependencySpecs(packageName, dependencySpecs) {
  const expected = EXPECTED_INSTALL_DEPENDENCIES.get(packageName);
  if (
    expected === undefined ||
    !Array.isArray(dependencySpecs) ||
    dependencySpecs.some(
      (specifier) =>
        typeof specifier !== 'string' ||
        specifier.startsWith('-') ||
        specifier === packageName ||
        specifier.startsWith(`${packageName}@`),
    ) ||
    JSON.stringify(dependencySpecs) !== JSON.stringify(expected)
  ) {
    throw new Error('Clean-room dependencies do not match package policy');
  }
  const names = new Set();
  for (const dependencySpec of dependencySpecs) {
    const { name, source } = parseInstallSpecifier(dependencySpec);
    if (
      name === packageName ||
      names.has(name) ||
      !isSafeInstallSource(name, source)
    ) {
      throw new Error(`Unsafe clean-room dependency: ${dependencySpec}`);
    }
    names.add(name);
  }
}

const packageSpecifier = (packageName, subpath) =>
  subpath === '.'
    ? packageName
    : `${packageName}/${subpath.replace(/^\.\//, '')}`;

const resolveTarget = (packageRoot, label, target, endings) => {
  if (
    typeof target !== 'string' ||
    !PACKAGE_TARGET.test(target) ||
    target.includes('..') ||
    target.includes('//') ||
    !endings.some((ending) => target.endsWith(ending))
  ) {
    throw new Error(`${label} is not a supported package-relative target`);
  }
  const resolved = path.resolve(packageRoot, target);
  const contained = path.relative(packageRoot, resolved);
  if (
    contained === '' ||
    contained === '..' ||
    contained.startsWith(`..${path.sep}`) ||
    path.isAbsolute(contained) ||
    !fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()
  ) {
    throw new Error(`${label} is missing or escapes the installed package`);
  }
  return resolved;
};

export function collectInstalledExportCoverage(
  installedManifest,
  packageName,
  packageRoot,
) {
  const exports = installedManifest?.exports;
  if (
    !exports ||
    typeof exports !== 'object' ||
    Array.isArray(exports) ||
    Object.keys(exports).length === 0
  ) {
    throw new Error(
      'Installed package must expose at least one public subpath',
    );
  }

  const runtimeSpecifiers = [];
  const jsonSpecifiers = [];
  for (const [subpath, target] of Object.entries(exports)) {
    if (
      !PUBLIC_SUBPATH.test(subpath) ||
      subpath.includes('..') ||
      subpath.includes('//') ||
      subpath.includes('*')
    ) {
      throw new Error(`Unsupported public export subpath: ${subpath}`);
    }
    const specifier = packageSpecifier(packageName, subpath);
    if (typeof target === 'string') {
      const resolved = resolveTarget(
        packageRoot,
        `${subpath} JSON export`,
        target,
        ['.json'],
      );
      JSON.parse(fs.readFileSync(resolved, 'utf8'));
      jsonSpecifiers.push(specifier);
      continue;
    }
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      throw new Error(`Unsupported export target for ${subpath}`);
    }
    const conditions = Object.keys(target);
    if (
      conditions.some((condition) => !SUPPORTED_CONDITIONS.has(condition)) ||
      !Object.hasOwn(target, 'types') ||
      !Object.hasOwn(target, 'import')
    ) {
      throw new Error(`Unsupported conditional export shape for ${subpath}`);
    }
    resolveTarget(packageRoot, `${subpath} types export`, target.types, [
      '.d.ts',
      '.d.mts',
    ]);
    resolveTarget(packageRoot, `${subpath} import export`, target.import, [
      '.js',
      '.mjs',
    ]);
    if (Object.hasOwn(target, 'style')) {
      resolveTarget(packageRoot, `${subpath} style export`, target.style, [
        '.css',
      ]);
      if (target.default !== target.style) {
        throw new Error(
          `${subpath} default export must match its supported style export`,
        );
      }
    } else if (Object.hasOwn(target, 'default')) {
      throw new Error(`Unsupported default-only export for ${subpath}`);
    }
    runtimeSpecifiers.push(specifier);
  }

  if (
    runtimeSpecifiers.length + jsonSpecifiers.length !==
    Object.keys(exports).length
  ) {
    throw new Error('Not every public export is covered by clean-room tests');
  }
  return { jsonSpecifiers, runtimeSpecifiers };
}

function runPolicySelfTest() {
  const packageRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'installed-export-policy-'),
  );
  try {
    verifyInstallDependencySpecs('@global-torque/content-toolkit', []);
    for (const dependencySpecs of [
      ['--ignore-scripts=false'],
      ['https://downloads.example/package-latest.tgz'],
      ['@global-torque/content-toolkit@latest'],
      ['example@1.0.0', 'example@1.0.0'],
    ]) {
      try {
        verifyInstallDependencySpecs(
          '@global-torque/content-toolkit',
          dependencySpecs,
        );
      } catch {
        continue;
      }
      throw new Error(
        `Installed-export self-test accepted ${dependencySpecs[0]}`,
      );
    }
    fs.mkdirSync(path.join(packageRoot, 'dist'));
    for (const [name, contents] of [
      ['index.js', 'export {};'],
      ['index.d.ts', 'export {};'],
      ['module.mjs', 'export {};'],
      ['module.d.mts', 'export {};'],
      ['style.css', ':root {}'],
      ['data.json', '{}'],
    ]) {
      fs.writeFileSync(path.join(packageRoot, 'dist', name), contents);
    }
    const validExports = {
      '.': { types: './dist/index.d.ts', import: './dist/index.js' },
      './module': {
        types: './dist/module.d.mts',
        import: './dist/module.mjs',
      },
      './style': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
        style: './dist/style.css',
        default: './dist/style.css',
      },
      './data.json': './dist/data.json',
    };
    collectInstalledExportCoverage(
      { exports: validExports },
      '@global-torque/fixture',
      packageRoot,
    );
    for (const [label, exports] of [
      ['zero exports', {}],
      ['pattern export', { './*': './dist/index.js' }],
      [
        'nested condition',
        {
          '.': {
            types: './dist/index.d.ts',
            import: { node: './dist/index.js' },
          },
        },
      ],
      ['default-only export', { '.': { default: './dist/index.js' } }],
      ['type-only export', { '.': { types: './dist/index.d.ts' } }],
    ]) {
      try {
        collectInstalledExportCoverage(
          { exports },
          '@global-torque/fixture',
          packageRoot,
        );
      } catch {
        continue;
      }
      throw new Error(`Installed-export self-test accepted ${label}`);
    }
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
}

runPolicySelfTest();
