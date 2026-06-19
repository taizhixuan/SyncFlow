import { describe, expect, it } from 'vitest';
import { describeStatus } from './health-status';

describe('describeStatus', () => {
  it('maps ok to a success tone', () => {
    expect(describeStatus('ok')).toEqual({ label: 'All systems go', tone: 'success' });
  });

  it('maps degraded to a warn tone', () => {
    expect(describeStatus('degraded').tone).toBe('warn');
  });

  it('maps down to a danger tone', () => {
    expect(describeStatus('down').tone).toBe('danger');
  });
});
