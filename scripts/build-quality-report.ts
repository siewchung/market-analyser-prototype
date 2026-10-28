/**
 * Builds data/quality-report.json: the data quality report for the whole sample (40 contracts, minute and daily).
 *
 * Why this exists: analysing all 5.3 million minute bars at once needs about 4 GB of memory, which a browser tab can't
 * spare. So this script analyses one file at a time, keeps only a small summary of each, and saves the combined report.
 * The app loads that file at startup. Re-run it after changing any quality rule (and bump QUALITY_REPORT_VERSION).
 *
 * Usage: npm run download-dataset (once), then npm run build-quality-report
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "vite";

const ROOT = join(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "sample-data", "data");
const OUT_FILE = join(ROOT, "data", "quality-report.json");

/** Every .parquet file under a folder, at any depth, sorted so the output is the same on every run. */
async function findParquetFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".parquet"))
    .map((e) => join(e.parentPath, e.name))
    .sort();
}

async function main(): Promise<void> {
  if (!existsSync(join(DATA_DIR, "minute"))) {
    console.error("No minute data found in sample-data/. Run npm run download-dataset first.");
    process.exitCode = 1;
    return;
  }

  // The app's code uses import paths without file extensions, which plain Node can't follow.
  // Vite's loader can, so the script borrows it to run exactly the same code as the app.
  const vite = await createServer({ root: ROOT, logLevel: "error", server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true } });
  try {
    const { parseFile } = await vite.ssrLoadModule("/src/infrastructure/parsers/index.ts");
    const { load } = await vite.ssrLoadModule("/src/application/analyse.ts");
    const { buildQualityReport, toFileAnalysis } = await vite.ssrLoadModule("/src/application/qualityReport.ts");
    const { DEFAULT_CONFIG } = await vite.ssrLoadModule("/src/domain/config.ts");

    const files = [...(await findParquetFiles(join(DATA_DIR, "minute"))), ...(await findParquetFiles(join(DATA_DIR, "daily")))];
    const analyses = [];
    for (const [index, path] of files.entries()) {
      const name = path.slice(DATA_DIR.length + 1);
      const bytes = await readFile(path);
      const parsed = await parseFile(name, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      // Keep only the summary and issues; the bars are dropped here so memory stays at one file's worth.
      analyses.push(toFileAnalysis(name, load(name, parsed)));
      console.log(`  [${index + 1}/${files.length}] ${name}`);
    }

    const report = buildQualityReport(analyses, DEFAULT_CONFIG);
    await writeFile(OUT_FILE, `${JSON.stringify(report)}\n`);
    console.log(`Wrote ${OUT_FILE}: ${report.totalRows.toLocaleString()} rows, ${report.contracts.length} contracts.`);
  } finally {
    await vite.close();
  }
}

await main();
