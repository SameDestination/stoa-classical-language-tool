import { createCanvas } from "@napi-rs/canvas";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
const buildDirectory = path.join(desktopDirectory, "build");
const canvas = createCanvas(1024, 1024);
const context = canvas.getContext("2d");

context.fillStyle = "#1e2b27";
context.roundRect(32, 32, 960, 960, 218);
context.fill();

context.fillStyle = "#a24c34";
context.beginPath();
context.arc(512, 512, 326, 0, Math.PI * 2);
context.fill();

context.strokeStyle = "rgba(255, 255, 255, 0.16)";
context.lineWidth = 10;
context.stroke();

context.fillStyle = "#f6f0e4";
context.font = "bold 520px Georgia, serif";
context.textAlign = "center";
context.textBaseline = "middle";
context.fillText("Σ", 512, 522);

await mkdir(buildDirectory, { recursive: true });
await writeFile(path.join(buildDirectory, "icon-1024.png"), canvas.toBuffer("image/png"));
