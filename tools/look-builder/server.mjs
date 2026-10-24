#!/usr/bin/env node
// Look builder — local server. No dependencies.
// Run from the kit root:  npm run look-builder   (or: node tools/look-builder/server.mjs [--port 8765] [--clip <path>])
// Serves the wizard, lists local clips, streams video with Range support, serves the skill fonts,
// reads transcripts for sample text and saves look.json into video-projects/<slug>/.
import { createServer } from "node:http";
import { createReadStream, existsSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, extname, basename, dirname, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const PORT = Number(argOf("--port", process.env.PORT || 8765));
const startClip = argOf("--clip", "");

const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm"]);
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/mp4", ".webm": "video/webm", ".md": "text/markdown; charset=utf-8",
};

// Fonts live inside the skills. First match wins.
const FONT_DIRS = [
  ".claude/skills/reel-oney/template/fonts",
  ".claude/skills/reel-editorial-oney/template/fonts",
  ".claude/skills/reel-explicativo-oney/template/fonts",
  ".claude/skills/vsl/template/fonts",
  ".claude/skills/anuncios-oney/template/fonts",
].map((d) => join(root, d));

const json = (res, code, obj) => { res.writeHead(code, { "content-type": MIME[".json"], "cache-control": "no-store" }); res.end(JSON.stringify(obj)); };
const notFound = (res, msg = "not found") => json(res, 404, { error: msg });
const isUnder = (p, dir) => { const r = relative(dir, p); return r && !r.startsWith("..") && !isAbsolute(r); };
const slugOk = (s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s || "");

// A clip may live anywhere under the kit or under the user's home folder (it is their own footage).
function allowedClip(p) {
  if (!p) return null;
  const abs = resolve(p);
  if (!VIDEO_EXT.has(extname(abs).toLowerCase())) return null;
  if (!existsSync(abs) || !statSync(abs).isFile()) return null;
  if (!isUnder(abs, root) && !isUnder(abs, homedir())) return null;
  return abs;
}

function listClips() {
  const out = [];
  const push = (abs, project) => {
    try { const st = statSync(abs); out.push({ path: abs, rel: relative(root, abs).split(sep).join("/"), name: basename(abs), project, size: st.size, mtime: st.mtimeMs }); } catch {}
  };
  const vp = join(root, "video-projects");
  if (existsSync(vp)) {
    for (const slug of readdirSync(vp)) {
      const a = join(vp, slug, "assets");
      if (!existsSync(a) || !statSync(a).isDirectory()) continue;
      for (const f of readdirSync(a)) if (VIDEO_EXT.has(extname(f).toLowerCase())) push(join(a, f), slug);
    }
  }
  for (const d of ["meus-videos", "raw-media"]) {
    const p = join(root, d);
    if (!existsSync(p)) continue;
    for (const f of readdirSync(p)) if (VIDEO_EXT.has(extname(f).toLowerCase())) push(join(p, f), null);
  }
  // Prefer the raw / clean / source files first, then newest.
  const rank = (n) => (/^(raw|clean|source)\b/i.test(n) ? 0 : 1);
  out.sort((x, y) => rank(x.name) - rank(y.name) || y.mtime - x.mtime);
  return out;
}

function sampleWords(slug) {
  if (!slugOk(slug)) return null;
  const a = join(root, "video-projects", slug, "assets");
  for (const f of ["transcript.json", "raw.json", "transcript.whisper.json"]) {
    const p = join(a, f);
    if (!existsSync(p)) continue;
    try {
      const t = JSON.parse(readFileSync(p, "utf8"));
      const words = (Array.isArray(t) ? t : t.words || []).filter((w) => w && w.text).map((w) => ({ text: String(w.text).trim(), start: w.start, end: w.end }));
      if (words.length) return { file: f, words: words.slice(0, 60) };
    } catch {}
  }
  return null;
}

function streamFile(req, res, abs, extraHeaders = {}) {
  const st = statSync(abs);
  const type = MIME[extname(abs).toLowerCase()] || "application/octet-stream";
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? Number(m[1]) : 0;
    let end = m && m[2] ? Number(m[2]) : st.size - 1;
    if (Number.isNaN(start) || start >= st.size) { res.writeHead(416, { "content-range": `bytes */${st.size}` }); return res.end(); }
    end = Math.min(end, st.size - 1);
    res.writeHead(206, { "content-type": type, "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${st.size}`, "accept-ranges": "bytes", ...extraHeaders });
    return createReadStream(abs, { start, end }).pipe(res);
  }
  res.writeHead(200, { "content-type": type, "content-length": st.size, "accept-ranges": "bytes", ...extraHeaders });
  createReadStream(abs).pipe(res);
}

function readBody(req) {
  return new Promise((ok, fail) => { let b = ""; req.on("data", (c) => { b += c; if (b.length > 2e6) fail(new Error("body too large")); }); req.on("end", () => ok(b)); req.on("error", fail); });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === "/api/clips") return json(res, 200, { root, startClip: allowedClip(startClip) || null, clips: listClips() });
    if (p === "/api/clip") {
      const abs = allowedClip(url.searchParams.get("path"));
      if (!abs) return notFound(res, "clip not found or not allowed");
      return streamFile(req, res, abs, { "cache-control": "no-store" });
    }
    if (p === "/api/transcript") return json(res, 200, { sample: sampleWords(url.searchParams.get("project")) });
    if (p === "/api/look" && req.method === "GET") {
      const slug = url.searchParams.get("project");
      if (!slugOk(slug)) return json(res, 400, { error: "bad slug" });
      const f = join(root, "video-projects", slug, "look.json");
      return existsSync(f) ? json(res, 200, { look: JSON.parse(readFileSync(f, "utf8")) }) : json(res, 200, { look: null });
    }
    if (p === "/api/look" && req.method === "POST") {
      const body = JSON.parse(await readBody(req) || "{}");
      const slug = body.project;
      if (!slugOk(slug)) return json(res, 400, { error: "Slug inválido: use letras minúsculas, números e hífens." });
      if (!body.look || typeof body.look !== "object") return json(res, 400, { error: "look ausente" });
      const dir = join(root, "video-projects", slug);
      mkdirSync(dir, { recursive: true });
      const f = join(dir, "look.json");
      const look = { ...body.look, savedAt: new Date().toISOString(), project: slug };
      writeFileSync(f, JSON.stringify(look, null, 2) + "\n");
      return json(res, 200, { ok: true, file: relative(root, f).split(sep).join("/") });
    }
    if (p === "/vendor/gsap.min.js") {
      const g = join(root, "node_modules/gsap/dist/gsap.min.js");
      return existsSync(g) ? streamFile(req, res, g) : notFound(res, "run npm ci first");
    }
    if (p.startsWith("/fonts/")) {
      const name = basename(p);
      for (const d of FONT_DIRS) { const f = join(d, name); if (existsSync(f)) return streamFile(req, res, f, { "cache-control": "public, max-age=86400" }); }
      return notFound(res, "font");
    }
    // Static app files.
    const file = p === "/" ? join(here, "index.html") : join(here, p);
    if (!isUnder(file, here) && file !== join(here, "index.html")) return notFound(res);
    if (!existsSync(file) || !statSync(file).isFile()) return notFound(res);
    return streamFile(req, res, file, { "cache-control": "no-store" });
  } catch (e) {
    return json(res, 500, { error: String(e && e.message || e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Look builder: http://localhost:${PORT}/${startClip ? `?clip=${encodeURIComponent(resolve(startClip))}` : ""}`);
  console.log("Clipes listados de video-projects/*/assets, meus-videos/ e raw-media/. Ctrl+C para parar.");
});
