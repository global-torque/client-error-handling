import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const MAX_COMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
const PORTABLE_PATH_PREFIX =
  /^(?:[A-Za-z][A-Za-z\d+.-]*:|[A-Za-z]:[\\/]|[\\/])/;
const FORBIDDEN_PATH_CHARACTERS = new Set(['\\', '%', '?', '#']);
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

const sha256 = (contents) =>
  crypto.createHash('sha256').update(contents).digest('hex');

const assertPortablePath = (label, value) => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return (
        FORBIDDEN_PATH_CHARACTERS.has(character) ||
        codePoint <= 0x20 ||
        codePoint === 0x7f
      );
    }) ||
    PORTABLE_PATH_PREFIX.test(value)
  ) {
    throw new Error(`${label} must be a canonical portable relative path`);
  }
  return value;
};

const assertContained = (label, root, candidate) => {
  const contained = path.relative(path.resolve(root), path.resolve(candidate));
  if (
    contained === '' ||
    contained === '..' ||
    contained.startsWith(`..${path.sep}`) ||
    path.isAbsolute(contained)
  ) {
    throw new Error(`${label} escapes the package`);
  }
  return contained;
};

const verifyApprovedLicense = (packageName, contents) => {
  const expected = APPROVED_LICENSE_SHA256.get(packageName);
  if (
    expected === undefined ||
    contents.length === 0 ||
    sha256(contents) !== expected
  ) {
    throw new Error('Packed LICENSE does not match the approved MIT license');
  }
};

export function verifyPortableSourceMap(
  mapPath,
  packageRoot,
  sourceMap,
  sourceRepositoryRoot,
) {
  const displayPath = path.relative(packageRoot, mapPath) || mapPath;
  if (!sourceMap || typeof sourceMap !== 'object' || Array.isArray(sourceMap)) {
    throw new Error(`Invalid source map object: ${displayPath}`);
  }
  if (
    sourceMap.version !== 3 ||
    typeof sourceMap.mappings !== 'string' ||
    !Array.isArray(sourceMap.names) ||
    sourceMap.names.some((name) => typeof name !== 'string') ||
    !Array.isArray(sourceMap.sources) ||
    !Array.isArray(sourceMap.sourcesContent) ||
    sourceMap.sources.length === 0 ||
    sourceMap.sources.length !== sourceMap.sourcesContent.length ||
    new Set(sourceMap.sources).size !== sourceMap.sources.length ||
    sourceMap.sourcesContent.some((content) => typeof content !== 'string')
  ) {
    throw new Error(`Invalid source map structure: ${displayPath}`);
  }

  let sourceRoot = '';
  if (sourceMap.sourceRoot !== undefined && sourceMap.sourceRoot !== '') {
    sourceRoot = assertPortablePath('sourceRoot', sourceMap.sourceRoot);
  } else if (
    sourceMap.sourceRoot !== undefined &&
    typeof sourceMap.sourceRoot !== 'string'
  ) {
    throw new Error(`sourceRoot must be a string: ${displayPath}`);
  }

  const outputPath = mapPath.slice(0, -'.map'.length);
  const expectedOutputFile = path.basename(outputPath);
  if (sourceMap.file !== expectedOutputFile) {
    throw new Error(
      `Source map file does not match its sibling output: ${displayPath}`,
    );
  }
  if (!fs.statSync(outputPath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Source map sibling output is missing: ${displayPath}`);
  }
  const output = fs.readFileSync(outputPath, 'utf8');
  if (
    !output.trimEnd().endsWith(`//# sourceMappingURL=${path.basename(mapPath)}`)
  ) {
    throw new Error(
      `Source map sibling does not reference the map: ${displayPath}`,
    );
  }

  for (const [index, source] of sourceMap.sources.entries()) {
    const portableSource = assertPortablePath('source map source', source);
    const resolvedSource = path.resolve(
      path.dirname(mapPath),
      sourceRoot,
      portableSource,
    );
    const repositoryRelativePath = assertContained(
      'source map source',
      packageRoot,
      resolvedSource,
    );
    if (!repositoryRelativePath.startsWith(`src${path.sep}`)) {
      throw new Error(`Source map source is outside src/: ${source}`);
    }
    if (sourceRepositoryRoot !== undefined) {
      const repositorySource = path.resolve(
        sourceRepositoryRoot,
        repositoryRelativePath,
      );
      assertContained(
        'source map repository source',
        sourceRepositoryRoot,
        repositorySource,
      );
      if (!fs.statSync(repositorySource, { throwIfNoEntry: false })?.isFile()) {
        throw new Error(
          `Source map source is missing from the clean checkout: ${source}`,
        );
      }
      if (
        fs.readFileSync(repositorySource, 'utf8') !==
        sourceMap.sourcesContent[index]
      ) {
        throw new Error(
          `Source map content differs from the clean checkout: ${source}`,
        );
      }
    }
  }
}

export function verifyPackedFileSet(packageManifest, files, packageRoot) {
  if (packageManifest?.license !== 'MIT') {
    throw new Error('Packed package must declare license MIT');
  }
  if (
    !Array.isArray(packageManifest.files) ||
    packageManifest.files.some(
      (entry) => typeof entry !== 'string' || entry.length === 0,
    )
  ) {
    throw new Error('Packed package must declare a string-only files policy');
  }
  if (
    !Array.isArray(files) ||
    files.some(
      (filePath) =>
        typeof filePath !== 'string' ||
        filePath.length === 0 ||
        filePath.startsWith('/') ||
        filePath.includes('\\') ||
        filePath
          .split('/')
          .some(
            (segment) => segment === '' || segment === '.' || segment === '..',
          ),
    ) ||
    new Set(files).size !== files.length
  ) {
    throw new Error('Artifact file list is not canonical and unique');
  }

  const exactEntries = ['package.json'];
  const directoryEntries = [];
  for (const entry of packageManifest.files) {
    if (entry === 'dist' || entry.startsWith('docs/')) {
      directoryEntries.push(entry);
    } else {
      exactEntries.push(entry);
    }
  }
  const missingEntries = [
    ...exactEntries.filter((entry) => !files.includes(entry)),
    ...directoryEntries.filter(
      (entry) => !files.some((filePath) => filePath.startsWith(`${entry}/`)),
    ),
  ];
  if (missingEntries.length > 0) {
    throw new Error(
      `Artifact omits required package entries:\n${missingEntries.join('\n')}`,
    );
  }

  if (packageRoot !== undefined) {
    for (const filePath of files) {
      const contents = fs.readFileSync(path.join(packageRoot, filePath));
      if (contents.length === 0) {
        throw new Error(`Packed file must not be empty: ${filePath}`);
      }
    }
    verifyApprovedLicense(
      packageManifest.name,
      fs.readFileSync(path.join(packageRoot, 'LICENSE')),
    );
  }
}

const crc32 = (contents) => zlib.crc32(contents);

const parseOctal = (field, label) => {
  const value = field
    .toString('ascii')
    .replace(/[\0 ]+$/u, '')
    .trimStart();
  if (!/^[0-7]+$/.test(value)) {
    throw new Error(`Tar ${label} is not canonical octal`);
  }
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Tar ${label} exceeds the safe integer range`);
  }
  return parsed;
};

const canonicalOctal = (value, length, suffix) =>
  `${value.toString(8).padStart(length - suffix.length, '0')}${suffix}`;

const decodeTarField = (field, label) => {
  const nul = field.indexOf(0);
  const contents = nul === -1 ? field : field.subarray(0, nul);
  if (nul !== -1 && field.subarray(nul).some((byte) => byte !== 0)) {
    throw new Error(`Tar ${label} has data after its terminator`);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(contents);
};

const verifyTarPayload = (tar) => {
  const files = [];
  const members = new Set();
  let offset = 0;
  let zeroBlocks = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      zeroBlocks += 1;
      offset += 512;
      if (zeroBlocks === 2) break;
      continue;
    }
    if (zeroBlocks !== 0) {
      throw new Error('Tar contains a member after an end marker');
    }
    if (header.subarray(257, 263).toString('binary') !== 'ustar\0') {
      throw new Error('Tar member is not canonical USTAR');
    }
    const mode = parseOctal(header.subarray(100, 108), 'mode');
    const uid = parseOctal(header.subarray(108, 116), 'uid');
    const gid = parseOctal(header.subarray(116, 124), 'gid');
    const size = parseOctal(header.subarray(124, 136), 'size');
    const mtime = parseOctal(header.subarray(136, 148), 'mtime');
    const storedChecksum = parseOctal(header.subarray(148, 156), 'checksum');
    let checksum = 0;
    for (let index = 0; index < header.length; index += 1) {
      checksum += index >= 148 && index < 156 ? 32 : header[index];
    }
    if (checksum !== storedChecksum) {
      throw new Error('Tar header checksum mismatch');
    }
    if (
      header.subarray(100, 108).toString('binary') !==
        canonicalOctal(0o644, 8, ' \0') ||
      header.subarray(108, 116).toString('binary') !==
        canonicalOctal(0, 8, ' \0') ||
      header.subarray(116, 124).toString('binary') !==
        canonicalOctal(0, 8, ' \0') ||
      header.subarray(124, 136).toString('binary') !==
        canonicalOctal(size, 12, ' ') ||
      header.subarray(136, 148).toString('binary') !==
        canonicalOctal(499162500, 12, ' ') ||
      header.subarray(148, 156).toString('binary') !==
        canonicalOctal(storedChecksum, 8, ' \0') ||
      mode !== 0o644 ||
      uid !== 0 ||
      gid !== 0 ||
      mtime !== 499162500 ||
      header[156] !== '0'.charCodeAt(0) ||
      header.subarray(157, 257).some((byte) => byte !== 0) ||
      header.subarray(263, 265).toString('ascii') !== '00' ||
      header.subarray(265, 329).some((byte) => byte !== 0) ||
      parseOctal(header.subarray(329, 337), 'device major') !== 0 ||
      parseOctal(header.subarray(337, 345), 'device minor') !== 0 ||
      header.subarray(329, 337).toString('binary') !==
        canonicalOctal(0, 8, ' \0') ||
      header.subarray(337, 345).toString('binary') !==
        canonicalOctal(0, 8, ' \0') ||
      header.subarray(500, 512).some((byte) => byte !== 0)
    ) {
      throw new Error('Tar header is not in the canonical pnpm pack form');
    }

    const name = decodeTarField(header.subarray(0, 100), 'name');
    const prefix = decodeTarField(header.subarray(345, 500), 'prefix');
    const member = prefix ? `${prefix}/${name}` : name;
    const canonicalMember = member;
    assertPortablePath('tar member', canonicalMember);
    const segments = canonicalMember.split('/');
    if (
      segments[0] !== 'package' ||
      segments.length < 2 ||
      segments.some(
        (segment) => segment === '' || segment === '.' || segment === '..',
      )
    ) {
      throw new Error(`Tar member is outside package/: ${member}`);
    }
    if (members.has(canonicalMember)) {
      throw new Error(`Tar contains a duplicate member: ${canonicalMember}`);
    }
    members.add(canonicalMember);
    files.push(segments.slice(1).join('/'));

    const paddedSize = Math.ceil(size / 512) * 512;
    const dataEnd = offset + 512 + size;
    const paddedEnd = offset + 512 + paddedSize;
    if (tar.subarray(dataEnd, paddedEnd).some((byte) => byte !== 0)) {
      throw new Error(`Tar member has non-zero body padding: ${member}`);
    }
    offset += 512 + paddedSize;
    if (offset > tar.length) {
      throw new Error(`Tar member exceeds the archive: ${member}`);
    }
  }
  if (zeroBlocks !== 2 || offset !== tar.length) {
    throw new Error('Tar does not have a canonical zero-filled ending');
  }
  return files.sort();
};

const verifyCanonicalGzip = (archive) => {
  if (
    archive.length < 18 ||
    archive.length > MAX_COMPRESSED_BYTES ||
    archive[0] !== 0x1f ||
    archive[1] !== 0x8b ||
    archive[2] !== 8 ||
    archive[3] !== 0 ||
    archive.readUInt32LE(4) !== 0
  ) {
    throw new Error('Artifact is not a canonical reproducible gzip member');
  }
  const inflated = zlib.inflateRawSync(archive.subarray(10), {
    info: true,
    maxOutputLength: MAX_UNCOMPRESSED_BYTES,
  });
  const compressedBytes = inflated.engine.bytesWritten;
  const trailerOffset = 10 + compressedBytes;
  if (trailerOffset + 8 !== archive.length) {
    throw new Error(
      'Artifact contains trailing bytes or multiple gzip members',
    );
  }
  if (
    archive.readUInt32LE(trailerOffset) !== crc32(inflated.buffer) ||
    archive.readUInt32LE(trailerOffset + 4) !== inflated.buffer.length % 2 ** 32
  ) {
    throw new Error('Artifact gzip trailer does not match its payload');
  }
  const canonicalArchive = zlib.gzipSync(inflated.buffer, { mtime: 0 });
  if (!archive.equals(canonicalArchive)) {
    throw new Error('Artifact gzip bytes are not canonical for this runtime');
  }
  return inflated.buffer;
};

export function verifyCanonicalPackageArchive(artifactPath) {
  return verifyTarPayload(verifyCanonicalGzip(fs.readFileSync(artifactPath)));
}

const createTarFixture = (entries) => {
  const chunks = [];
  for (const entry of entries) {
    const contents = Buffer.from(entry.contents ?? 'x');
    const header = Buffer.alloc(512);
    header.write(entry.name, 0, 100, 'utf8');
    header.write(canonicalOctal(0o644, 8, ' \0'), 100, 8, 'binary');
    header.write(canonicalOctal(0, 8, ' \0'), 108, 8, 'binary');
    header.write(canonicalOctal(0, 8, ' \0'), 116, 8, 'binary');
    header.write(canonicalOctal(contents.length, 12, ' '), 124, 12, 'binary');
    header.write(canonicalOctal(499162500, 12, ' '), 136, 12, 'binary');
    header.fill(32, 148, 156);
    header[156] = (entry.type ?? '0').charCodeAt(0);
    header.write('ustar\0', 257, 6, 'binary');
    header.write('00', 263, 2, 'ascii');
    header.write(canonicalOctal(0, 8, ' \0'), 329, 8, 'binary');
    header.write(canonicalOctal(0, 8, ' \0'), 337, 8, 'binary');
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(canonicalOctal(checksum, 8, ' \0'), 148, 8, 'binary');
    chunks.push(header);
    chunks.push(
      contents,
      Buffer.alloc(Math.ceil(contents.length / 512) * 512 - contents.length),
    );
  }
  chunks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(chunks), { mtime: 0 });
};

function runPolicySelfTest() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'release-policy-'));
  try {
    fs.mkdirSync(path.join(fixtureRoot, 'dist'));
    fs.mkdirSync(path.join(fixtureRoot, 'src'));
    fs.writeFileSync(path.join(fixtureRoot, 'src/index.ts'), 'export {};');
    fs.writeFileSync(
      path.join(fixtureRoot, 'dist/index.js'),
      'export {};\n//# sourceMappingURL=index.js.map\n',
    );
    const mapPath = path.join(fixtureRoot, 'dist/index.js.map');
    const validMap = {
      version: 3,
      file: 'index.js',
      sourceRoot: '',
      names: [],
      mappings: '',
      sources: ['../src/index.ts'],
      sourcesContent: ['export {};'],
    };
    verifyPortableSourceMap(mapPath, fixtureRoot, validMap, fixtureRoot);
    for (const [label, mutation] of [
      ['file sourceRoot', { sourceRoot: 'file:///Users/private/project/' }],
      ['spaced sourceRoot', { sourceRoot: ' file:///Users/private/project/' }],
      ['URI source', { sources: ['webpack:///src/index.ts'] }],
      ['control-prefixed source', { sources: ['\twebpack:///src/index.ts'] }],
      ['Windows source', { sources: ['C:\\private\\index.ts'] }],
      ['UNC source', { sources: ['\\\\server\\share\\index.ts'] }],
      ['backslash source', { sources: ['..\\src\\index.ts'] }],
      ['encoded source', { sources: ['%2e%2e/private.ts'] }],
      ['query source', { sources: ['../src/index.ts?private'] }],
      ['fragment source', { sources: ['../src/index.ts#private'] }],
      ['traversal source', { sources: ['../../../outside.ts'] }],
      ['wrong version', { version: 2 }],
      ['missing mappings', { mappings: undefined }],
      ['wrong output', { file: '../README.md' }],
      ['missing source content', { sourcesContent: [] }],
      ['non-string source content', { sourcesContent: [null] }],
      ['changed source content', { sourcesContent: ['private'] }],
    ]) {
      try {
        verifyPortableSourceMap(
          mapPath,
          fixtureRoot,
          { ...validMap, ...mutation },
          fixtureRoot,
        );
      } catch {
        continue;
      }
      throw new Error(`Release-policy self-test accepted ${label}`);
    }

    const manifest = {
      license: 'MIT',
      files: [
        'dist',
        'README.md',
        'LICENSE',
        'NOTICE.md',
        'CHANGELOG.md',
        'SECURITY.md',
        'docs/api',
      ],
    };
    const files = [
      'package.json',
      'dist/index.js',
      'README.md',
      'LICENSE',
      'NOTICE.md',
      'CHANGELOG.md',
      'SECURITY.md',
      'docs/api/index.md',
    ];
    verifyPackedFileSet(manifest, files);
    for (const [label, candidateManifest, candidateFiles] of [
      ['non-MIT license', { ...manifest, license: 'UNLICENSED' }, files],
      ['missing LICENSE', manifest, files.filter((file) => file !== 'LICENSE')],
      [
        'LICENSE directory',
        manifest,
        files.map((file) => (file === 'LICENSE' ? 'LICENSE/payload' : file)),
      ],
      [
        'missing API documentation',
        manifest,
        files.filter((file) => !file.startsWith('docs/api/')),
      ],
    ]) {
      try {
        verifyPackedFileSet(candidateManifest, candidateFiles);
      } catch {
        continue;
      }
      throw new Error(`Release-policy self-test accepted ${label}`);
    }
    let rejectedEmptyLicense = false;
    try {
      verifyApprovedLicense('@global-torque/content-toolkit', Buffer.alloc(0));
    } catch {
      rejectedEmptyLicense = true;
    }
    if (!rejectedEmptyLicense) {
      throw new Error('Release-policy self-test accepted an empty LICENSE');
    }

    const validArchive = createTarFixture([{ name: 'package/package.json' }]);
    verifyTarPayload(verifyCanonicalGzip(validArchive));
    for (const [label, archive] of [
      ['extra root', createTarFixture([{ name: 'PRIVATE-CANARY.txt' }])],
      ['traversal', createTarFixture([{ name: 'package/../private.txt' }])],
      ['symlink', createTarFixture([{ name: 'package/link', type: '2' }])],
      [
        'duplicate',
        createTarFixture([{ name: 'package/a' }, { name: 'package/a' }]),
      ],
      ['concatenated gzip', Buffer.concat([validArchive, validArchive])],
    ]) {
      try {
        verifyTarPayload(verifyCanonicalGzip(archive));
      } catch {
        continue;
      }
      throw new Error(`Release-policy self-test accepted ${label}`);
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

runPolicySelfTest();
