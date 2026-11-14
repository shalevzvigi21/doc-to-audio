// Copies finished documents (source file + MP3 + folders + listening position)
// from the LOCAL install into a CLOUD account, without converting again.
//
// Usage (see MOVE-TO-CLOUD.ps1, which asks for the cloud login):
//   CLOUD_EMAIL=... CLOUD_PASSWORD=... node scripts/import-to-cloud.mjs [--dry-run]
//
// Safe to re-run: files already present in the cloud account (same name, DONE)
// are skipped.
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLOUD = (process.env.CLOUD_API || "https://doc-to-audio-api.onrender.com").replace(/\/$/, "");
const email = process.env.CLOUD_EMAIL;
const password = process.env.CLOUD_PASSWORD;
const fromEmails = (process.env.FROM_EMAILS || "shalevzvigi21@gmail.com,shalevagentsai@gmail.com")
  .split(",").map((s) => s.trim()).filter(Boolean);
const dryRun = process.argv.includes("--dry-run");

if (!email || !password) {
  console.error("Missing CLOUD_EMAIL / CLOUD_PASSWORD.");
  process.exit(1);
}

// Local DATABASE_URL from apps/api/.env (Prisma would also do this; explicit is clearer).
if (!process.env.DATABASE_URL) {
  const env = readFileSync(path.join(apiDir, ".env"), "utf8");
  const m = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m);
  if (m) process.env.DATABASE_URL = m[1];
}
const prisma = new PrismaClient();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const abs = (p) => (path.isAbsolute(p) ? p : path.resolve(apiDir, p));

async function call(method, url, { token, json, body, headers = {}, tries = 4 } = {}) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(`${CLOUD}${url}`, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(json ? { "content-type": "application/json" } : {}),
          ...headers,
        },
        body: json ? JSON.stringify(json) : body,
        signal: AbortSignal.timeout(15 * 60 * 1000),
      });
      const text = await res.text();
      if (res.status >= 500 && i < tries) { last = `${res.status} ${text}`; await sleep(5000 * i); continue; }
      let data = null;
      try { data = JSON.parse(text); } catch { /* not json */ }
      return { status: res.status, ok: res.ok, data, text };
    } catch (err) {
      last = String(err);
      if (i < tries) await sleep(5000 * i);
    }
  }
  throw new Error(`Request failed: ${method} ${url}: ${last}`);
}

function flattenFolders(nodes, out = []) {
  for (const n of nodes || []) { out.push(n); flattenFolders(n.children || n.folders, out); }
  return out;
}
function allCloudFiles(tree) {
  const files = [...(tree.files || [])];
  for (const f of flattenFolders(tree.folders)) files.push(...(f.files || []));
  return files;
}

console.log(`Cloud: ${CLOUD}`);
console.log("Waking the cloud server (can take up to a minute)...");
const login = await call("POST", "/auth/login", { json: { email, password } });
if (!login.ok || !login.data?.token) {
  console.error(`Cloud login failed (${login.status}). Check the email/password, or register on the site first.`);
  process.exit(1);
}
const token = login.data.token;
console.log(`Logged in as ${email}`);

const treeRes = await call("GET", "/files", { token });
const cloudFiles = allCloudFiles(treeRes.data || {});
const cloudFolders = flattenFolders(treeRes.data?.folders);
const folderIdByName = new Map(cloudFolders.map((f) => [f.name, f.id]));

const rows = await prisma.file.findMany({
  where: { status: "DONE", user: { email: { in: fromEmails } }, audioJob: { audioPath: { not: null } } },
  include: { audioJob: true, folder: true, user: true },
  orderBy: [{ createdAt: "asc" }],
});
if (process.env.ONLY) {
  const only = process.env.ONLY;
  for (let i = rows.length - 1; i >= 0; i--) if (!rows[i].name.includes(only)) rows.splice(i, 1);
}
console.log(`\nFound ${rows.length} finished local document(s) from: ${fromEmails.join(", ")}\n`);

let imported = 0, skipped = 0, failed = 0;
for (const row of rows) {
  const label = row.name.length > 70 ? row.name.slice(0, 67) + "..." : row.name;
  const srcPath = abs(row.path);
  const audioPath = abs(row.audioJob.audioPath);

  if (!existsSync(srcPath) || !existsSync(audioPath)) {
    console.log(`SKIP (file missing on disk): ${label}`);
    skipped++; continue;
  }
  if (cloudFiles.some((c) => c.name === row.name && c.status === "DONE")) {
    console.log(`SKIP (already in cloud): ${label}`);
    skipped++; continue;
  }
  const mb = (statSync(audioPath).size / 1048576).toFixed(1);
  if (dryRun) { console.log(`WOULD IMPORT: ${label}  (audio ${mb} MB, folder: ${row.folder?.name ?? "-"})`); continue; }

  try {
    // Folder (recreate by name)
    let folderId = "";
    if (row.folder) {
      folderId = folderIdByName.get(row.folder.name) ?? "";
      if (!folderId) {
        const f = await call("POST", "/folders", { token, json: { name: row.folder.name } });
        folderId = f.data?.folder?.id ?? f.data?.id ?? "";
        if (folderId) folderIdByName.set(row.folder.name, folderId);
      }
    }

    // 1) source document
    const form = new FormData();
    if (folderId) form.append("folderId", folderId);
    form.append("file", new Blob([readFileSync(srcPath)], { type: row.mimeType }), row.name);
    const up = await call("POST", `/files/upload?displayName=${encodeURIComponent(row.name)}`, { token, body: form });
    const fileId = up.data?.file?.id;
    if (!up.ok || !fileId) throw new Error(`upload ${up.status} ${up.text.slice(0, 150)}`);

    // 2) finished audio
    const q = new URLSearchParams({ duration: String(row.audioJob.duration), lastPosition: String(row.audioJob.lastPosition || 0) });
    const au = await call("PUT", `/files/${fileId}/import-audio?${q}`, {
      token, body: readFileSync(audioPath), headers: { "content-type": "audio/mpeg" },
    });
    if (!au.ok) throw new Error(`audio ${au.status} ${au.text.slice(0, 150)}`);

    console.log(`OK   ${label}  (audio ${mb} MB)`);
    imported++;
  } catch (err) {
    console.log(`FAIL ${label}: ${err.message}`);
    failed++;
  }
}

console.log(`\nDone. Imported ${imported}, skipped ${skipped}, failed ${failed}.${dryRun ? " (dry run, nothing was uploaded)" : ""}`);
await prisma.$disconnect();
process.exit(failed ? 2 : 0);
