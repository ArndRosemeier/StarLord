#!/usr/bin/env node
// Generates the game's art and music through OpenRouter from the prompts in scripts/assets.json.
//
//   OPEN_ROUTER_KEY=... node scripts/gen-assets.mjs            # everything that is missing
//   OPEN_ROUTER_KEY=... node scripts/gen-assets.mjs title menu # just these ids (regenerated)
//
// Raw model output is kept in the git-ignored Media/generated folder; ffmpeg then
// writes the web-sized copies into public/. Already generated raw files are reused,
// so re-running only costs money for missing or explicitly named ids.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "scripts/assets.json"), "utf8"));
const rawDir = join(root, "Media/generated");
const API = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_IMAGE_MODEL = "google/gemini-3.1-flash-image";
const CONCURRENCY = 4;

const key = process.env.OPEN_ROUTER_KEY;
const only = new Set(process.argv.slice(2));

async function post(body) {
  if (!key) throw new Error("OPEN_ROUTER_KEY is not set");
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 400)}`);
  return res;
}

async function image(asset) {
  const style = manifest.styles[asset.style] ?? "";
  const body = {
    model: asset.model ?? DEFAULT_IMAGE_MODEL,
    messages: [{ role: "user", content: `${asset.prompt}\n\n${style}` }],
    modalities: ["image", "text"],
    image_config: { aspect_ratio: asset.aspect ?? "1:1", ...(asset.size ? { image_size: asset.size } : {}) },
  };
  const json = await (await post(body)).json();
  const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error(`no image returned: ${JSON.stringify(json).slice(0, 300)}`);
  return { data: Buffer.from(url.split(",", 2)[1], "base64"), cost: json.usage?.cost ?? 0 };
}

/** Music models only return audio as a stream of base64 chunks. */
async function music(asset) {
  const body = {
    model: asset.model,
    messages: [{ role: "user", content: asset.prompt }],
    modalities: ["audio", "text"],
    audio: { format: "mp3" },
    stream: true,
  };
  const res = await post(body);
  const chunks = [];
  let cost = 0;
  let buffer = "";
  const decoder = new TextDecoder();
  for await (const part of res.body) {
    buffer += decoder.decode(part, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      const ev = JSON.parse(data);
      if (ev.usage?.cost) cost = ev.usage.cost;
      for (const c of ev.choices ?? []) if (c.delta?.audio?.data) chunks.push(Buffer.from(c.delta.audio.data, "base64"));
    }
  }
  if (chunks.length === 0) throw new Error("no audio returned");
  return { data: Buffer.concat(chunks), cost };
}

function ffmpeg(args) {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
}

/** Web copy: images scaled to their width as WebP, music loudness-matched and re-encoded at 128 kbps. */
function publish(asset, raw, kind) {
  const out = join(root, "public", asset.out);
  mkdirSync(dirname(out), { recursive: true });
  if (kind === "image") ffmpeg(["-i", raw, "-vf", `scale=${asset.width}:-2:flags=lanczos`, "-quality", "82", out]);
  else if (asset.trim) {
    // Stings: the model always makes ~30 s, so keep the opening and fade its tail out.
    const fade = 1.5;
    // `fadeIn` softens a clip that starts at full strength; `loudness` (LUFS) defaults to a little above the music.
    const fadeIn = asset.fadeIn ? `afade=t=in:d=${asset.fadeIn},` : "";
    const loudness = asset.loudness ?? -16;
    ffmpeg(["-i", raw, "-t", String(asset.trim), "-af", `${fadeIn}afade=t=out:st=${asset.trim - fade}:d=${fade},loudnorm=I=${loudness}:TP=-1.5`, "-ar", "44100", "-b:a", "128k", out]);
  } else ffmpeg(["-i", raw, "-af", "loudnorm=I=-18:TP=-1.5", "-ar", "44100", "-b:a", "128k", out]);
}

const jobs = [
  ...manifest.images.map((a) => ({ asset: a, kind: "image", ext: "png" })),
  ...manifest.music.map((a) => ({ asset: a, kind: "music", ext: "mp3" })),
].filter((j) => only.size === 0 || only.has(j.asset.id));

mkdirSync(rawDir, { recursive: true });
let total = 0;
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const { asset, kind, ext } = jobs[next++];
    const raw = join(rawDir, `${asset.id}.${ext}`);
    try {
      if (!existsSync(raw) || only.has(asset.id)) {
        const { data, cost } = kind === "image" ? await image(asset) : await music(asset);
        writeFileSync(raw, data);
        total += cost;
        console.log(`generated ${asset.id} ($${cost.toFixed(3)})`);
      }
      publish(asset, raw, kind);
    } catch (e) {
      console.error(`failed ${asset.id}: ${e.message}`);
      process.exitCode = 1;
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`done, spent $${total.toFixed(2)}`);
