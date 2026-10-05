import { configuration } from './configuration';

describe('configuration — webOrigins', () => {
  const saved = process.env.WEB_ORIGIN;
  afterEach(() => {
    if (saved === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = saved;
  });

  // Browsers send a bare origin (scheme://host[:port]); CORS and the CSRF
  // origin guard compare against it exactly, so a configured trailing slash or
  // path would reject the real web app.
  it('normalises each entry to a bare origin', () => {
    process.env.WEB_ORIGIN =
      ' https://syncflows.xyz/ ,https://www.syncflows.xyz/app , http://localhost:5173';
    expect(configuration().webOrigins).toEqual([
      'https://syncflows.xyz',
      'https://www.syncflows.xyz',
      'http://localhost:5173',
    ]);
  });

  it('lowercases the host and drops a default port, as a browser does', () => {
    process.env.WEB_ORIGIN = 'HTTPS://SyncFlows.XYZ:443';
    expect(configuration().webOrigins).toEqual(['https://syncflows.xyz']);
  });
});
