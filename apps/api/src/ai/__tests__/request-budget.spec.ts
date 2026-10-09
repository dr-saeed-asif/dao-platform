import { abortable, requestSignal, withRequestBudget } from '../request-budget';

describe('AI request budgets', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('cancels stalled work and gives nested stages only the remaining time', async () => {
    let nestedSignal: AbortSignal | undefined;
    const work = withRequestBudget(async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
      return withRequestBudget(async () => {
        nestedSignal = requestSignal();
        return abortable(new Promise(() => {}), nestedSignal);
      }, 100);
    }, 50);
    const assertion = expect(work).rejects.toThrow('deadline');
    await jest.advanceTimersByTimeAsync(50);
    await assertion;
    expect(nestedSignal?.aborted).toBe(true);
  });

  it('keeps concurrent request cancellation isolated and clears its timers', async () => {
    const slow = withRequestBudget(() => new Promise(() => {}), 20);
    const assertion = expect(slow).rejects.toThrow('deadline');
    const fast = withRequestBudget(async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(requestSignal()?.aborted).toBe(false);
      return 'ok';
    }, 50);
    await jest.advanceTimersByTimeAsync(30);
    await assertion;
    await expect(fast).resolves.toBe('ok');
    expect(requestSignal()).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });
});
