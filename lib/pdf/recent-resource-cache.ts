type CacheEntry<T> = {
  promise: Promise<T>;
  value?: T;
  references: number;
  lastUsed: number;
};

export type CachedResourceHandle<T> = {
  value: T;
  cacheHit: boolean;
  release: () => void;
};

export function createRecentResourceCache<T>({ maxEntries, dispose }: { maxEntries: number; dispose: (value: T) => void | Promise<void> }) {
  const entries = new Map<string, CacheEntry<T>>();
  let clock = 0;

  async function acquire(key: string, loader: () => Promise<T>): Promise<CachedResourceHandle<T>> {
    let entry = entries.get(key);
    const cacheHit = Boolean(entry);
    if (!entry) {
      const created: CacheEntry<T> = {
        promise: Promise.resolve(undefined as T),
        references: 0,
        lastUsed: ++clock,
      };
      created.promise = loader().then((value) => {
        created.value = value;
        prune();
        return value;
      }).catch((error) => {
        if (entries.get(key) === created) entries.delete(key);
        throw error;
      });
      entry = created;
      entries.set(key, created);
    }

    entry.references += 1;
    entry.lastUsed = ++clock;
    prune();

    let value: T;
    try { value = await entry.promise; }
    catch (error) {
      entry.references = Math.max(0, entry.references - 1);
      throw error;
    }

    let released = false;
    return {
      value,
      cacheHit,
      release: () => {
        if (released) return;
        released = true;
        entry!.references = Math.max(0, entry!.references - 1);
        entry!.lastUsed = ++clock;
        prune();
      },
    };
  }

  function prune() {
    while (entries.size > maxEntries) {
      const candidate = [...entries.entries()]
        .filter(([, entry]) => entry.references === 0 && entry.value !== undefined)
        .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0];
      if (!candidate) return;
      const [key, entry] = candidate;
      entries.delete(key);
      void Promise.resolve(dispose(entry.value!)).catch(() => undefined);
    }
  }

  return {
    acquire,
    keys: () => [...entries.keys()],
  };
}
