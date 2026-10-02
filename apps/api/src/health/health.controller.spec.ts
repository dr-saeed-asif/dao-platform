import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports that the API and PostgreSQL are healthy', async () => {
    const response = await new HealthController({ checkConnection: async () => undefined } as never).check();

    expect(response.status).toBe('ok');
    expect(response.postgres).toBe('ok');
    expect(response.service).toBe('dao-platform-api');
    expect(Number.isNaN(Date.parse(response.timestamp))).toBe(false);
  });
});
