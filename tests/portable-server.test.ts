import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = ["python3", "python"].find((command) =>
  spawnSync(command, ["-c", "import sys; raise SystemExit(sys.version_info.major != 3)"]).status === 0);
const skip = python ? false : "Python 3 is not installed";

let folder = "";
let server: ChildProcess | undefined;
let port = 0;

type Reply = { status: number; headers: Record<string, string | string[] | undefined>; body: string };

const get = (pathname: string, host: string | undefined, method = "GET") =>
  new Promise<Reply>((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (host !== undefined) headers.Host = host;
    const req = request({ host: "127.0.0.1", port, path: pathname, method, headers, setHost: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode ?? 0,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    req.end();
  });

before(async () => {
  if (!python) return;
  // Run a copy of the shipped server in a folder shaped like the Portable package.
  folder = await mkdtemp(path.join(tmpdir(), "stoa-portable-server-"));
  await copyFile(path.join(root, "standalone/portable/serve_stoa.py"), path.join(folder, "serve_stoa.py"));
  await writeFile(path.join(folder, "index.html"), "<!doctype html><title>STOA test</title>");
  await mkdir(path.join(folder, "fonts"));
  await writeFile(path.join(folder, "fonts", "font.ttf.gz"), gzipSync(Buffer.from("font bytes")));
  server = spawn(python, [path.join(folder, "serve_stoa.py")], {
    env: { ...process.env, STOA_NO_BROWSER: "1", PYTHONUNBUFFERED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  port = await new Promise<number>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`The server did not start: ${output}`)), 10_000);
    server!.stdout!.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      const match = output.match(/running at http:\/\/127\.0\.0\.1:(\d+)\//u);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    server!.on("exit", (code) => reject(new Error(`The server exited with ${code}: ${output}`)));
  });
});

after(async () => {
  server?.kill();
  if (folder) await rm(folder, { recursive: true, force: true });
});

test("the Portable server answers requests for 127.0.0.1 and localhost", { skip }, async () => {
  for (const host of [`127.0.0.1:${port}`, `localhost:${port}`, `LOCALHOST:${port}`]) {
    const reply = await get("/", host);
    assert.equal(reply.status, 200, host);
    assert.match(reply.body, /STOA test/u);
  }
});

test("the Portable server refuses other host names, which DNS rebinding would use", { skip }, async () => {
  for (const host of [`attacker.example:${port}`, "127.0.0.1", `127.0.0.1:${port + 1}`, `localhost.attacker.example:${port}`, ""]) {
    assert.equal((await get("/", host)).status, 403, `Host: ${host}`);
  }
  assert.equal((await get("/", undefined)).status, 403, "no Host header");
  assert.equal((await get("/", `attacker.example:${port}`, "HEAD")).status, 403, "HEAD");
});

test("the Portable server does not list folders", { skip }, async () => {
  const reply = await get("/fonts/", `127.0.0.1:${port}`);
  assert.equal(reply.status, 404);
  assert.doesNotMatch(reply.body, /font\.ttf/u);
});

test("the Portable server still serves compressed files transparently", { skip }, async () => {
  const reply = await get("/fonts/font.ttf", `127.0.0.1:${port}`);
  assert.equal(reply.status, 200);
  assert.equal(reply.headers["content-encoding"], "gzip");
  assert.equal(reply.headers["content-type"], "font/ttf");
});
