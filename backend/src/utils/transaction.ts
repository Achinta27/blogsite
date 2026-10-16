import mongoose, { ClientSession } from 'mongoose';

let supported: boolean | null = null;

/** Multi-document transactions need a replica set (Atlas, or a local replica set). */
const transactionsSupported = async (): Promise<boolean> => {
  if (supported === null) {
    const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
    supported = Boolean(hello.setName || hello.msg === 'isdbgrid');
  }
  return supported;
};

/** For tests that switch databases between suites. */
export const resetTransactionSupportCache = () => {
  supported = null;
};

/**
 * Runs `work` inside a transaction when the deployment supports one. On a standalone server
 * `work` receives no session; callers then rely on a compare-and-set update plus a
 * compensating revert if a later write fails (see moderation.service.ts).
 */
export const withTransaction = async <T>(work: (session?: ClientSession) => Promise<T>): Promise<T> => {
  if (!(await transactionsSupported())) return work(undefined);

  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};
