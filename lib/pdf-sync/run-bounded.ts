export async function runBounded<T, R>(items: T[], worker: (item: T) => Promise<R>, concurrency = 2): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let cursor = 0;
  async function run() { while (cursor < items.length) { const index = cursor++; try { results[index] = { status: "fulfilled", value: await worker(items[index]) }; } catch (reason) { results[index] = { status: "rejected", reason }; } } }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}
