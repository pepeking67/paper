export type Paper = {
  id: string; title: string; authors: string; year: number | null; tag: string;
  done: boolean; keys: string[]; sourceUrl: string | null; notionUrl: string | null;
  library?: "legacy" | "personal";
  categoryId?: string | null;
  readingStatus?: "unread" | "reading" | "read" | "archived";
  asset?: { id: string; bucketId: string; objectPath: string; checksum: string | null };
};
