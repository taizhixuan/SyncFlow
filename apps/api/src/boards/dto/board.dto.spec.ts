import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BOARD_SEARCH_MAX_LENGTH } from '@syncflow/shared';
import { BoardListQueryDto } from './board.dto';

async function errorsFor(query: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(BoardListQueryDto, query);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors.map((e) => e.property);
}

describe('BoardListQueryDto', () => {
  it('accepts the page query plus an ownership filter and a search term', async () => {
    await expect(
      errorsFor({ limit: '10', cursor: 'c', role: 'shared', q: 'road' }),
    ).resolves.toEqual([]);
  });

  it('trims the search term', () => {
    expect(plainToInstance(BoardListQueryDto, { q: '  road  ' }).q).toBe('road');
  });

  it('rejects an unknown filter and an over-long search term', async () => {
    await expect(errorsFor({ role: 'everyone' })).resolves.toEqual(['role']);
    await expect(errorsFor({ q: 'x'.repeat(BOARD_SEARCH_MAX_LENGTH + 1) })).resolves.toEqual(['q']);
  });
});
