import { chmod, copyFile, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const projectRoot = process.cwd();
const outputRoot = path.join(projectRoot, "outputs", "STOA-Portable");
const templateRoot = path.join(projectRoot, "standalone", "portable");
const sampleRoot = path.join(projectRoot, "app", "developer-defaults", "samples");

const fileSize = async (filename) => (await stat(filename)).size;

const gzipRuntimeTree = async (directory) => {
  let originalBytes = 0;
  let compressedBytes = 0;
  let fileCount = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await gzipRuntimeTree(filename);
      originalBytes += nested.originalBytes;
      compressedBytes += nested.compressedBytes;
      fileCount += nested.fileCount;
      continue;
    }
    if (!/\.(?:ttf|otf|mjs)$/iu.test(entry.name)) continue;
    const original = await readFile(filename);
    const compressed = gzipSync(original, { level: 9 });
    if (compressed.length >= original.length) continue;
    await writeFile(`${filename}.gz`, compressed);
    await unlink(filename);
    originalBytes += original.length;
    compressedBytes += compressed.length;
    fileCount += 1;
  }
  return { originalBytes, compressedBytes, fileCount };
};

const directorySize = async (directory) => {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    total += entry.isDirectory() ? await directorySize(filename) : await fileSize(filename);
  }
  return total;
};

const copyPortableSupportFiles = async () => {
  const supportFiles = [
    "README-使用说明.txt",
    "Start-STOA-macOS.command",
    "Start-STOA-Windows.bat",
    "serve_stoa.py",
  ];
  for (const filename of supportFiles) {
    const source = path.join(templateRoot, filename);
    const destination = path.join(outputRoot, filename);
    if (filename.endsWith(".bat")) {
      // Keep the packaged launcher native to cmd.exe even when the source tree
      // is checked out with Unix line endings on macOS.
      const script = await readFile(source, "utf8");
      await writeFile(destination, script.replace(/\r?\n/gu, "\r\n"), "utf8");
    } else {
      await copyFile(source, destination);
    }
  }
  await chmod(path.join(outputRoot, "Start-STOA-macOS.command"), 0o755);

  const outputSamples = path.join(outputRoot, "official-samples");
  await mkdir(outputSamples, { recursive: true });
  for (const filename of [
    "stoa-ancient-greek.stoa.json",
    "stoa-latin.stoa.json",
    "stoa-classical-chinese.stoa.json",
    "stoa-omni.stoa.json",
  ]) {
    await copyFile(path.join(sampleRoot, filename), path.join(outputSamples, filename));
  }
};

const beforeBytes = await directorySize(outputRoot);

// Dictionaries are user-supplied, device-local data. Remove any stale public
// dictionary tree copied by Vite so a portable rebuild can never accidentally
// reintroduce the former bundled LSJ/OLD assets.
await rm(path.join(outputRoot, "dictionaries"), { force: true, recursive: true });

// The standalone editor does not use the marketing site's social image or
// favicon. Vite copies the entire shared public tree, so explicitly remove
// these website-only artifacts from the customer-facing portable package.
for (const websiteOnlyAsset of ["og.png", "favicon.svg"]) {
  await rm(path.join(outputRoot, websiteOnlyAsset), { force: true });
}

const runtimeCompression = await gzipRuntimeTree(outputRoot);

for (const unusedAsset of ["file.svg", "globe.svg", "window.svg"]) {
  try {
    await unlink(path.join(outputRoot, unusedAsset));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

await copyPortableSupportFiles();

const indexBytes = await fileSize(path.join(outputRoot, "index.html"));
if (indexBytes > 6_000_000) {
  throw new Error(`Portable index.html is unexpectedly large (${indexBytes} bytes); a binary asset was likely inlined.`);
}

const totalBytes = await directorySize(outputRoot);
if (totalBytes > 95_000_000) {
  throw new Error(`Slim portable output is unexpectedly large (${totalBytes} bytes).`);
}

console.log(`Slim portable build ready: index ${(indexBytes / 1_048_576).toFixed(2)} MiB; bundled dictionaries excluded.`);
console.log(`Compressed ${runtimeCompression.fileCount} runtime font/worker files from ${(runtimeCompression.originalBytes / 1_048_576).toFixed(2)} to ${(runtimeCompression.compressedBytes / 1_048_576).toFixed(2)} MiB.`);
console.log(`Final portable folder: ${(totalBytes / 1_048_576).toFixed(2)} MiB (before optimization: ${(beforeBytes / 1_048_576).toFixed(2)} MiB).`);
