import { ConfigService } from '@nestjs/config';
import { PostgresService } from './postgres.service';
import { envValidationSchema } from '../config/env.validation';
import { UnavailableGovernanceEventRepository } from './unavailable-governance-event.repository';

describe('PostgresService', () => {
  it('rejects configuration without PostgreSQL', () => {
    const config = new ConfigService();
    jest.spyOn(config, 'get').mockReturnValue(undefined);
    expect(() => new PostgresService(config)).toThrow('POSTGRES_URL');
  });

  it('does not silently accept event persistence without PostgreSQL', async () => {
    const repository = new UnavailableGovernanceEventRepository();

    await expect(
      repository.eventExists('event:1212:address:transaction:0'),
    ).rejects.toThrow('POSTGRES_URL');
  });

  it('reads POSTGRES_URL and destroys its database on shutdown', async () => {
    const service = new PostgresService(
      new ConfigService({
        POSTGRES_URL: 'postgresql://localhost:1/unavailable',
      }),
    );
    expect(service.database).toBeDefined();
    const destroy = jest.spyOn(service.database, 'destroy');
    await service.onApplicationShutdown();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('requires valid PostgreSQL URLs', () => {
    const schema = envValidationSchema.extract('POSTGRES_URL');
    for (const value of [
      'postgresql://localhost/db',
      'postgres://localhost/db',
    ]) {
      expect(schema.validate(value).error).toBeUndefined();
    }
    for (const value of [undefined, '', 'invalid', 'https://localhost/db']) {
      expect(schema.validate(value).error).toBeDefined();
    }
  });

  it('initializes using only a read of the installed schema', async () => {
    const service = new PostgresService(
      new ConfigService({
        POSTGRES_URL: 'postgresql://localhost:1/unavailable',
      }),
    );
    const execute = jest.fn().mockResolvedValue([]);
    const select = jest.spyOn(service.database, 'selectFrom').mockReturnValue({
      select: jest
        .fn()
        .mockReturnValue({ limit: jest.fn().mockReturnValue({ execute }) }),
    } as unknown as ReturnType<typeof service.database.selectFrom>);
    await Promise.all([service.initialize(), service.onModuleInit()]);
    expect(select).toHaveBeenCalledWith('proposals');
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
