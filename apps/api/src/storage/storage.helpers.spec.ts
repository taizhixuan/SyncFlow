import { objectKeyFor, assetUrlFor, sanitizeFileName } from './storage.helpers';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

describe('sanitizeFileName', () => {
  it('strips forward slashes', () => {
    expect(sanitizeFileName('../../evil.jpg')).toBe('....evil.jpg');
  });

  it('strips backslashes', () => {
    expect(sanitizeFileName('some\\file.jpg')).toBe('somefile.jpg');
  });

  it('replaces spaces with hyphens', () => {
    expect(sanitizeFileName('my photo.jpg')).toBe('my-photo.jpg');
  });

  it('leaves a normal filename unchanged', () => {
    expect(sanitizeFileName('photo.jpg')).toBe('photo.jpg');
  });

  it('replaces URL-significant and non-ASCII characters', () => {
    expect(sanitizeFileName('a?b#c%d"<é>.png')).toBe('a_b_c_d____.png');
  });

  it('caps the length so keys stay bounded', () => {
    expect(sanitizeFileName(`${'x'.repeat(300)}.png`).length).toBeLessThanOrEqual(100);
  });

  it('never returns an empty name', () => {
    expect(sanitizeFileName('///')).toBe('file');
  });
});

describe('objectKeyFor', () => {
  const boardId = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';

  it('scopes the key to the board: boards/{boardId}/{uuid}-{name}', () => {
    expect(objectKeyFor(boardId, 'photo.jpg')).toMatch(
      new RegExp(`^boards/${boardId}/${UUID}-photo\\.jpg$`),
    );
  });

  it('strips path separators from the filename (no slashes in key after prefix)', () => {
    const afterPrefix = objectKeyFor(boardId, '../../evil.jpg').slice(`boards/${boardId}/`.length);
    expect(afterPrefix).not.toContain('/');
    expect(afterPrefix).not.toContain('\\');
  });

  it('generates different keys on two calls with same inputs (UUID randomness)', () => {
    expect(objectKeyFor(boardId, 'photo.jpg')).not.toBe(objectKeyFor(boardId, 'photo.jpg'));
  });
});

describe('assetUrlFor', () => {
  it('concatenates endpoint, bucket, and key', () => {
    const url = assetUrlFor(
      { endpoint: 'http://localhost:9000', bucket: 'syncflow-assets' },
      'boards/b1/uuid-photo.jpg',
    );
    expect(url).toBe('http://localhost:9000/syncflow-assets/boards/b1/uuid-photo.jpg');
  });

  it('percent-encodes each key segment but keeps the separators', () => {
    const url = assetUrlFor({ endpoint: 'http://s3', bucket: 'b' }, 'boards/b1/a b#c.png');
    expect(url).toBe('http://s3/b/boards/b1/a%20b%23c.png');
  });

  it('handles missing endpoint and bucket gracefully', () => {
    expect(assetUrlFor({}, 'boards/b1/uuid-photo.jpg')).toBe('//boards/b1/uuid-photo.jpg');
  });
});
