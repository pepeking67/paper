"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { emptyStudyTray, type StudyTrayData } from "@/lib/study-tray/types";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { hasRevisionConflict, normalizeTray, readAccountCache, sanitizeTrayForServer, writeAccountCache } from "./storage";
import type { AccountStudyCache, StudyStateConflict, StudyStateSnapshot, StudySyncStatus } from "./types";

type ServerRow = { tray: unknown; note_markdown: string; revision: number; updated_at: string };

export function useStudyState(paperId: string) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [tray, setTrayState] = useState<StudyTrayData>(emptyStudyTray);
  const [noteMarkdown, setNoteState] = useState("");
  const [status, setStatus] = useState<StudySyncStatus>("loading");
  const [conflict, setConflict] = useState<StudyStateConflict | null>(null);
  const conflictRef = useRef<StudyStateConflict | null>(null);
  const cacheRef = useRef<AccountStudyCache | null>(null);
  const identityRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyCache = useCallback((cache: AccountStudyCache) => {
    cacheRef.current = cache;
    setTrayState(cache.tray);
    setNoteState(cache.noteMarkdown);
  }, []);

  const syncNow = useCallback(async () => {
    const client = getBrowserSupabase();
    const current = cacheRef.current;
    const identity = `${userId ?? "guest"}:${paperId}`;
    if (!client || !userId || !current?.dirty || identityRef.current !== identity || conflictRef.current) return;
    const ownerId = userId;
    if (!navigator.onLine) { setStatus("offline"); return; }
    setStatus("syncing");
    const serverTray = sanitizeTrayForServer(current.tray);
    const nextRevision = current.baseRevision + 1;

    if (current.baseRevision === 0) {
      const { data, error } = await client.from("paper_study_states").insert({
        user_id: ownerId,
        paper_id: paperId,
        tray: serverTray,
        note_markdown: current.noteMarkdown,
        revision: nextRevision,
      }).select("tray,note_markdown,revision,updated_at").maybeSingle();
      if (error || !data) {
        const remote = await fetchServerRow(ownerId, paperId);
        if (remote) showConflict(current, remote);
        else setStatus("error");
        return;
      }
      commitSynced(current, data as ServerRow);
      return;
    }

    const { data, error } = await client.from("paper_study_states").update({
      tray: serverTray,
      note_markdown: current.noteMarkdown,
      revision: nextRevision,
      updated_at: new Date().toISOString(),
    }).eq("user_id", ownerId).eq("paper_id", paperId).eq("revision", current.baseRevision)
      .select("tray,note_markdown,revision,updated_at").maybeSingle();
    if (error) { setStatus("error"); return; }
    if (!data) {
      const remote = await fetchServerRow(ownerId, paperId);
      if (remote) showConflict(current, remote);
      else setStatus("error");
      return;
    }
    commitSynced(current, data as ServerRow);

    function commitSynced(local: AccountStudyCache, row: ServerRow) {
      if (identityRef.current !== identity) return;
      const saved: AccountStudyCache = { ...local, baseRevision: row.revision, dirty: false, updatedAt: row.updated_at };
      cacheRef.current = saved;
      try { writeAccountCache(ownerId, paperId, saved); } catch { /* Server remains authoritative after sync. */ }
      setStatus("synced");
    }

    function showConflict(local: AccountStudyCache, row: ServerRow) {
      if (identityRef.current !== identity) return;
      const nextConflict = {
        device: { tray: local.tray, noteMarkdown: local.noteMarkdown, revision: local.baseRevision, updatedAt: local.updatedAt },
        server: serverSnapshot(row),
      };
      conflictRef.current = nextConflict;
      setConflict(nextConflict);
      setStatus("conflict");
    }
  }, [paperId, userId]);

  const scheduleSync = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void syncNow(); }, 650);
  }, [syncNow]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const identity = `${userId ?? "guest"}:${paperId}`;
    identityRef.current = identity;
    conflictRef.current = null;
    setConflict(null);
    let cancelled = false;

    if (!userId) {
      cacheRef.current = null;
      setTrayState(emptyStudyTray());
      setNoteState("");
      setStatus("guest");
      return;
    }

    // The personal paper UUID is the only study-state identity.
    // Never import legacy/global paper IDs into an authenticated account.
    const cached = readAccountCache(userId, paperId);
    const initial = cached ?? {
      tray: emptyStudyTray(),
      noteMarkdown: "",
      baseRevision: 0,
      dirty: false,
      updatedAt: new Date().toISOString(),
    };
    applyCache(initial);
    setStatus(initial.dirty ? "saved-local" : "loading");

    void fetchServerRow(userId, paperId).then((remote) => {
      if (cancelled || identityRef.current !== identity) return;
      if (!remote) {
        if (initial.dirty) scheduleSync();
        else setStatus("synced");
        return;
      }
      if (initial.dirty && hasRevisionConflict(initial.baseRevision, remote.revision)) {
        const nextConflict = {
          device: { tray: initial.tray, noteMarkdown: initial.noteMarkdown, revision: initial.baseRevision, updatedAt: initial.updatedAt },
          server: serverSnapshot(remote),
        };
        conflictRef.current = nextConflict;
        setConflict(nextConflict);
        setStatus("conflict");
        return;
      }
      if (initial.dirty) { scheduleSync(); return; }
      const next: AccountStudyCache = { tray: normalizeTray(remote.tray), noteMarkdown: remote.note_markdown, baseRevision: remote.revision, dirty: false, updatedAt: remote.updated_at };
      applyCache(next);
      try { writeAccountCache(userId, paperId, next); } catch { /* Continue with in-memory state. */ }
      setStatus("synced");
    });

    return () => { cancelled = true; };
  }, [applyCache, paperId, scheduleSync, userId]);

  useEffect(() => {
    function reconnect() { if (cacheRef.current?.dirty) { setStatus("saved-local"); void syncNow(); } }
    function disconnect() { if (userId) setStatus("offline"); }
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", disconnect);
    return () => { window.removeEventListener("online", reconnect); window.removeEventListener("offline", disconnect); };
  }, [syncNow, userId]);

  function persistLocal(nextTray: StudyTrayData, nextNote: string) {
    if (!userId) {
      try {
        localStorage.setItem(`paper-study-tray:${paperId}`, JSON.stringify(nextTray));
        localStorage.setItem(`paper-study-note:${paperId}`, nextNote);
      } catch { /* Keep editing in memory when storage quota is exhausted. */ }
      setStatus("guest");
      return;
    }
    const previous = cacheRef.current ?? { tray: emptyStudyTray(), noteMarkdown: "", baseRevision: 0, dirty: false, updatedAt: new Date(0).toISOString() };
    const next: AccountStudyCache = { ...previous, tray: nextTray, noteMarkdown: nextNote, dirty: true, updatedAt: new Date().toISOString() };
    cacheRef.current = next;
    try { writeAccountCache(userId, paperId, next); } catch { /* In-memory state still contains the edit. */ }
    setStatus(navigator.onLine ? "saved-local" : "offline");
    scheduleSync();
  }

  function updateTray(updater: (current: StudyTrayData) => StudyTrayData) {
    setTrayState((current) => {
      const next = updater(current);
      persistLocal(next, noteMarkdown);
      return next;
    });
  }

  function updateNote(next: string) {
    setNoteState(next);
    persistLocal(tray, next);
  }

  async function chooseServerVersion() {
    if (!userId || !conflict) return;
    const next: AccountStudyCache = { tray: conflict.server.tray, noteMarkdown: conflict.server.noteMarkdown, baseRevision: conflict.server.revision, dirty: false, updatedAt: conflict.server.updatedAt };
    applyCache(next);
    try { writeAccountCache(userId, paperId, next); } catch { /* In-memory state still resolves the conflict. */ }
    conflictRef.current = null;
    setConflict(null);
    setStatus("synced");
  }

  async function chooseDeviceVersion() {
    if (!userId || !conflict) return;
    const next: AccountStudyCache = { tray: conflict.device.tray, noteMarkdown: conflict.device.noteMarkdown, baseRevision: conflict.server.revision, dirty: true, updatedAt: new Date().toISOString() };
    applyCache(next);
    try { writeAccountCache(userId, paperId, next); } catch { /* In-memory state still resolves the conflict. */ }
    conflictRef.current = null;
    setConflict(null);
    setStatus("saved-local");
  }

  useEffect(() => {
    if (userId && !conflict && status === "saved-local" && cacheRef.current?.dirty) scheduleSync();
  }, [conflict, scheduleSync, status, userId]);

  return { tray, noteMarkdown, status, conflict, updateTray, updateNote, chooseServerVersion, chooseDeviceVersion, syncNow };
}

async function fetchServerRow(userId: string, paperId: string): Promise<ServerRow | null> {
  const client = getBrowserSupabase();
  if (!client) return null;
  const { data, error } = await client.from("paper_study_states").select("tray,note_markdown,revision,updated_at").eq("user_id", userId).eq("paper_id", paperId).maybeSingle();
  if (error) return null;
  return data as ServerRow | null;
}

function serverSnapshot(row: ServerRow): StudyStateSnapshot {
  return { tray: normalizeTray(row.tray), noteMarkdown: row.note_markdown ?? "", revision: row.revision, updatedAt: row.updated_at };
}
