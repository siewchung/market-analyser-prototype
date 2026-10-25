// Downloads the full Hugging Face sample dataset into sample-data/ (gitignored).
//
// How it works:
// 1. Fetch checksums.sha256. It's the dataset's own list of every file and its expected hash.
// 2. Download each listed file and check its hash, so a broken or partial download is caught.
// 3. Skip files already on disk with the right hash, so re-running only fetches what's missing.
//
// Run with `npm run download-dataset`. Node runs this .ts file directly (no build step).

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const BASE_URL = "https://huggingface.co/datasets/lynx1231/historical-futures-data-sample/resolve/main";
const OUT_DIR = resolve(import.meta.dirname, "..", "sample-data");

/** One line of checksums.sha256: the expected hash and the file's path in the dataset. */
type ManifestEntry = { readonly sha256: string; readonly path: string };

/** What happened to a single file, so the summary at the end can count each case. */
type FileResult = "downloaded" | "skipped" | "failed";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fetchBytes(path: string): Promise<Uint8Array> {
  const response = await fetch(`${BASE_URL}/${path}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${path}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Turns the checksum file ("<hash>  <path>" per line) into a list of entries. */
function parseManifest(text: string): readonly ManifestEntry[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line);
      if (!match?.[1] || !match[2]) {
        throw new Error(`Unexpected line in checksums.sha256: ${line}`);
      }
      return { sha256: match[1], path: match[2] };
    });
}

/** Returns true if the file is already on disk with the expected hash. */
async function isAlreadyDownloaded(localPath: string, expectedHash: string): Promise<boolean> {
  try {
    return sha256(await readFile(localPath)) === expectedHash;
  } catch {
    // A missing file just means "not downloaded yet".
    return false;
  }
}

async function downloadFile(entry: ManifestEntry): Promise<FileResult> {
  const localPath = join(OUT_DIR, entry.path);

  if (await isAlreadyDownloaded(localPath, entry.sha256)) {
    return "skipped";
  }

  try {
    const bytes = await fetchBytes(entry.path);
    const actualHash = sha256(bytes);
    if (actualHash !== entry.sha256) {
      const message = `checksum mismatch (expected ${entry.sha256}, got ${actualHash})`;
      // Price files must match exactly. The publisher's checksum list is stale for a couple of
      // docs (README.md, dataset.json), so for non-data files we keep the file and just warn.
      if (entry.path.startsWith("data/")) {
        throw new Error(message);
      }
      console.warn(`  WARNING ${entry.path}: ${message}; keeping the file anyway`);
    }
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, bytes);
    console.log(`  downloaded ${entry.path} (${(bytes.length / 1024).toFixed(0)} KB)`);
    return "downloaded";
  } catch (error) {
    console.error(`  FAILED ${entry.path}: ${error instanceof Error ? error.message : String(error)}`);
    return "failed";
  }
}

async function main(): Promise<void> {
  console.log(`Downloading dataset into ${OUT_DIR}`);

  const manifestBytes = await fetchBytes("checksums.sha256");
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, "checksums.sha256"), manifestBytes);
  const entries = parseManifest(new TextDecoder().decode(manifestBytes));

  // One file at a time: about 100 MB in total, so the simple approach is quick enough.
  const results: FileResult[] = [];
  for (const entry of entries) {
    results.push(await downloadFile(entry));
  }

  const count = (result: FileResult): number => results.filter((r) => r === result).length;
  console.log(
    `Done: ${count("downloaded")} downloaded, ${count("skipped")} already up to date, ${count("failed")} failed (of ${entries.length}).`,
  );

  if (count("failed") > 0) {
    process.exitCode = 1;
  }
}

await main();
