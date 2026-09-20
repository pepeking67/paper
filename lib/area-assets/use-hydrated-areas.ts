"use client";

import { useEffect, useMemo, useState } from "react";
import type { StudyArea } from "@/lib/study-tray/types";
import { loadAreaDataUrl } from "./area-storage";

export function useHydratedAreas(areas: StudyArea[]) {
  const [images, setImages] = useState<Record<string, string>>({});
  const signature = areas.map((area) => `${area.id}:${area.storagePath ?? "local"}`).join("|");

  useEffect(() => {
    let active = true;
    const missing = areas.filter((area) => !area.imageDataUrl && area.storagePath && !images[area.id]);
    for (const area of missing) {
      void loadAreaDataUrl(area.storagePath!).then((dataUrl) => {
        if (active) setImages((current) => ({ ...current, [area.id]: dataUrl }));
      }).catch(() => { /* The placeholder remains visible when a private object cannot be loaded. */ });
    }
    return () => { active = false; };
  // The signature represents the stable storage inputs. Image updates must not restart downloads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return useMemo(() => areas.map((area) => area.imageDataUrl ? area : images[area.id] ? { ...area, imageDataUrl: images[area.id] } : area), [areas, images]);
}
