import { objectKeyFor, assetUrlFor, sanitizeFileName } from './storage.helpers';

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
});

describe('objectKeyFor', () => {
  const userId = 'user-abc-123';

  it('starts with uploads/{userId}/', () => {
    const key = objectKeyFor(userId, 'photo.jpg');
    expect(key).toMatch(new RegExp(`^uploads/${userId}/`));
  });

  it('ends with the sanitized filename', () => {
    const key = objectKeyFor(userId, 'photo.jpg');
    expect(key).toMatch(/photo\.jpg$/);
  });

  it('contains a UUID segment between userId and filename', () => {
    const key = objectKeyFor(userId, 'photo.jpg');
    // UUID is 36 chars: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    expect(key).toMatch(
      /uploads\/user-abc-123\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-photo\.jpg/,
    );
  });

  it('strips path separators from the filename (no slashes in key after prefix)', () => {
    const key = objectKeyFor(userId, '../../evil.jpg');
    // Only the prefix part should have slashes
    const afterPrefix = key.slice(`uploads/${userId}/`.length);
    expect(afterPrefix).not.toContain('/');
    expect(afterPrefix).not.toContain('\\');
  });

  it('replaces spaces in filename with hyphens', () => {
    const key = objectKeyFor(userId, 'my photo.jpg');
    expect(key).toMatch(/my-photo\.jpg$/);
  });

  it('generates different keys on two calls with same inputs (UUID randomness)', () => {
    const key1 = objectKeyFor(userId, 'photo.jpg');
    const key2 = objectKeyFor(userId, 'photo.jpg');
    expect(key1).not.toBe(key2);
  });
});

describe('assetUrlFor', () => {
  it('concatenates endpoint, bucket, and key', () => {
    const url = assetUrlFor(
      { endpoint: 'http://localhost:9000', bucket: 'syncflow-assets' },
      'uploads/u1/uuid-photo.jpg',
    );
    expect(url).toBe('http://localhost:9000/syncflow-assets/uploads/u1/uuid-photo.jpg');
  });

  it('handles missing endpoint and bucket gracefully', () => {
    const url = assetUrlFor({}, 'uploads/u1/uuid-photo.jpg');
    expect(url).toBe('//uploads/u1/uuid-photo.jpg');
  });
});
