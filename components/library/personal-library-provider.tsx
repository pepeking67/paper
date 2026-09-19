"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import type { Paper } from "@/lib/papers/types";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { isOwnedStoragePath, validatePdfFile } from "@/lib/library/pdf-file";
import { flushStorageCleanup, queueStorageCleanup } from "@/lib/library/storage-cleanup";

export type PersonalCategory = { id: string; name: string; displayOrder: number };
export type PersonalPaperInput = { title: string; authors: string; year: number | null; sourceUrl: string | null; notionUrl: string | null; categoryId: string | null; readingStatus: "unread" | "reading" | "read" | "archived" };

type LibraryContextValue = {
  loading: boolean;
  error: string;
  categories: PersonalCategory[];
  papers: Paper[];
  refresh: () => Promise<void>;
  createCategory: (name: string) => Promise<void>;
  renameCategory: (id: string, name: string) => Promise<void>;
  moveCategory: (id: string, direction: -1 | 1) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  createPaper: (input: PersonalPaperInput, pdf?: File | null) => Promise<string>;
  updatePaper: (id: string, input: PersonalPaperInput) => Promise<void>;
  movePaper: (id: string, direction: -1 | 1) => Promise<void>;
  deletePaper: (id: string) => Promise<void>;
  uploadPdf: (paperId: string, file: File) => Promise<void>;
};

const PersonalLibraryContext = createContext<LibraryContextValue | null>(null);

export function PersonalLibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<PersonalCategory[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);

  const refresh = useCallback(async () => {
    const client = getBrowserSupabase();
    if (!client || !user) { setCategories([]); setPapers([]); setLoading(false); return; }
    setLoading(true);
    setError("");
    const [categoryResult, paperResult, assetResult] = await Promise.all([
      client.from("paper_categories").select("id,name,display_order").order("display_order").order("created_at"),
      client.from("user_papers").select("id,category_id,legacy_paper_id,title,authors,year,source_url,notion_url,reading_status,aliases,display_order").order("display_order").order("created_at"),
      client.from("paper_assets").select("id,paper_id,bucket_id,object_path,checksum,version,created_at").eq("kind", "pdf").eq("processing_status", "ready").order("version", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    const firstError = categoryResult.error || paperResult.error || assetResult.error;
    if (firstError) { setError(firstError.message); setLoading(false); return; }
    const nextCategories = (categoryResult.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name), displayOrder: Number(row.display_order) }));
    const categoryNames = new Map(nextCategories.map((item) => [item.id, item.name]));
    const assetByPaper = new Map<string, NonNullable<Paper["asset"]>>();
    for (const row of assetResult.data ?? []) {
      const paperId = String(row.paper_id);
      if (!assetByPaper.has(paperId)) assetByPaper.set(paperId, { id: String(row.id), bucketId: String(row.bucket_id), objectPath: String(row.object_path), checksum: row.checksum ? String(row.checksum) : null });
    }
    setCategories(nextCategories);
    setPapers((paperResult.data ?? []).map((row) => ({
      id: String(row.id), title: String(row.title), authors: String(row.authors ?? ""), year: row.year === null ? null : Number(row.year),
      tag: categoryNames.get(String(row.category_id)) ?? "개인 논문", done: row.reading_status === "read", keys: Array.isArray(row.aliases) ? row.aliases.filter((value): value is string => typeof value === "string") : [],
      sourceUrl: row.source_url ? String(row.source_url) : null, notionUrl: row.notion_url ? String(row.notion_url) : null, library: "personal" as const,
      categoryId: row.category_id ? String(row.category_id) : null, readingStatus: normalizeReadingStatus(row.reading_status), asset: assetByPaper.get(String(row.id)),
    })));
    void flushStorageCleanup(client, user.id);
    setLoading(false);
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function createCategory(name: string) {
    const client = requireClient();
    const clean = name.trim();
    if (!clean || clean.length > 80) throw new Error("카테고리 이름은 1~80자여야 합니다.");
    const { error: dbError } = await client.from("paper_categories").insert({ user_id: user!.id, name: clean, display_order: categories.length });
    if (dbError) throw dbError;
    await refresh();
  }

  async function renameCategory(id: string, name: string) {
    const clean = name.trim();
    if (!clean || clean.length > 80) throw new Error("카테고리 이름은 1~80자여야 합니다.");
    const { error: dbError } = await requireClient().from("paper_categories").update({ name: clean, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user!.id);
    if (dbError) throw dbError;
    await refresh();
  }

  async function moveCategory(id: string, direction: -1 | 1) {
    const index = categories.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= categories.length) return;
    const ordered = [...categories];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const client = requireClient();
    for (let position = 0; position < ordered.length; position += 1) {
      const { error: dbError } = await client.from("paper_categories").update({ display_order: position }).eq("id", ordered[position].id).eq("user_id", user!.id);
      if (dbError) throw dbError;
    }
    await refresh();
  }

  async function deleteCategory(id: string) {
    const client = requireClient();
    const detach = await client.from("user_papers").update({ category_id: null }).eq("category_id", id).eq("user_id", user!.id);
    if (detach.error) throw detach.error;
    const result = await client.from("paper_categories").delete().eq("id", id).eq("user_id", user!.id);
    if (result.error) throw result.error;
    await refresh();
  }

  async function createPaper(input: PersonalPaperInput, pdf?: File | null) {
    validatePaperInput(input);
    const client = requireClient();
    const { data, error: dbError } = await client.from("user_papers").insert({ user_id: user!.id, category_id: input.categoryId, title: input.title.trim(), authors: input.authors.trim(), year: input.year, source_url: nullable(input.sourceUrl), notion_url: nullable(input.notionUrl), reading_status: input.readingStatus, display_order: papers.filter((paper) => paper.categoryId === input.categoryId).length }).select("id").single();
    if (dbError) throw dbError;
    const id = String(data.id);
    try { if (pdf) await uploadPdf(id, pdf); }
    catch (uploadError) { await client.from("user_papers").delete().eq("id", id).eq("user_id", user!.id); throw uploadError; }
    await refresh();
    return id;
  }

  async function updatePaper(id: string, input: PersonalPaperInput) {
    validatePaperInput(input);
    const { error: dbError } = await requireClient().from("user_papers").update({ category_id: input.categoryId, title: input.title.trim(), authors: input.authors.trim(), year: input.year, source_url: nullable(input.sourceUrl), notion_url: nullable(input.notionUrl), reading_status: input.readingStatus, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user!.id);
    if (dbError) throw dbError;
    await refresh();
  }

  async function movePaper(id: string, direction: -1 | 1) {
    const current = papers.find((paper) => paper.id === id);
    if (!current) return;
    const group = papers.filter((paper) => paper.categoryId === current.categoryId);
    const index = group.findIndex((paper) => paper.id === id);
    const target = index + direction;
    if (target < 0 || target >= group.length) return;
    [group[index], group[target]] = [group[target], group[index]];
    const client = requireClient();
    for (let position = 0; position < group.length; position += 1) {
      const result = await client.from("user_papers").update({ display_order: position }).eq("id", group[position].id).eq("user_id", user!.id);
      if (result.error) throw result.error;
    }
    await refresh();
  }

  async function uploadPdf(paperId: string, file: File) {
    const client = requireClient();
    const validated = await validatePdfFile(file);
    const duplicate = papers.some((paper) => paper.asset?.checksum === validated.checksum);
    if (duplicate) throw new Error("같은 PDF가 이미 이 계정의 라이브러리에 있습니다.");
    const path = `${user!.id}/${paperId}/${validated.checksum}.pdf`;
    if (!isOwnedStoragePath(path, user!.id, paperId)) throw new Error("잘못된 Storage 경로입니다.");
    const upload = await client.storage.from("paper-pdfs").upload(path, file, { contentType: validated.contentType, upsert: false });
    if (upload.error) throw upload.error;
    const latest = await client.from("paper_assets").select("version").eq("paper_id", paperId).eq("user_id", user!.id).eq("kind", "pdf").order("version", { ascending: false }).limit(1).maybeSingle();
    if (latest.error) { await client.storage.from("paper-pdfs").remove([path]); throw latest.error; }
    const asset = await client.from("paper_assets").insert({ user_id: user!.id, paper_id: paperId, kind: "pdf", bucket_id: "paper-pdfs", object_path: path, original_filename: file.name, content_type: validated.contentType, byte_size: validated.size, checksum: validated.checksum, version: Number(latest.data?.version ?? 0) + 1, processing_status: "ready" });
    if (asset.error) { await client.storage.from("paper-pdfs").remove([path]); throw asset.error; }
    await refresh();
  }

  async function deletePaper(id: string) {
    const client = requireClient();
    const [assets, areas] = await Promise.all([
      client.from("paper_assets").select("bucket_id,object_path").eq("paper_id", id).eq("user_id", user!.id),
      client.from("paper_area_assets").select("bucket_id,object_path").eq("paper_id", id).eq("user_id", user!.id),
    ]);
    if (assets.error || areas.error) throw assets.error || areas.error;
    const cleanup = ([...(assets.data ?? []), ...(areas.data ?? [])])
      .filter((row) => (row.bucket_id === "paper-pdfs" || row.bucket_id === "paper-area-crops") && isOwnedStoragePath(String(row.object_path), user!.id, id))
      .map((row) => ({ bucket: row.bucket_id as "paper-pdfs" | "paper-area-crops", path: String(row.object_path) }));
    const result = await client.rpc("delete_user_paper", { p_paper_id: id });
    if (result.error) throw result.error;
    queueStorageCleanup(user!.id, cleanup);
    const pending = await flushStorageCleanup(client, user!.id);
    if (pending) setError(`논문은 삭제됐지만 Storage 파일 ${pending}개의 정리를 재시도합니다.`);
    await refresh();
  }

  function requireClient() {
    const client = getBrowserSupabase();
    if (!client || !user) throw new Error("로그인이 필요합니다.");
    return client;
  }

  const value: LibraryContextValue = { loading, error, categories, papers, refresh, createCategory, renameCategory, moveCategory, deleteCategory, createPaper, updatePaper, movePaper, deletePaper, uploadPdf };
  return <PersonalLibraryContext.Provider value={value}>{children}</PersonalLibraryContext.Provider>;
}

export function usePersonalLibrary() {
  const value = useContext(PersonalLibraryContext);
  if (!value) throw new Error("usePersonalLibrary must be used inside PersonalLibraryProvider");
  return value;
}

function nullable(value: string | null) { const clean = value?.trim(); return clean ? clean : null; }
function normalizeReadingStatus(value: unknown): PersonalPaperInput["readingStatus"] { return value === "reading" || value === "read" || value === "archived" ? value : "unread"; }
function validatePaperInput(input: PersonalPaperInput) {
  if (!input.title.trim() || input.title.trim().length > 500) throw new Error("논문 제목은 1~500자여야 합니다.");
  if (input.year !== null && (!Number.isInteger(input.year) || input.year < 1800 || input.year > 2200)) throw new Error("연도 범위를 확인하세요.");
  for (const value of [input.sourceUrl, input.notionUrl]) if (value) { try { new URL(value); } catch { throw new Error("URL 형식을 확인하세요."); } }
}
