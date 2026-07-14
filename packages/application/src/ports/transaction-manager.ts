/**
 * Infrastructure implementations bind repositories to the active database
 * transaction, commonly with AsyncLocalStorage or explicit request scoping.
 */
export interface TransactionManager {
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}
