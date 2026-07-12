import { describe, expect, it, vi } from 'vitest';

import {
  sanitizeContext,
  sanitizeText,
  sanitizeUrl,
  sanitizeValue,
} from './sanitize';

describe('transport sanitization', () => {
  it('allowlists context and omits bodies, credentials, queries, and unknown fields', () => {
    const context = sanitizeContext({
      url: 'https://user:pass@example.test/page?token=secret#private',
      route: '/items?account=private#tab',
      component: 'OfferCard',
      request: {
        method: 'POST',
        url: '/api/items?token=secret#fragment',
        headers: {
          authorization: 'Bearer secret',
          cookie: 'session=secret',
          'x-request-id': 'safe-id',
        },
        body: { password: 'CANARY' },
      },
      metadata: {
        source: 'bootstrap',
        secret: 'CANARY',
        payload: { token: 'CANARY' },
      },
      customer: 'CANARY',
    });

    expect(context).toEqual({
      url: 'https://example.test/page',
      route: '/items',
      component: 'OfferCard',
      request: {
        method: 'POST',
        url: '/api/items',
        headers: { 'x-request-id': 'safe-id' },
      },
      metadata: { source: 'bootstrap' },
    });
    expect(JSON.stringify(context)).not.toContain('CANARY');
  });

  it('sanitizes absolute, relative, embedded, and explicitly allowed queries', () => {
    expect(
      sanitizeUrl('https://user:pass@example.test/a?token=x&safe=1#private'),
    ).toBe('https://example.test/a');
    expect(sanitizeUrl('../a?token=x#private')).toBe('/a');
    expect(
      sanitizeUrl('/a?token=x&safe=1#private', {
        allowUrlQuery: true,
        allowUrlFragment: true,
      }),
    ).toBe('/a?token=%5Bredacted%5D&safe=1#private');
    expect(
      sanitizeUrl('/a?alice%40example.test=safe', { allowUrlQuery: true }),
    ).toBe('/a?%5Bredacted%5D=safe');
    expect(
      sanitizeUrl('/a#alice%40example.test', { allowUrlFragment: true }),
    ).not.toContain('alice');
    expect(sanitizeUrl('/a#%ZZ', { allowUrlFragment: true })).toContain(
      '[redacted]',
    );
    expect(
      sanitizeText(
        'failed at https://user:pass@example.test/a?token=secret#private',
      ),
    ).toBe('failed at https://example.test/a');
    expect(sanitizeUrl('profile?customer=Alice#private')).toBe('profile');
    expect(sanitizeUrl('javascript:alert(document.cookie)')).toBe(
      '[unsupported-url]',
    );
    expect(sanitizeUrl('data:text/plain,CANARY private')).toBe(
      '[unsupported-url]',
    );
    expect(sanitizeUrl('file:///Users/alice/private.txt')).toBe(
      '[unsupported-url]',
    );
  });

  it('redacts complete configured secrets before truncation and quoted assignments', () => {
    const secret = `CANARY_${'S'.repeat(100)}`;
    expect(
      sanitizeText(secret, {
        redactValues: ['short', secret],
        maxStringLength: 16,
      }),
    ).toBe('[redacted]');
    for (const value of [
      '{"password":"CANARY SECRET phrase"}',
      "password='CANARY SECRET PHRASE'",
      'token="CANARY SECRET PHRASE" trailing',
    ]) {
      const sanitized = sanitizeText(value);
      expect(sanitized).not.toContain('CANARY SECRET');
      expect(sanitized).toContain('[redacted]');
    }
    expect(sanitizeText('card 4111-1111-1111-1111')).toBe('card [redacted]');
    expect(sanitizeText('@example.test')).toBe('@example.test');
    expect(sanitizeText('a@b.c1')).toBe('a@b.c1');
    expect(sanitizeText('user1@example.test')).toBe('[redacted]');
    for (const email of [
      'user@example.com1',
      'user@example.com-secret',
      'user@example.xn--p1ai',
      'élise@example.com',
      '用户@example.com',
      'user@exämple.com',
      'user@example.рф',
      'δοκιμή@παράδειγμα.δοκιμή',
      'user@例え.テスト',
      'emoji😀@example.com',
      'e\u0301@example.com',
      'o’connor@example.com',
      '用户。测试@example.com',
      'user@example。com',
      'user@example．com',
      'user@example｡com',
      'user@l·l.cat',
      'user@a͵b.example',
      'user@א׳ב.example',
      'user@カ・タ.example',
      'δοκιμή·τεστ@παράδειγμα.δοκιμή',
      'first!last@example.com',
      "o'reilly@example.com",
      'user&tag@example.com',
      '""@example.com',
      '"john.doe"@example.com',
      '"john\\"doe"@example.com',
      'much."more\\ unusual"@example.com',
      'first."last"@example.com',
      'very.unusual."@".unusual.com@example.com',
      'first..last@example.com',
      'user@[192.0.2.1]',
    ]) {
      expect(sanitizeText(email)).toBe('[redacted]');
    }
    expect(sanitizeText('contact élise@example.com now')).toBe(
      'contact [redacted] now',
    );
    expect(sanitizeText('用户@example.com-secret')).toBe('[redacted]');
    expect(sanitizeText('user@example.test.')).toBe('[redacted].');
    expect(sanitizeText('user@example.com。')).toBe('[redacted]。');
    expect(sanitizeText('john"@example.com')).toBe('john"@example.com');
    expect(sanitizeText('"john\ndoe"@example.com')).toBe(
      '"john\ndoe"@example.com',
    );
    expect(sanitizeText('"john\rdoe"@example.com')).toBe(
      '"john\rdoe"@example.com',
    );
    expect(sanitizeText('user@[192.0.2. 1]')).toBe('user@[192.0.2. 1]');
    expect(
      sanitizeText(`${'%'.repeat(20_000)}@example.test`, {
        maxStringLength: 21_000,
      }),
    ).toBe('[redacted]');
  });

  it('distinguishes cycles from shared references and neutralizes prototype keys', () => {
    const shared = { value: 1 };
    const input: Record<string, unknown> = { first: shared, second: shared };
    input.self = input;
    const dangerous = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":"bad","safe":true}',
    ) as Record<string, unknown>;

    expect(sanitizeValue(input)).toEqual({
      first: { value: 1 },
      second: '[shared]',
      self: '[circular]',
    });
    const sanitized = sanitizeValue(dangerous) as Record<string, unknown>;
    expect(sanitized.__proto__).toBe('[redacted]');
    expect(sanitized.constructor).toBe('[redacted]');
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('never executes accessors or failing proxy traps', () => {
    let reads = 0;
    const accessor = {};
    Object.defineProperty(accessor, 'secret', {
      enumerable: true,
      get() {
        reads += 1;
        return 'CANARY';
      },
    });
    const proxy = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('no');
        },
      },
    );

    expect(sanitizeValue(accessor)).toEqual({ secret: '[redacted]' });
    expect(sanitizeValue(proxy)).toBe('[unavailable]');
    expect(reads).toBe(0);
  });

  it('handles builtins and numeric edge cases explicitly', () => {
    const url = new URL('https://user:pass@example.test/a?token=x#private');
    Object.defineProperty(url, 'toString', {
      configurable: true,
      get: () => {
        throw new Error('must use URL intrinsic');
      },
    });
    const map = new Map([
      ['secret', 1],
      ['omitted', 2],
    ]);
    Object.defineProperty(map, 'entries', {
      configurable: true,
      get: () => {
        throw new Error('must use Map intrinsic');
      },
    });
    const set = new Set([1, 2]);
    Object.defineProperty(set, 'values', {
      configurable: true,
      get: () => {
        throw new Error('must use Set intrinsic');
      },
    });
    const value = sanitizeValue({
      date: new Date('2026-07-10T00:00:00.000Z'),
      invalidDate: new Date('bad'),
      url,
      map,
      set,
      bigint: 12n,
      nan: Number.NaN,
      infinity: Number.POSITIVE_INFINITY,
    });
    expect(value).toMatchObject({
      date: '2026-07-10T00:00:00.000Z',
      invalidDate: '[invalid-date]',
      url: 'https://example.test/a',
      map: {
        type: 'Map',
        entries: [
          ['secret', '[redacted]'],
          ['omitted', 2],
        ],
      },
      set: { type: 'Set', values: [1, 2] },
      bigint: '12n',
      nan: '[NaN]',
      infinity: '[Infinity]',
    });
    expect(sanitizeValue(map, { maxArrayLength: 1 })).toEqual({
      type: 'Map',
      entries: [['secret', '[redacted]']],
    });
    expect(sanitizeValue(set, { maxArrayLength: 1 })).toEqual({
      type: 'Set',
      values: [1],
    });
    expect(sanitizeValue(Object.create(Date.prototype))).toBe('[invalid-date]');
    expect(sanitizeValue(Object.create(URL.prototype))).toBe('[unavailable]');
  });

  it('never exposes truncated secret or personal-data prefixes', () => {
    const secret = `CANARY_${'S'.repeat(100)}`;
    const email = `${'alice'.repeat(30)}@example.test`;

    const secretUrl = sanitizeUrl(`https://x.test/${secret}`, {
      redactValues: [secret],
      maxStringLength: 24,
    });
    expect(secretUrl).not.toContain('CANARY');
    expect(secretUrl).not.toContain('SS');
    expect(sanitizeText(email, { maxStringLength: 20 })).toBe('[truncated]');
    expect(
      sanitizeUrl(`https://x.test/${email}`, { maxStringLength: 30 }),
    ).toBe('[truncated]');

    const serialized = JSON.stringify(
      sanitizeValue(
        new Map([
          ['password', 'CANARY_SECRET'],
          ['authorization', 'Bearer CANARY_TOKEN'],
        ]),
      ),
    );
    expect(serialized).not.toContain('CANARY_SECRET');
    expect(serialized).not.toContain('CANARY_TOKEN');
  });

  it('redacts raw and case-varied percent-encoded configured secrets', () => {
    for (const [secret, encoded] of [
      ['CANARY/SECRET', 'CANARY%2FSECRET'],
      ['CANARY/SECRET', 'CANARY%2fSECRET'],
      ['CANARY+SECRET', 'CANARY%2BSECRET'],
      ['CANARY+SECRET', 'CANARY%2bSECRET'],
    ] satisfies readonly (readonly [string, string])[]) {
      const options = { redactValues: [secret] };
      const url = sanitizeUrl(`https://x.test/${encoded}`, options);
      const text = sanitizeText(`failed https://x.test/${encoded}`, options);
      expect(url).not.toContain('CANARY');
      expect(text).not.toContain('CANARY');
      expect(url).toContain('%5Bredacted%5D');
      expect(text).toContain('%5Bredacted%5D');
    }

    for (const input of [
      'https://x.test/%43ANARY%2f%53ECRET',
      'https://x.test/%61lice%40example.test',
    ]) {
      const options = { redactValues: ['CANARY/SECRET'] };
      expect(sanitizeUrl(input, options)).toBe('https://x.test/%5Bredacted%5D');
      expect(sanitizeText(`failed ${input}`, options)).not.toMatch(
        /CANARY|alice|example\.test/iu,
      );
    }

    expect(
      sanitizeUrl('https://x.test/a?safe=CANARY+SECRET', {
        allowUrlQuery: true,
        redactValues: ['CANARY SECRET'],
      }),
    ).toBe('https://x.test/a?safe=%5Bredacted%5D');

    const doubleEncodedOptions = {
      allowUrlFragment: true,
      allowUrlQuery: true,
      redactValues: ['CANARY/SECRET'],
    };
    for (const input of [
      'https://x.test/CANARY%252FSECRET',
      'https://x.test/alice%2540example.test',
    ]) {
      expect(sanitizeUrl(input, doubleEncodedOptions)).toBe(
        'https://x.test/%5Bredacted%5D',
      );
      expect(sanitizeText(`failed ${input}`, doubleEncodedOptions)).not.toMatch(
        /CANARY|alice|example\.test/iu,
      );
    }
    expect(
      sanitizeUrl('https://x.test/a?safe=CANARY%252FSECRET', {
        ...doubleEncodedOptions,
        allowUrlFragment: false,
      }),
    ).toBe('https://x.test/a?safe=%5Bredacted%5D');
    for (const encodedValue of [
      'CANARY%2BSECRET',
      'CANARY%252BSECRET',
      'CANARY%252BTOP%2BSECRET',
      'CANARY%25252BTOP%252BSECRET',
      '4111%2B1111%2B1111%2B1111',
      '4111%252B1111%252B1111%252B1111',
    ]) {
      expect(
        sanitizeUrl(`https://x.test/a?safe=${encodedValue}`, {
          allowUrlQuery: true,
          redactValues: ['CANARY SECRET', 'CANARY+TOP SECRET'],
        }),
      ).toBe('https://x.test/a?safe=%5Bredacted%5D');
    }
    expect(
      sanitizeUrl('https://x.test/a?CANARY%252BTOP%2BSECRET=safe', {
        allowUrlQuery: true,
        redactValues: ['CANARY+TOP SECRET'],
      }),
    ).toBe('https://x.test/a?%5Bredacted%5D=%5Bredacted%5D');
    expect(
      sanitizeUrl('https://x.test/a#alice%2540example.test', {
        ...doubleEncodedOptions,
        allowUrlQuery: false,
      }),
    ).toBe('https://x.test/a#[redacted]');

    let overEncoded = 'CANARY/SECRET';
    for (let pass = 0; pass < 17; pass += 1) {
      overEncoded = encodeURIComponent(overEncoded);
    }
    expect(
      sanitizeUrl(`https://x.test/${overEncoded}`, doubleEncodedOptions),
    ).toBe('https://x.test/%5Bredacted%5D');
  });

  it('fails closed for encoded whole URLs and bounded encoded text', () => {
    const raw =
      'https://user:pass@example.test/path?token=secret#fragment-secret';
    for (const passes of [1, 2, 8, 16, 17, 20]) {
      let encoded = raw;
      for (let pass = 0; pass < passes; pass += 1) {
        encoded = encodeURIComponent(encoded);
      }
      expect(sanitizeText(encoded)).toBe('[redacted]');
      expect(sanitizeText(`failed ${encoded}`)).toBe('[redacted]');
    }

    const byteEncoded = [...new TextEncoder().encode(raw)]
      .map((byte) => `%${byte.toString(16).padStart(2, '0')}`)
      .join('');
    expect(sanitizeText(byteEncoded)).toBe('[redacted]');
    expect(sanitizeText(`${byteEncoded}%ZZ`)).toBe('[redacted]');

    expect(sanitizeText('token%3Dsecret')).toBe('[redacted]');
    expect(sanitizeText('token%3Dsecret/path')).toBe('[redacted]');
    expect(sanitizeText('token%ZZ=secret')).toBe('[redacted]');
    expect(sanitizeText('hello%20world')).toBe('hello%20world');
    expect(sanitizeText('%C3%A9')).toBe('%C3%A9');
    expect(sanitizeText('%C3%A9', { redactValues: ['é'] })).toBe('[redacted]');
    expect(sanitizeText('value%20%ZZ')).toBe('[redacted]');
    expect(sanitizeText('failed(https://safe.test/hello%20world)')).toBe(
      'failed(https://safe.test/hello%20world)',
    );
    for (const [input, expected] of [
      [
        "https://example.test/o'hare?safe=private#fragment-private",
        "https://example.test/o'hare",
      ],
      [
        'https://example.test/o"hare?safe=private#fragment-private',
        'https://example.test/o%22hare',
      ],
      [
        'https://example.test/o<hare?safe=private#fragment-private',
        'https://example.test/o%3Chare',
      ],
      [
        'failed "https://example.test/path?safe=private#fragment-private"',
        'failed "https://example.test/path"',
      ],
      [
        "failed 'https://example.test/path?safe=private#fragment-private'",
        "failed 'https://example.test/path'",
      ],
      [
        'failed `https://example.test/path?safe=private#fragment-private`',
        'failed `https://example.test/path`',
      ],
      [
        'failed <https://example.test/path?safe=private#fragment-private>',
        'failed <https://example.test/path>',
      ],
      [
        'failed "https://example.test/path?safe=private#fragment-private',
        'failed "https://example.test/path',
      ],
    ] satisfies readonly (readonly [string, string])[]) {
      const sanitized = sanitizeText(input);
      expect(sanitized).toBe(expected);
      expect(sanitized).not.toMatch(/private|fragment/iu);
    }
    for (const [opener, closer] of [
      ["'", "'"],
      ['"', '"'],
      ['`', '`'],
      ['<', '>'],
    ] satisfies readonly (readonly [string, string])[]) {
      const rawUrl = `https://example.test/o${closer}hare?safe=CANARY#FRAG`;
      const sanitizedUrl = sanitizeUrl(rawUrl);
      expect(sanitizeText(`failed ${opener}${rawUrl}`)).toBe(
        `failed ${opener}${sanitizedUrl}`,
      );
      expect(sanitizeText(`failed ${opener}${rawUrl}${closer}`)).toBe(
        `failed ${opener}${sanitizedUrl}${closer}`,
      );
    }
    for (const [separator, expectedPath] of [
      [' ', 'a%20b'],
      ['\t', 'ab'],
      ['\n', 'ab'],
      ['\r', 'ab'],
      ['\f', 'a%0Cb'],
      ['\v', 'a%0Bb'],
      ['\u00a0', 'a%C2%A0b'],
      ['\u2028', 'a%E2%80%A8b'],
      ['\u2029', 'a%E2%80%A9b'],
    ] satisfies readonly (readonly [string, string])[]) {
      const input = `https://example.test/a${separator}b?safe=CANARY#FRAGMENT`;
      const expected = `https://example.test/${expectedPath}`;
      expect(sanitizeUrl(input)).toBe(expected);
      expect(sanitizeText(input)).toBe('[redacted]');
      expect(sanitizeText(`failed ${input}`)).toBe('[redacted]');
    }
    for (const separator of [
      ' ',
      '\t',
      '\n',
      '\r',
      '\f',
      '\v',
      '\u00a0',
      '\u2028',
      '\u2029',
    ]) {
      for (const input of [
        `https://example.test/path${separator}?safe=CANARY#FRAGMENT`,
        `https://example.test/path${separator}#CANARY`,
        `https://example.test/path${separator}?${separator}CANARY`,
        `https://example.test/path${separator}#${separator}CANARY`,
        `https://example.test/a${separator}b?${separator}CANARY`,
        `https://example.test/a${separator}b#${separator}CANARY`,
        `https://example.test/a${separator}b c?${separator}CANARY`,
        `https://example.test/${separator}ab${separator}?safe=CANARY#FRAGMENT`,
        `https://example.test/path?safe=CANARY${separator}SECRET#FRAGMENT`,
        `https://example.test/path#CANARY${separator}FRAGMENT`,
        `https://example.test/path?safe=CANARY#FRAGMENT${separator}SECRET`,
      ]) {
        for (const sanitized of [
          sanitizeText(input),
          sanitizeText(`failed ${input}`),
        ]) {
          expect(sanitized).toBe('[redacted]');
        }
      }
    }
    for (const [input, expected] of [
      ['failed https://safe.test/path then what? retry now', '[redacted]'],
      [
        'visit https://safe.test/path and see ticket #123 tomorrow',
        '[redacted]',
      ],
      [
        'failed "https://safe.test/path" then what? retry now',
        'failed "https://safe.test/path" then what? retry now',
      ],
      [
        'first https://safe.test/path then https://other.test/path?safe=private',
        '[redacted]',
      ],
      [
        'first https://safe.test/path?safe=private then https://other.test/path',
        '[redacted]',
      ],
      [
        'first https://safe.test/path?safe=private https://other.test/path',
        'first https://safe.test/path https://other.test/path',
      ],
      ['ratio 1/2 is valid #example', 'ratio 1/2 is valid #example'],
      ['date 2026/07/11 is valid', 'date 2026/07/11 is valid'],
      ['read docs/guide for details', 'read docs/guide for details'],
      ['café/guide is valid #example', 'café/guide is valid #example'],
      ['文件/路径 is valid #example', '文件/路径 is valid #example'],
      ['версия/два is valid #example', 'версия/два is valid #example'],
      ['C++/CLI is valid #example', 'C++/CLI is valid #example'],
      ['foo_/bar is valid #example', 'foo_/bar is valid #example'],
      [
        'ordinary note: contact user@example.test for help',
        'ordinary note: contact [redacted] for help',
      ],
      [
        'message: email alice@example.test now',
        'message: email [redacted] now',
      ],
    ] satisfies readonly (readonly [string, string])[]) {
      expect(sanitizeText(input)).toBe(expected);
    }
    for (const input of [
      'https://a.test/x?safe=PUBLIC CANARY https://b.test/y',
      'https://a.test/x#PUBLIC CANARY https://b.test/y',
      'https://a.test/x?safe=PUBLIC intervening CANARY "https://b.test/y"',
      `https://a.test/x?safe=PUBLIC${'A'.repeat(1_100)} CANARY`,
      `https://a.test/x#PUBLIC${'A'.repeat(1_100)} CANARY`,
    ]) {
      expect(sanitizeText(input)).toBe('[redacted]');
    }
    expect(
      sanitizeText('http: '.repeat(6_400), { maxStringLength: 40_000 }),
    ).toBe('[redacted]');

    const whitespaceDifferentialBase =
      'https://example.test/ab?safe=CANARY#FRAGMENT';
    const pathOffset = 'https://example.test/'.length;
    for (const separator of [' ', '\t', '\u00a0']) {
      for (
        let firstOffset = pathOffset;
        firstOffset < whitespaceDifferentialBase.length;
        firstOffset += 1
      ) {
        for (
          let secondOffset = firstOffset;
          secondOffset < whitespaceDifferentialBase.length;
          secondOffset += 1
        ) {
          const firstInsertion = `${whitespaceDifferentialBase.slice(0, firstOffset)}${separator}${whitespaceDifferentialBase.slice(firstOffset)}`;
          const input = `${firstInsertion.slice(0, secondOffset + 1)}${separator}${firstInsertion.slice(secondOffset + 1)}`;
          expect(sanitizeText(input)).not.toMatch(/CANARY|FRAGMENT/iu);
        }
      }
    }

    for (const nestedRaw of [
      'https://user:pass@localhost',
      'https://internal/path?safe=private#fragment',
      'ftp://user:pass@localhost/private',
      'file:///Users/private/path',
      'mailto:user@localhost',
    ]) {
      const nested = encodeURIComponent(nestedRaw);
      for (const input of [
        `https://safe.test/${nested}`,
        `./${nested}`,
        `//safe.test/${nested}`,
        `https://safe.test/a?next=${nested}`,
        `https://safe.test/a#${nested}`,
      ]) {
        const options = {
          allowUrlFragment: true,
          allowUrlQuery: true,
        };
        const sanitizedUrl = sanitizeUrl(input, options);
        const sanitizedText = sanitizeText(input, options);
        expect(sanitizedUrl).toMatch(/%5Bredacted%5D|\[redacted\]/iu);
        expect(sanitizedText).toMatch(/%5Bredacted%5D|\[redacted\]/iu);
        for (const canary of ['user', 'pass', 'internal', 'private']) {
          expect(decodeURIComponent(sanitizedUrl)).not.toContain(canary);
          expect(decodeURIComponent(sanitizedText)).not.toContain(canary);
        }
      }
    }

    expect(sanitizeText('failed ftp://user:pass@localhost/path')).toBe(
      'failed [unsupported-url]',
    );

    const encodedHostile = encodeURIComponent('https://user:pass@localhost');
    for (const separator of [',', ';', '|']) {
      const sanitized = sanitizeText(
        `${encodedHostile}${separator}https://safe.test/path`,
      );
      expect(sanitized).not.toMatch(/user|pass|localhost/iu);
      expect(sanitized).toContain('https://safe.test/path');
    }
    for (const password of [
      '(CANARY)',
      "'CANARY'",
      'pa(ss)word',
      "-_.!~*'()CANARY",
      '{CANARY}',
    ]) {
      const encodedCredentialUrl = encodeURIComponent(
        `https://user:${password}@localhost/path?safe=private#fragment`,
      );
      for (const wrapped of [
        encodedCredentialUrl,
        `failed(${encodedCredentialUrl})`,
        `value='${encodedCredentialUrl}'`,
      ]) {
        expect(sanitizeText(wrapped)).not.toMatch(
          /CANARY|pa\(ss\)word|private|fragment/iu,
        );
      }
    }
    for (const mixedPassword of ['{CANARY}', 'pa{ss}word']) {
      const mixedEncodedCredential = `https%3A%2F%2Fuser%3A${mixedPassword}%40localhost%2Fpath`;
      expect(sanitizeText(mixedEncodedCredential)).not.toMatch(
        /CANARY|pa\{ss\}word|localhost/iu,
      );
    }
    for (const mixedWhitespacePassword of [
      ' CANARY ',
      'pa ss word',
      'pa\tss\nword',
    ]) {
      const mixedEncodedCredential = `https%3A%2F%2Fuser%3A${mixedWhitespacePassword}%40localhost%2Fpath`;
      expect(sanitizeText(mixedEncodedCredential)).not.toMatch(
        /CANARY|pa[\s]+ss|localhost/iu,
      );
    }
    for (const rawCredentialUrl of [
      'https://user: CANARY @localhost/path',
      'https://user:pa ss word@localhost/path',
      'https://user @localhost/path',
      'ftp://user: private @localhost/path',
      'https:user:pass@localhost/path',
      'https:user: CANARY @localhost/path',
      'https:/user: CANARY @localhost/path',
      'https:\\user: CANARY @localhost\\path',
      'http:user @127.0.0.1/path',
      'ftp:user: private @localhost/path',
      'ws:user: private @localhost/path',
      '\\\\user:pass@localhost\\path',
      'https:\\\\user:pass@localhost\\path',
    ]) {
      for (const sanitized of [
        sanitizeText(rawCredentialUrl),
        sanitizeUrl(rawCredentialUrl),
      ]) {
        expect(sanitized).not.toMatch(/CANARY|pa ss word|private|pass|user/iu);
      }
    }
    for (const rawCredentialUrl of [
      'https:user:pass@localhost/path',
      'https:user: CANARY @localhost/path',
      'ftp:user: private @localhost/path',
      '\\\\user:pass@localhost\\path',
    ]) {
      const encoded = encodeURIComponent(rawCredentialUrl);
      expect(sanitizeText(encoded)).not.toMatch(
        /CANARY|private|pass|user|localhost/iu,
      );
      expect(sanitizeUrl(encoded)).not.toMatch(
        /CANARY|private|pass|user|localhost/iu,
      );
    }
    for (const [input, expected] of [
      [
        'https://safe.test/path then https://user:pass@localhost/private',
        'https://safe.test/path then https://localhost/private',
      ],
      [
        'https://safe.test/path then https:/user:pass@localhost/private',
        'https://safe.test/path then https://localhost/private',
      ],
      [
        'https://user:pass@localhost/private then https://safe.test/path',
        'https://localhost/private then https://safe.test/path',
      ],
    ] satisfies readonly (readonly [string, string])[]) {
      const sanitized = sanitizeText(input);
      expect(sanitized).toBe(expected);
      expect(sanitized).not.toContain('\u000b');
      expect(sanitized).not.toContain('gt-sanitized-url');
    }
    expect(
      sanitizeText('failed https://safe.test/path', {
        redactValue: '\u000bgt-sanitized-url-0-',
      }),
    ).toBe('failed https://safe.test/path');

    let overBudgetSafeText = 'hello world';
    for (let pass = 0; pass <= 16; pass += 1) {
      overBudgetSafeText = encodeURIComponent(overBudgetSafeText);
    }
    expect(sanitizeText(overBudgetSafeText)).toBe('[redacted]');
  });

  it('enforces depth, breadth, string, node, and total-size budgets', () => {
    expect(sanitizeValue({ one: { two: true } }, { maxDepth: 1 })).toEqual({
      one: '[depth-truncated]',
    });
    expect(sanitizeValue([1, 2, 3], { maxArrayLength: 2 })).toEqual([1, 2]);
    expect(sanitizeValue({ a: 1, b: 2 }, { maxObjectKeys: 1 })).toEqual({
      a: 1,
    });
    expect(sanitizeValue('abcdefgh', { maxStringLength: 5 })).toHaveLength(5);
    expect(sanitizeValue('x'.repeat(40), { maxStringLength: 20 })).toBe(
      'xxxxxxxxx[truncated]',
    );
    expect(
      sanitizeValue(
        { a: { b: { c: { d: { e: { f: true } } } } } },
        { maxDepth: 6, maxObjectKeys: 1 },
      ),
    ).toEqual({
      a: { b: { c: { d: { e: { f: '[node-budget-exceeded]' } } } } },
    });
    expect(
      sanitizeValue({ text: 'x'.repeat(1_000) }, { maxTotalBytes: 64 }),
    ).toBe('[payload-too-large]');
    expect(
      sanitizeValue({ text: 'x'.repeat(1_000) }, { maxTotalBytes: 2 }),
    ).toBe('');
    expect(
      sanitizeValue({ text: 'x'.repeat(1_000) }, { maxTotalBytes: 1 }),
    ).toBe(0);
  });

  it('neutralizes global regex state and redacts randomized canary properties', () => {
    const global = /token/gi;
    for (let index = 0; index < 50; index += 1) {
      const canary = `CANARY_${String(index)}`;
      const value = sanitizeValue(
        { accessToken: canary, safe: `token=${canary}` },
        { sensitiveKeys: [global], redactValues: [canary] },
      );
      expect(JSON.stringify(value)).not.toContain(canary);
      expect(global.lastIndex).toBe(0);
    }
  });

  it('covers malformed options, URL forms, primitives, array descriptors, and budget failures', () => {
    for (const option of [
      { maxDepth: 0 },
      { maxArrayLength: Number.NaN },
      { maxObjectKeys: -1 },
      { maxStringLength: 1.5 },
      { maxTotalBytes: Number.POSITIVE_INFINITY },
    ]) {
      expect(() => sanitizeValue('x', option)).toThrow(TypeError);
    }
    expect(() => sanitizeValue('x', { redactValue: '' })).toThrow(TypeError);
    expect(() =>
      sanitizeValue('x', { sensitiveKeys: ['not-regexp'] as never }),
    ).toThrow(TypeError);

    expect(sanitizeUrl('plain-text')).toBe('plain-text');
    expect(sanitizeUrl('http://[')).toBe('[invalid-url]');
    expect(sanitizeUrl('https://x.test/%ZZ')).toBe(
      'https://x.test/%5Bredacted%5D',
    );
    expect(sanitizeUrl('//user:pass@example.test/a?safe=1#x')).toBe(
      '//example.test/a',
    );
    expect(sanitizeText('Basic abc token')).toBe('Basic [redacted] token');
    expect(sanitizeText('eyJabc.def.ghi')).toBe('[redacted]');
    expect(sanitizeText('user@example.test 123456789012')).toBe(
      '[redacted] [redacted]',
    );

    expect(sanitizeValue(null)).toBeNull();
    expect(sanitizeValue(undefined)).toBeNull();
    expect(sanitizeValue(() => undefined)).toBeNull();
    expect(sanitizeValue(Symbol('x'))).toBeNull();
    expect(sanitizeValue(false)).toBe(false);
    expect(sanitizeValue(1)).toBe(1);

    const array = new Array<unknown>(2);
    Object.defineProperty(array, '0', {
      configurable: true,
      enumerable: true,
      get: () => 'must not run',
    });
    expect(sanitizeValue(array)).toEqual(['[accessor]', null]);

    let descriptorReads = 0;
    const unstable = new Proxy(
      {},
      {
        ownKeys: () => ['value'],
        getOwnPropertyDescriptor: () => {
          descriptorReads += 1;
          return descriptorReads === 1
            ? { configurable: true, enumerable: true, value: 'safe' }
            : undefined;
        },
      },
    );
    expect(sanitizeValue(unstable)).toEqual({ value: '[accessor]' });

    const stringify = vi.spyOn(JSON, 'stringify').mockImplementationOnce(() => {
      throw new Error('serialization unavailable');
    });
    expect(sanitizeValue({ safe: true })).toBe('[unserializable]');
    stringify.mockImplementationOnce(() => {
      throw new Error('serialization unavailable');
    });
    expect(sanitizeValue({ safe: true }, { maxTotalBytes: 2 })).toBe('');
    stringify.mockImplementationOnce(() => {
      throw new Error('serialization unavailable');
    });
    expect(sanitizeValue({ safe: true }, { maxTotalBytes: 1 })).toBe(0);
    stringify.mockRestore();

    const descriptorFailure = new Proxy(
      {},
      {
        ownKeys: () => ['value'],
        getOwnPropertyDescriptor: () => {
          throw new Error('descriptor unavailable');
        },
      },
    );
    expect(sanitizeValue(descriptorFailure)).toEqual({});
  });

  it('handles empty and complete context branches without reading disallowed data', () => {
    expect(sanitizeContext(null)).toEqual({});
    expect(sanitizeContext('not-an-object')).toEqual({});
    expect(sanitizeContext({ browser: {}, request: {} })).toEqual({});

    const unavailableHeaders = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('unavailable');
        },
      },
    );
    const context = sanitizeContext(
      {
        browser: {
          userAgent: 'Example',
          language: 'en',
          viewport: { width: 1280, height: 720 },
        },
        request: {
          method: 'GET',
          url: '/safe?private=1',
          headers: unavailableHeaders,
        },
        metadata: null,
      },
      { allowedMetadataKeys: ['missing'] },
    );
    expect(context).toEqual({
      browser: {
        userAgent: 'Example',
        language: 'en',
        viewport: { width: 1280, height: 720 },
      },
      request: { method: 'GET', url: '/safe' },
    });

    const headers: Record<string, unknown> = {
      'content-type': 'application/json',
      ignored: 'value',
    };
    Object.defineProperty(headers, 'x-request-id', {
      configurable: true,
      enumerable: true,
      value: undefined,
    });
    expect(
      sanitizeContext(
        { request: { headers } },
        { allowedHeaderKeys: ['content-type', 'x-request-id'] },
      ),
    ).toEqual({ request: { headers: { 'content-type': 'application/json' } } });
  });

  it('enforces primitive shapes for browser, viewport, headers, and metadata', () => {
    const context = sanitizeContext({
      browser: {
        userAgent: { raw: 'CANARY' },
        language: 'en',
        viewport: { width: 1, height: 2, sessionOwner: 'CANARY' },
      },
      request: {
        headers: {
          'x-request-id': { raw: 'CANARY' },
          traceparent: 'safe',
        },
      },
      metadata: {
        source: { customerName: 'Alice', opaque: 'CANARY' },
        operation: 'safe-operation',
        lineno: '3',
        retryable: 'yes',
      },
    });

    expect(context).toEqual({
      browser: { language: 'en', viewport: { width: 1, height: 2 } },
      request: { headers: { traceparent: 'safe' } },
      metadata: { operation: 'safe-operation' },
    });
    expect(JSON.stringify(context)).not.toContain('CANARY');
    expect(JSON.stringify(context)).not.toContain('Alice');

    expect(
      sanitizeContext(
        {
          browser: { viewport: { width: '1', height: Number.NaN } },
          request: {
            headers: {
              bool: true,
              nil: null,
              number: 42,
              invalid: Number.NaN,
            },
          },
          metadata: { source: { invalid: true } },
        },
        {
          allowedHeaderKeys: ['bool', 'nil', 'number', 'invalid'],
          allowedMetadataKeys: ['source'],
        },
      ),
    ).toEqual({
      request: { headers: { bool: true, nil: null, number: 42 } },
    });
  });

  it('runs deterministic seeded canary properties across positions and nested graphs', () => {
    let seed = 0x5eed1234;
    const random = (): number => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    const wrappers = [
      (secret: string) => `password=${secret}`,
      (secret: string) => `password='${secret}'`,
      (secret: string) => `{"token":"${secret}"}`,
      (secret: string) => `Bearer ${secret}`,
    ];

    for (let iteration = 0; iteration < 100; iteration += 1) {
      const secret = `CANARY_${String(iteration)}_${String(Math.floor(random() * 1e9))}`;
      const prefix = 'x'.repeat(Math.floor(random() * 40));
      const value = wrappers[iteration % wrappers.length]?.(secret) ?? secret;
      const shared = { note: `${prefix}${value}` };
      const sanitized = sanitizeValue(
        { first: shared, second: shared, nested: [{ value }] },
        { redactValues: [secret], maxStringLength: 80 },
      );
      expect(JSON.stringify(sanitized)).not.toContain(secret);
    }
  });
});
