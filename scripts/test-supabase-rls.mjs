import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = required("SUPABASE_URL");
const key = required("SUPABASE_PUBLISHABLE_KEY");
const credentials = [
  { email: required("RLS_TEST_EMAIL_A"), password: required("RLS_TEST_PASSWORD_A") },
  { email: required("RLS_TEST_EMAIL_B"), password: required("RLS_TEST_PASSWORD_B") },
];
const clients = credentials.map(() => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
const marker = `rls-${Date.now()}`;
const created = { categories: [], papers: [], paths: [] };

try {
  const users = [];
  for (let index = 0; index < clients.length; index += 1) {
    const { data, error } = await clients[index].auth.signInWithPassword(credentials[index]);
    assert.ifError(error);
    assert.ok(data.user && data.session, `test account ${index + 1} did not receive an authenticated session`);
    users.push(data.user);
  }

  const fixtures = [];
  for (let index = 0; index < clients.length; index += 1) {
    const client = clients[index];
    const user = users[index];
    const category = await client.from("paper_categories").insert({ user_id: user.id, name: `${marker}-${index}`, display_order: 0 }).select("id").single();
    assert.ifError(category.error);
    created.categories.push(category.data.id);
    const paper = await client.from("user_papers").insert({ user_id: user.id, category_id: category.data.id, title: `${marker}-${index}`, authors: "RLS test", reading_status: "unread", display_order: 0 }).select("id").single();
    assert.ifError(paper.error);
    created.papers.push(paper.data.id);
    const pdfPath = `${user.id}/${paper.data.id}/${marker}.pdf`;
    const cropPath = `${user.id}/${paper.data.id}/${marker}.webp`;
    assert.ifError((await client.storage.from("paper-pdfs").upload(pdfPath, new Blob(["%PDF-1.4\n% RLS test"], { type: "application/pdf" }))).error);
    assert.ifError((await client.storage.from("paper-area-crops").upload(cropPath, new Blob([new Uint8Array([82, 73, 70, 70])], { type: "image/webp" }))).error);
    created.paths.push({ pdfPath, cropPath });
    assert.ifError((await client.from("paper_assets").insert({ user_id: user.id, paper_id: paper.data.id, kind: "pdf", bucket_id: "paper-pdfs", object_path: pdfPath, original_filename: `${marker}.pdf`, content_type: "application/pdf", byte_size: 20, version: 1, processing_status: "ready" })).error);
    assert.ifError((await client.from("paper_study_states").insert({ user_id: user.id, paper_id: paper.data.id, tray: {}, note_markdown: marker, revision: 1 })).error);
    assert.ifError((await client.from("paper_area_assets").insert({ user_id: user.id, paper_id: paper.data.id, area_id: marker, page: 1, rect: { x: 0, y: 0, width: 0.1, height: 0.1 }, bucket_id: "paper-area-crops", object_path: cropPath, memo: "" })).error);
    fixtures.push({ user, categoryId: category.data.id, paperId: paper.data.id, pdfPath, cropPath });
  }

  for (const [attackerIndex, ownerIndex] of [[0, 1], [1, 0]]) {
    const attacker = clients[attackerIndex];
    const owner = fixtures[ownerIndex];
    for (const [table, column, value] of [
      ["paper_categories", "id", owner.categoryId],
      ["user_papers", "id", owner.paperId],
      ["paper_assets", "paper_id", owner.paperId],
      ["paper_study_states", "paper_id", owner.paperId],
      ["paper_area_assets", "paper_id", owner.paperId],
    ]) {
      const selected = await attacker.from(table).select("*").eq(column, value);
      assert.ifError(selected.error);
      assert.equal(selected.data.length, 0, `${table}: cross-account SELECT leaked a row`);
      const updated = await attacker.from(table).update({ updated_at: new Date().toISOString() }).eq(column, value).select(column);
      assert.ifError(updated.error);
      assert.equal(updated.data.length, 0, `${table}: cross-account UPDATE changed a row`);
      const deleted = await attacker.from(table).delete().eq(column, value).select(column);
      assert.ifError(deleted.error);
      assert.equal(deleted.data.length, 0, `${table}: cross-account DELETE changed a row`);
    }
    const forbiddenInsert = await attacker.from("paper_categories").insert({ user_id: owner.user.id, name: marker, display_order: 0 });
    assert.ok(forbiddenInsert.error, "cross-account INSERT unexpectedly succeeded");

    for (const [bucket, path] of [["paper-pdfs", owner.pdfPath], ["paper-area-crops", owner.cropPath]]) {
      assert.ok((await attacker.storage.from(bucket).download(path)).error, `${bucket}: cross-account download succeeded`);
      assert.ok((await attacker.storage.from(bucket).upload(path.replace(marker, `${marker}-foreign`), new Blob(["x"]))).error, `${bucket}: cross-account upload succeeded`);
      await attacker.storage.from(bucket).remove([path]);
      const ownerRead = await clients[ownerIndex].storage.from(bucket).download(path);
      assert.ifError(ownerRead.error);
    }
  }

  console.log("RLS isolation passed for 5 tables and 2 private Storage buckets using two authenticated user JWTs.");
} finally {
  for (let index = 0; index < clients.length; index += 1) {
    const client = clients[index];
    const paperId = created.papers[index];
    if (paperId) {
      await client.from("paper_area_assets").delete().eq("paper_id", paperId);
      await client.from("paper_study_states").delete().eq("paper_id", paperId);
      await client.from("paper_assets").delete().eq("paper_id", paperId);
      await client.from("user_papers").delete().eq("id", paperId);
    }
    const paths = created.paths[index];
    if (paths) {
      await client.storage.from("paper-pdfs").remove([paths.pdfPath]);
      await client.storage.from("paper-area-crops").remove([paths.cropPath]);
    }
    if (created.categories[index]) await client.from("paper_categories").delete().eq("id", created.categories[index]);
    await client.auth.signOut();
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
