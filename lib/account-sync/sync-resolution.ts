import type { LocalStudySnapshot } from "./local-state";
import type { RemoteStudyState } from "./study-state-client";

export type StudySyncAction = "none" | "push-local" | "pull-remote" | "conflict";

export function chooseStudySyncAction(local: LocalStudySnapshot, remote: RemoteStudyState | null): StudySyncAction {
  const localHasContent = Boolean(local.noteMarkdown.trim() || local.tray.highlights.length || (local.tray.areas?.length ?? 0) || local.tray.insights.length || local.tray.memos.length);
  if (!remote) return localHasContent ? "push-local" : "none";
  if (!localHasContent) return "pull-remote";
  if (!local.dirty) return "pull-remote";
  if (local.remoteRevision === null) return "pull-remote";
  return local.remoteRevision === remote.revision ? "push-local" : "conflict";
}
