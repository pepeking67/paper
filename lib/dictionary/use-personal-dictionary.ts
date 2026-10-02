"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { readAccountCache } from "@/lib/study-sync/storage";
import type { StudySyncStatus } from "@/lib/study-sync/types";
import type { StudyHighlight } from "@/lib/study-tray/types";
import { isPendingDictionaryMeaning, normalizeDictionaryTerm } from "./terms";

/** Kept only to migrate the previous local-only dictionary without deleting its backup. */
export const PERSONAL_DICTIONARY_PAPER_ID = "__personal_dictionary__";

type DictionaryRow = {
  id: string;
  term: string;
  normalized_term: string;
  meaning: string;
  created_at: string;
  updated_at: string;
};

type DictionaryMutation =
  | { kind: "upsert"; entry: StudyHighlight; queuedAt: string }
  | { kind: "delete"; normalizedTerm: string; queuedAt: string };

type DictionaryCache = {
  version: 1;
  entries: StudyHighlight[];
  pending: Record<string, DictionaryMutation>;
};

const EMPTY_CACHE: DictionaryCache = { version: 1, entries: [], pending: {} };

export function usePersonalDictionary() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [entries, setEntries] = useState<StudyHighlight[]>([]);
  const [status, setStatus] = useState<StudySyncStatus>(userId ? "loading" : "guest");
  const cacheRef = useRef<DictionaryCache>(EMPTY_CACHE);
  const identityRef = useRef("");
  const syncingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const replaceCache = useCallback((ownerId: string, cache: DictionaryCache) => {
    cacheRef.current = cache;
    setEntries(cache.entries);
    try { writeDictionaryCache(ownerId, cache); } catch { /* Keep the in-memory copy when storage is full. */ }
  }, []);

  const syncNow = useCallback(async () => {
    const client = getBrowserSupabase();
    const ownerId = userId;
    const identity = ownerId ? `dictionary:${ownerId}` : "";
    if (!client || !ownerId || identityRef.current !== identity || syncingRef.current) return;
    if (!navigator.onLine) { setStatus("offline"); return; }

    const pendingSnapshot = { ...cacheRef.current.pending };
    if (!Object.keys(pendingSnapshot).length) { setStatus("synced"); return; }
    syncingRef.current = true;
    setStatus("syncing");

    try {
      const upserts = Object.values(pendingSnapshot)
        .filter((mutation): mutation is Extract<DictionaryMutation, { kind: "upsert" }> => mutation.kind === "upsert")
        .map(({ entry }) => ({
          user_id: ownerId,
          term: entry.text.trim().slice(0, 200),
          normalized_term: normalizeDictionaryTerm(entry.text).slice(0, 200),
          meaning: (entry.dictionaryMeaning ?? "").trim().slice(0, 100),
          updated_at: entry.dictionaryUpdatedAt ?? new Date().toISOString(),
        }));
      const deletes = Object.values(pendingSnapshot)
        .filter((mutation): mutation is Extract<DictionaryMutation, { kind: "delete" }> => mutation.kind === "delete")
        .map((mutation) => mutation.normalizedTerm);

      if (upserts.length) {
        const { error } = await client.from("personal_dictionary_entries").upsert(upserts, { onConflict: "user_id,normalized_term" });
        if (error) throw error;
      }
      if (deletes.length) {
        const { error } = await client.from("personal_dictionary_entries")
          .delete()
          .eq("user_id", ownerId)
          .in("normalized_term", deletes);
        if (error) throw error;
      }

      const remote = await fetchDictionaryRows(ownerId);
      if (identityRef.current !== identity) return;
      const current = cacheRef.current;
      const remainingPending = { ...current.pending };
      for (const [term, mutation] of Object.entries(pendingSnapshot)) {
        if (remainingPending[term]?.queuedAt === mutation.queuedAt) delete remainingPending[term];
      }
      replaceCache(ownerId, {
        version: 1,
        entries: mergeRemoteWithPending(remote.map(rowToEntry), remainingPending),
        pending: remainingPending,
      });
      setStatus(Object.keys(remainingPending).length ? "saved-local" : "synced");
    } catch {
      if (identityRef.current === identity) setStatus(navigator.onLine ? "error" : "offline");
    } finally {
      syncingRef.current = false;
    }
  }, [replaceCache, userId]);

  const scheduleSync = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void syncNow(); }, 500);
  }, [syncNow]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const identity = userId ? `dictionary:${userId}` : "guest";
    identityRef.current = identity;
    syncingRef.current = false;
    let cancelled = false;

    if (!userId) {
      cacheRef.current = EMPTY_CACHE;
      setEntries([]);
      setStatus("guest");
      return;
    }

    const cached = migrateLegacyDictionaryCache(userId, readDictionaryCache(userId));
    replaceCache(userId, cached);
    setStatus(Object.keys(cached.pending).length ? (navigator.onLine ? "saved-local" : "offline") : "loading");

    void fetchDictionaryRows(userId).then((remote) => {
      if (cancelled || identityRef.current !== identity) return;
      const current = cacheRef.current;
      const recovered = recoverCachedDictionaryEntries(userId, remote.map(rowToEntry), current);
      replaceCache(userId, {
        version: 1,
        entries: mergeRemoteWithPending(remote.map(rowToEntry), recovered.pending),
        pending: recovered.pending,
      });
      if (recovered.didRecover) markCachedDictionaryRecovery(userId);
      if (Object.keys(recovered.pending).length) scheduleSync();
      else setStatus("synced");
    }).catch(() => {
      if (!cancelled && identityRef.current === identity) setStatus(navigator.onLine ? "error" : "offline");
    });

    return () => { cancelled = true; };
  }, [replaceCache, scheduleSync, userId]);

  useEffect(() => {
    function reconnect() {
      if (userId && Object.keys(cacheRef.current.pending).length) {
        setStatus("saved-local");
        void syncNow();
      }
    }
    function disconnect() { if (userId) setStatus("offline"); }
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", disconnect);
    return () => {
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", disconnect);
    };
  }, [syncNow, userId]);

  const mutateLocal = useCallback((normalizedTerm: string, mutation: DictionaryMutation, nextEntries: StudyHighlight[]) => {
    if (!userId) return;
    replaceCache(userId, {
      version: 1,
      entries: sortEntries(nextEntries),
      pending: { ...cacheRef.current.pending, [normalizedTerm]: mutation },
    });
    setStatus(navigator.onLine ? "saved-local" : "offline");
    scheduleSync();
  }, [replaceCache, scheduleSync, userId]);

  const upsert = useCallback((term: string, meaning: string) => {
    const cleanTerm = term.trim().slice(0, 200);
    const cleanMeaning = meaning.trim().slice(0, 100);
    const normalizedTerm = normalizeDictionaryTerm(cleanTerm).slice(0, 200);
    if (!userId || !normalizedTerm || isPendingDictionaryMeaning(cleanMeaning)) return;
    const now = new Date().toISOString();
    const existing = cacheRef.current.entries.find((entry) => normalizeDictionaryTerm(entry.text) === normalizedTerm);
    const entry: StudyHighlight = {
      id: existing?.id ?? crypto.randomUUID(),
      text: cleanTerm,
      page: 0,
      rects: [],
      memo: "",
      kind: "dictionary",
      dictionaryMeaning: cleanMeaning,
      createdAt: existing?.createdAt ?? now,
      dictionaryUpdatedAt: now,
    };
    const nextEntries = [...cacheRef.current.entries.filter((item) => normalizeDictionaryTerm(item.text) !== normalizedTerm), entry];
    mutateLocal(normalizedTerm, { kind: "upsert", entry, queuedAt: now }, nextEntries);
  }, [mutateLocal, userId]);

  const remove = useCallback((id: string) => {
    const entry = cacheRef.current.entries.find((item) => item.id === id);
    if (!entry || !userId) return;
    const normalizedTerm = normalizeDictionaryTerm(entry.text);
    const now = new Date().toISOString();
    mutateLocal(normalizedTerm, { kind: "delete", normalizedTerm, queuedAt: now }, cacheRef.current.entries.filter((item) => item.id !== id));
  }, [mutateLocal, userId]);

  const findMeaning = useCallback((term: string) => {
    const normalizedTerm = normalizeDictionaryTerm(term);
    return cacheRef.current.entries.find((entry) => normalizeDictionaryTerm(entry.text) === normalizedTerm)?.dictionaryMeaning;
  }, []);

  const sortedEntries = useMemo(() => sortEntries(entries), [entries]);
  const noConflictAction = useCallback(async () => {}, []);

  return {
    entries: sortedEntries,
    status,
    conflict: null,
    findMeaning,
    upsert,
    remove,
    chooseServerVersion: noConflictAction,
    chooseDeviceVersion: noConflictAction,
    syncNow,
  };
}

async function fetchDictionaryRows(userId: string): Promise<DictionaryRow[]> {
  const client = getBrowserSupabase();
  if (!client) return [];
  const { data, error } = await client.from("personal_dictionary_entries")
    .select("id,term,normalized_term,meaning,created_at,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DictionaryRow[];
}

function rowToEntry(row: DictionaryRow): StudyHighlight {
  return {
    id: row.id,
    text: row.term,
    page: 0,
    rects: [],
    memo: "",
    kind: "dictionary",
    dictionaryMeaning: row.meaning,
    createdAt: row.created_at,
    dictionaryUpdatedAt: row.updated_at,
  };
}

function mergeRemoteWithPending(remote: StudyHighlight[], pending: Record<string, DictionaryMutation>) {
  const byTerm = new Map(remote.map((entry) => [normalizeDictionaryTerm(entry.text), entry]));
  for (const mutation of Object.values(pending)) {
    if (mutation.kind === "delete") byTerm.delete(mutation.normalizedTerm);
    else byTerm.set(normalizeDictionaryTerm(mutation.entry.text), mutation.entry);
  }
  return sortEntries([...byTerm.values()]);
}

function cachedDictionaryRecoveryKey(userId: string) {
  return `paper-study-personal-dictionary-recovered:${userId}:v2`;
}

export function recoverCachedDictionaryEntries(
  userId: string,
  remote: StudyHighlight[],
  cache: DictionaryCache,
): { pending: Record<string, DictionaryMutation>; didRecover: boolean } {
  if (localStorage.getItem(cachedDictionaryRecoveryKey(userId))) {
    return { pending: cache.pending, didRecover: false };
  }

  const remoteTerms = new Set(remote.map((entry) => normalizeDictionaryTerm(entry.text)));
  const pending = { ...cache.pending };
  let didRecover = false;
  const now = new Date().toISOString();
  for (const entry of cache.entries) {
    const normalizedTerm = normalizeDictionaryTerm(entry.text);
    if (!normalizedTerm || remoteTerms.has(normalizedTerm) || pending[normalizedTerm]?.kind === "delete") continue;
    pending[normalizedTerm] = { kind: "upsert", entry, queuedAt: now };
    didRecover = true;
  }
  return { pending, didRecover };
}

function markCachedDictionaryRecovery(userId: string) {
  try { localStorage.setItem(cachedDictionaryRecoveryKey(userId), new Date().toISOString()); }
  catch { /* Pending mutations remain cached and will be retried. */ }
}

function dictionaryCacheKey(userId: string) {
  return `paper-study-personal-dictionary:${userId}:v1`;
}

function readDictionaryCache(userId: string): DictionaryCache {
  try {
    const parsed = JSON.parse(localStorage.getItem(dictionaryCacheKey(userId)) ?? "null") as Partial<DictionaryCache> | null;
    if (!parsed) return { ...EMPTY_CACHE, entries: [], pending: {} };
    return {
      version: 1,
      entries: validDictionaryEntries(parsed.entries),
      pending: validPendingMutations(parsed.pending),
    };
  } catch {
    return { ...EMPTY_CACHE, entries: [], pending: {} };
  }
}

function writeDictionaryCache(userId: string, cache: DictionaryCache) {
  localStorage.setItem(dictionaryCacheKey(userId), JSON.stringify(cache));
}

function migrateLegacyDictionaryCache(userId: string, cache: DictionaryCache): DictionaryCache {
  const markerKey = `paper-study-personal-dictionary-migrated:${userId}:v1`;
  if (localStorage.getItem(markerKey)) return cache;
  const legacy = readAccountCache(userId, PERSONAL_DICTIONARY_PAPER_ID);
  const legacyEntries = validDictionaryEntries(legacy?.tray.highlights);
  const next = { ...cache, entries: [...cache.entries], pending: { ...cache.pending } };
  for (const entry of legacyEntries) {
    const normalizedTerm = normalizeDictionaryTerm(entry.text);
    if (!normalizedTerm || isPendingDictionaryMeaning(entry.dictionaryMeaning)) continue;
    const migrated = { ...entry, kind: "dictionary" as const, dictionaryUpdatedAt: entry.dictionaryUpdatedAt ?? entry.createdAt };
    if (!next.entries.some((item) => normalizeDictionaryTerm(item.text) === normalizedTerm)) next.entries.push(migrated);
    next.pending[normalizedTerm] = { kind: "upsert", entry: migrated, queuedAt: new Date().toISOString() };
  }
  next.entries = sortEntries(next.entries);
  try {
    writeDictionaryCache(userId, next);
    localStorage.setItem(markerKey, new Date().toISOString());
  } catch { /* Retry migration on the next visit while preserving the legacy cache. */ }
  return next;
}

function validDictionaryEntries(value: unknown): StudyHighlight[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is StudyHighlight => {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry as Partial<StudyHighlight>;
    return typeof candidate.id === "string"
      && typeof candidate.text === "string"
      && typeof candidate.dictionaryMeaning === "string"
      && !isPendingDictionaryMeaning(candidate.dictionaryMeaning);
  }).map((entry) => ({ ...entry, kind: "dictionary", page: 0, rects: [], memo: "" }));
}

function validPendingMutations(value: unknown): Record<string, DictionaryMutation> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, DictionaryMutation> = {};
  for (const [term, mutation] of Object.entries(value as Record<string, unknown>)) {
    if (!mutation || typeof mutation !== "object") continue;
    const candidate = mutation as Partial<DictionaryMutation> & { kind?: string; queuedAt?: string; normalizedTerm?: string; entry?: StudyHighlight };
    if (candidate.kind === "delete" && typeof candidate.normalizedTerm === "string" && typeof candidate.queuedAt === "string") {
      result[term] = { kind: "delete", normalizedTerm: candidate.normalizedTerm, queuedAt: candidate.queuedAt };
    } else if (candidate.kind === "upsert" && candidate.entry && typeof candidate.queuedAt === "string") {
      const [entry] = validDictionaryEntries([candidate.entry]);
      if (entry) result[term] = { kind: "upsert", entry, queuedAt: candidate.queuedAt };
    }
  }
  return result;
}

function sortEntries(entries: StudyHighlight[]) {
  return [...entries].sort((left, right) => (right.dictionaryUpdatedAt ?? right.createdAt).localeCompare(left.dictionaryUpdatedAt ?? left.createdAt));
}
