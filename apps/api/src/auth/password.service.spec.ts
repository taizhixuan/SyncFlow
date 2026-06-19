import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes to an argon2id string distinct from the plaintext', async () => {
    const hash = await service.hash('s3cret-password');
    expect(hash).not.toBe('s3cret-password');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifies the correct password', async () => {
    const hash = await service.hash('correct horse battery');
    expect(await service.verify(hash, 'correct horse battery')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await service.hash('correct horse battery');
    expect(await service.verify(hash, 'wrong password')).toBe(false);
  });
});
