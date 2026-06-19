import { Injectable } from '@nestjs/common';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

/** Argon2id password hashing (see adr/0003-auth-jwt.md). */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argonHash(plain);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argonVerify(hash, plain);
    } catch {
      return false;
    }
  }
}
