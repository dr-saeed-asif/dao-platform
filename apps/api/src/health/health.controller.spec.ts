import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports that the API is healthy', () => {
    const response = new HealthController().check();

    expect(response.status).toBe('ok');
    expect(response.service).toBe('dao-platform-api');
    expect(Number.isNaN(Date.parse(response.timestamp))).toBe(false);
  });
});
