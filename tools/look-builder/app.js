// Look builder — app. Seven steps; every card renders the chosen look over a frame of the user's own clip.
import { SKILLS, COLOURS, FONTS, HOOKS, CAPTIONS, ELEMENTS, MOTIONS, PRESETS, CONFLICTS, ldsCaption } from "./looks.mjs";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const byId = (arr, id) => arr.find((x) => x.id === id);

// Legenda Dinâmica Studio (EffectCraft) catalogue, loaded from /api/lds when the user has it installed.
const LDS = { available: false, prontos: [], entradas: [] };
const allCaptions = () => CAPTIONS.concat(LDS.prontos.map(ldsCaption));
const capById = (id) => byId(allCaptions(), id);
const isLds = () => typeof L.captions === "string" && L.captions.startsWith("lds:");
async function loadLds() {
  try { Object.assign(LDS, await fetch("/api/lds").then((x) => x.json())); } catch { LDS.available = false; }
  if (LDS.available) { STEPS[3].help += " As \"Legenda Dinâmica\" rodam no EffectCraft (plugin do Carlos): palavra-chave gigante, conectivos pequenos, entrada palavra por palavra."; if (UI.step === 3 || UI.step === 5) renderStep(); }
}

// ------------------------------------------------------------------ state
const L = { preset: null, skill: null, colours: null, fonts: null, hook: null, captions: null, ldsEntrada: null, elements: [], motion: [], extras: [], notes: "" };
const UI = {
  step: 0, clip: null, clipProject: null, W: 1080, H: 1920, landscape: false, headTop: 620, capTop: 1150, poster: "",
  text: { hook1: "Larguei meu emprego?", hook2: "a parte que ninguém conta", words: "isso era o sonho de verdade e ninguém fala".split(" "), keyword: "sonho", note: "eu quase desisti aqui", comment: "quero esse estilo! como faz?", user: "seu_usuario" },
};
const STEPS = [
  { id: "colours", title: "Cores", help: "Escolha a paleta. Cada passo depois desse usa essas cores. Comece rápido com um preset (um look pronto de uma skill) ou do zero." },
  { id: "fonts", title: "Fontes", help: "Escolha as fontes. Elas vão para o gancho, as legendas, os cards e o motion. Quer outra combinação? Pegue a mais próxima e peça em \"Mais como essa\"." },
  { id: "hook", title: "Gancho", help: "O gancho é o título grande sobre os primeiros 3 segundos. Ele segura o scroll." },
  { id: "captions", title: "Legendas", help: "Como a fala aparece na tela, o vídeo inteiro." },
  { id: "elements", title: "Elementos", help: "Marque todo elemento que você quer nos seus vídeos. Mostrados nas suas cores e fontes." },
  { id: "motion", title: "Motion", help: "Marque o motion que você quer. Desenhado ao vivo nas suas cores e fontes. O primeiro marcado é a entrada padrão dos elementos." },
  { id: "review", title: "Revisão", help: "Confira, escolha a skill que vai executar, resolva conflitos e salve o look.json no projeto." },
];

let mainTl = null, cardTls = [];
const video = $("#video"), stage = $("#stage"), world = $("#world"), cam = $("#cam"), guides = $("#guides");

// ------------------------------------------------------------------ derived style state for renderers
function S() {
  const c = byId(COLOURS, L.colours) || COLOURS[0];
  const f = byId(FONTS, L.fonts) || FONTS[0];
  return { v: c.vars, font: f, text: UI.text, W: UI.W, H: UI.H, landscape: UI.landscape, headTop: UI.headTop, capTop: UI.capTop };
}
function withPick(over) { const s = S(); if (over.colours) s.v = byId(COLOURS, over.colours).vars; if (over.fonts) s.font = byId(FONTS, over.fonts); return s; }

// ------------------------------------------------------------------ clip
async function loadClips() {
  const r = await fetch("/api/clips").then((x) => x.json());
  const sel = $("#clipSelect");
  sel.innerHTML = `<option value="">— escolha um clipe —</option>` + r.clips.map((c) => `<option value="${esc(c.path)}" data-project="${esc(c.project || "")}">${esc(c.project ? c.project + " / " : "")}${esc(c.name)} · ${(c.size / 1e6).toFixed(0)} MB</option>`).join("");
  // Only open a clip the user asked for: ?clip=, --clip on the server, or the last one they used here. Never the first of the list.
  let last = null; try { last = localStorage.getItem(LS + "lastClip"); } catch {}
  const q = new URLSearchParams(location.search).get("clip") || r.startClip || (last && r.clips.some((c) => c.path === last) ? last : null);
  if (q) { sel.value = q; openClip(q, (r.clips.find((c) => c.path === q) || {}).project || null); }
  else toast("Escolha um clipe na lista para começar.");
}
async function openClip(path, project) {
  if (!path) return;
  UI.clip = path; UI.clipProject = project || guessProject(path);
  try { localStorage.setItem(LS + "lastClip", path); } catch {}
  restoreForClip(path);
  $("#clipName").textContent = path.split(/[\\/]/).slice(-3).join("/");
  if (!UI.slugTouched) $("#slug").value = UI.clipProject || slugify(path.split(/[\\/]/).pop().replace(/\.[^.]+$/, ""));
  video.src = `/api/clip?path=${encodeURIComponent(path)}`;
  video.load();
}
// ---- persistence: localStorage per clip (autosave) + look.json already saved in the project
const LS = "look-builder:v1:";
function snapshot() { return { L, framing: { headTop: UI.headTop, capTop: UI.capTop }, text: UI.text, step: UI.step }; }
function autosave() { if (!UI.clip) return; try { localStorage.setItem(LS + UI.clip, JSON.stringify(snapshot())); } catch {} }
function applyLook(j) {
  if (!j) return false;
  const id = (x) => (x && typeof x === "object" ? x.id : x) || null;
  L.preset = j.preset || null; L.skill = j.skill || null;
  L.colours = id(j.colours); L.fonts = id(j.fonts); L.hook = id(j.hook); L.captions = id(j.captions);
  L.ldsEntrada = j.ldsEntrada || (j.captions && j.captions.lds && j.captions.lds.entradaId) || null;
  L.elements = (j.elements || []).map(id).filter(Boolean); L.motion = (j.motion || []).map(id).filter(Boolean);
  L.extras = j.extras || []; L.notes = j.notes || "";
  if (j.framing) { UI.pendingFraming = j.framing; }
  if (j.sampleText) Object.assign(UI.text, j.sampleText);
  if (j.text) Object.assign(UI.text, j.text);
  syncTextInputs();
  return true;
}
async function restoreForClip(path) {
  let local = null; try { local = JSON.parse(localStorage.getItem(LS + path) || "null"); } catch {}
  const hasPicks = (x) => x && (x.colours || x.fonts || x.hook || x.captions || (x.elements || []).length || (x.motion || []).length);
  if (local && hasPicks(local.L) && applyLook({ ...local.L, framing: local.framing, text: local.text })) { UI.step = local.step || 0; toast("Rascunho deste clipe restaurado."); return; }
  if (UI.clipProject) {
    const r = await fetch(`/api/look?project=${encodeURIComponent(UI.clipProject)}`).then((x) => x.json()).catch(() => ({}));
    if (r.look && applyLook(r.look)) { toast(`look.json de ${UI.clipProject} carregado.`); renderStep(); rebuildMain(); }
  }
}
function syncTextInputs() {
  ["hook1", "hook2", "keyword", "note", "comment", "user"].forEach((k) => { const el = $("#" + k); if (el) el.value = UI.text[k] ?? ""; });
  const w = $("#wordsIn"); if (w) w.value = (UI.text.words || []).join(" ");
}
function resetAll() {
  Object.assign(L, { preset: null, skill: null, colours: null, fonts: null, hook: null, captions: null, ldsEntrada: null, elements: [], motion: [], extras: [], notes: "" });
  try { if (UI.clip) localStorage.removeItem(LS + UI.clip); } catch {}
  UI.step = 0; renderStep(); rebuildMain(); toast("Look limpo.");
}
// A coherent random look: one skill, only options native to it.
function surprise() {
  const pool = PRESETS.filter((p) => p.skill);
  const p = pool[Math.floor(Math.random() * pool.length)];
  applyPreset(p.id);
  const nat = (arr) => arr.filter((o) => (o.skills || []).includes(p.skill));
  const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const h = nat(HOOKS); if (h.length) L.hook = rnd(h).id;
  const c = nat(CAPTIONS); if (c.length) L.captions = rnd(c).id;
  const e = nat(ELEMENTS); L.elements = [...new Set([rnd(e), rnd(e), rnd(e)].filter(Boolean).map((x) => x.id))];
  const m = nat(MOTIONS); L.motion = [...new Set([rnd(m), rnd(m)].filter(Boolean).map((x) => x.id))];
  L.preset = null; renderStep(); rebuildMain(); toast(`Surpresa: um look ${SKILLS[p.skill].name}. Troque o que não gostar.`);
}
// ---- head detection (MediaPipe Face Detector in the browser, no Python). Samples frames across the clip,
// keeps the biggest face per frame, estimates head top (hair above the face box) and chin, fills the sliders.
let faceDet = null;
async function loadFaceDetector() {
  if (faceDet) return faceDet;
  const base = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10";
  const mp = await import(`${base}/vision_bundle.mjs`);
  const vision = await mp.FilesetResolver.forVisionTasks(`${base}/wasm`);
  faceDet = await mp.FaceDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite" },
    runningMode: "IMAGE", minDetectionConfidence: 0.5,
  });
  return faceDet;
}
async function detectHead({ silent = false } = {}) {
  if (!UI.clip || !video.videoWidth) return toast("Escolha um clipe antes.");
  const btn = $("#detectHead"); btn.classList.add("busy"); btn.textContent = "Detectando…";
  if (!silent) toast("Detectando a cabeça em alguns frames do clipe…");
  try {
    const det = await loadFaceDetector();
    const v = document.createElement("video"); v.muted = true; v.preload = "auto"; v.src = video.src;
    await new Promise((ok, fail) => { v.onloadedmetadata = ok; v.onerror = () => fail(new Error("não consegui abrir o clipe para análise")); });
    const dur = v.duration || 10, n = Math.min(9, Math.max(4, Math.round(dur / 6)));
    const times = Array.from({ length: n }, (_, i) => Math.min(dur - 0.2, 0.8 + (dur - 1.6) * (i / Math.max(1, n - 1))));
    const cw = UI.landscape ? 640 : 360, ch = UI.landscape ? 360 : 640;
    const c = document.createElement("canvas"); c.width = cw; c.height = ch; const ctx = c.getContext("2d");
    const hits = [];
    for (const t of times) {
      v.currentTime = t; await new Promise((ok) => { v.onseeked = ok; });
      ctx.drawImage(v, 0, 0, cw, ch);
      const r = det.detect(c);
      const d = r.detections.map((x) => x.boundingBox).sort((a, b) => b.width * b.height - a.width * a.height)[0];
      if (d) hits.push({ t, x: d.originX / cw, y: d.originY / ch, w: d.width / cw, h: d.height / ch });
    }
    if (!hits.length) { toast("Nenhum rosto encontrado nesses frames. Ajuste os sliders à mão."); return null; }
    // The BlazeFace box runs roughly eyebrows→chin. Hair adds ~55 % of the box above; chin sits a hair below.
    const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
    const tops = hits.map((h) => (h.y - 0.55 * h.h) * UI.H), chins = hits.map((h) => (h.y + 1.08 * h.h) * UI.H);
    const headTop = Math.round(Math.max(60, q(tops, 0.15)) / 10) * 10;
    const chin = Math.round(q(chins, 0.85) / 10) * 10;
    UI.headTop = Math.min(Number($("#headTop").max), headTop);
    UI.capTop = Math.min(Number($("#capTop").max), chin + (UI.landscape ? 20 : 40));
    UI.face = { x: q(hits.map((h) => h.x), 0.5) * UI.W, y: q(hits.map((h) => h.y), 0.5) * UI.H, w: q(hits.map((h) => h.w), 0.5) * UI.W, h: q(hits.map((h) => h.h), 0.5) * UI.H, frames: hits.length, of: times.length };
    syncSliders(); drawGuides(); renderStep(); rebuildMain(); autosave();
    toast(`Cabeça detectada em ${hits.length} de ${times.length} frames: topo ≈ ${UI.headTop}px, queixo ≈ ${chin}px.`);
    return UI.face;
  } catch (e) {
    toast("Detecção indisponível (precisa de internet na primeira vez): " + (e.message || e));
    return null;
  } finally { btn.classList.remove("busy"); btn.textContent = "Detectar cabeça"; }
}
const guessProject = (p) => { const m = /video-projects[\\/]([a-z0-9-]+)[\\/]/.exec(p); return m ? m[1] : null; };
const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "meu-look";

video.addEventListener("loadedmetadata", () => {
  stage.classList.add("has-clip");
  UI.landscape = video.videoWidth > video.videoHeight;
  UI.W = UI.landscape ? 1920 : 1080; UI.H = UI.landscape ? 1080 : 1920;
  if (UI.landscape) { UI.headTop = 300; UI.capTop = 880; } else { UI.headTop = 620; UI.capTop = 1150; }
  UI.face = null;
  const restored = !!UI.pendingFraming;
  if (UI.pendingFraming) { UI.headTop = UI.pendingFraming.headTop || UI.headTop; UI.capTop = UI.pendingFraming.capTop || UI.capTop; UI.pendingFraming = null; }
  $("#headTop").max = UI.H - 400; $("#capTop").max = UI.H - 200;
  syncSliders(); layoutStage();
  video.currentTime = Math.min(2, (video.duration || 4) / 3);
  renderStep(); rebuildMain();
  if (!restored && $("#autoDetect").checked) detectHead({ silent: true });
});
video.addEventListener("seeked", () => { if (video.paused) capturePoster(); });
video.addEventListener("pause", capturePoster);
video.addEventListener("timeupdate", () => ($("#time").textContent = `${fmt(video.currentTime)} / ${fmt(video.duration || 0)}`));
video.addEventListener("ended", () => { video.currentTime = 0; video.play(); });
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

let posterTimer;
function capturePoster() {
  if (!video.videoWidth) return;
  clearTimeout(posterTimer);
  posterTimer = setTimeout(() => {
    const c = document.createElement("canvas"); c.width = UI.landscape ? 640 : 360; c.height = UI.landscape ? 360 : 640;
    try { c.getContext("2d").drawImage(video, 0, 0, c.width, c.height); UI.poster = c.toDataURL("image/jpeg", 0.8); } catch { UI.poster = ""; }
    $$(".card .cam, .preset .cam").forEach((el) => (el.style.backgroundImage = UI.poster ? `url(${UI.poster})` : "none"));
    if (!$$(".card .cam").length) renderStep();
  }, 150);
}

function layoutStage() {
  const wrap = $(".stage-wrap");
  const maxW = wrap.clientWidth - 20, maxH = Math.max(320, window.innerHeight * 0.52);
  let w = UI.landscape ? maxW : Math.min(maxW, maxH * UI.W / UI.H);
  let h = w * UI.H / UI.W; if (h > maxH) { h = maxH; w = h * UI.W / UI.H; }
  stage.style.width = w + "px"; stage.style.height = h + "px";
  const s = w / UI.W;
  world.style.width = guides.style.width = UI.W + "px"; world.style.height = guides.style.height = UI.H + "px";
  world.style.transform = guides.style.transform = `scale(${s})`;
  drawGuides();
}
function drawGuides() {
  $(".g.head", guides).style.top = UI.headTop + "px";
  $(".g.cap", guides).style.top = UI.capTop + "px";
  const sf = $(".g.safe", guides);
  if (UI.landscape) { Object.assign(sf.style, { left: "96px", right: "96px", top: "96px", height: UI.H - 192 + "px" }); }
  else { Object.assign(sf.style, { left: "65px", right: "65px", top: "270px", height: 1248 - 270 + "px" }); }
  const fb = $(".g.face", guides);
  if (UI.face) { Object.assign(fb.style, { display: "block", left: UI.face.x + "px", top: UI.face.y + "px", width: UI.face.w + "px", height: UI.face.h + "px", right: "auto" }); }
  else fb.style.display = "none";
  guides.style.display = $("#showGuides").checked ? "" : "none";
}
function syncSliders() {
  $("#headTop").value = UI.headTop; $("#headTopV").value = UI.headTop;
  $("#capTop").value = UI.capTop; $("#capTopV").value = UI.capTop;
}

// ------------------------------------------------------------------ steps nav
function renderNav() {
  const counts = { colours: L.colours ? 1 : 0, fonts: L.fonts ? 1 : 0, hook: L.hook ? 1 : 0, captions: L.captions ? 1 : 0, elements: L.elements.length, motion: L.motion.length, review: 0 };
  $("#steps").innerHTML = STEPS.map((s, i) => `<button class="${i === UI.step ? "on" : ""} ${counts[s.id] ? "done" : ""}" data-i="${i}"><span class="n">${i + 1}</span>${s.title}${counts[s.id] > 1 ? `<span class="cnt">${counts[s.id]}</span>` : ""}</button>`).join("");
  $$("#steps button").forEach((b) => (b.onclick = () => go(Number(b.dataset.i))));
  $("#prev").disabled = UI.step === 0;
  $("#next").textContent = UI.step === STEPS.length - 1 ? "Salvar look.json" : `Próximo: ${STEPS[UI.step + 1].title}`;
  $("#extras").textContent = `${L.extras.length} extra${L.extras.length === 1 ? "" : "s"} pedido${L.extras.length === 1 ? "" : "s"}`;
}
function renderPicks() {
  const n = (arr, id) => (byId(arr, id) || {}).name;
  const items = [
    L.colours && ["Cores", n(COLOURS, L.colours), 0], L.fonts && ["Fontes", n(FONTS, L.fonts), 1], L.hook && ["Gancho", n(HOOKS, L.hook), 2],
    L.captions && ["Legendas", (capById(L.captions) || {}).name, 3], L.elements.length && ["Elementos", `${L.elements.length}`, 4], L.motion.length && ["Motion", `${L.motion.length}`, 5],
  ].filter(Boolean);
  $("#picks").innerHTML = items.map(([k, v, i]) => `<button data-i="${i}" title="Ir para ${k}"><i></i>${k}: <b>${esc(v)}</b></button>`).join("");
  $$("#picks button").forEach((b) => (b.onclick = () => go(Number(b.dataset.i))));
}
function go(i) { UI.step = Math.max(0, Math.min(STEPS.length - 1, i)); renderStep(); autosave(); }
$("#prev").onclick = () => go(UI.step - 1);
$("#next").onclick = () => (UI.step === STEPS.length - 1 ? save() : go(UI.step + 1));

// ------------------------------------------------------------------ cards
function killCards() { cardTls.forEach((t) => t.kill()); cardTls = []; }
function frameHtml(S) {
  const ratio = (S.H / S.W) * 100;
  return `<div class="frame" style="padding-bottom:${ratio}%"><div class="cam" style="background:#000 center/cover no-repeat;${UI.poster ? `background-image:url(${UI.poster})` : ""}"></div><div class="world" style="width:${S.W}px;height:${S.H}px"></div></div>`;
}
function scaleWorlds() {
  $$(".card .frame").forEach((f) => { const w = $(".world", f); if (w) w.style.transform = `scale(${f.clientWidth / UI.W})`; });
}
function card({ idx, id, name, desc, skills = [], on, body = "", swatches, multi, step }) {
  const nat = (L.skill && skills.includes(L.skill));
  return `<article class="card ${on ? "on" : ""}" data-id="${id}">
    <span class="check">✓</span>${body}${swatches ? `<div class="sw">${swatches.map((c) => `<i style="background:${c}"></i>`).join("")}</div>` : ""}
    <div class="meta"><span class="num">${idx}</span><b>${esc(name)}</b><span>${esc(desc)}</span><div class="sk">${skills.map((s) => `<i class="${s === L.skill ? "native" : ""}">${esc((SKILLS[s] || { name: s }).name)}</i>`).join("")}${nat ? "" : ""}</div></div>
    <div class="acts"><button class="btn take">${on ? (multi ? "Marcado ✓" : "Escolhido ✓") : multi ? "Marcar" : "Escolher"}</button><button class="btn more">Mais como essa</button></div>
    <div class="more-box"><input placeholder="o que mudar? ex.: mais fina, sem sombra…"><button class="btn sm">Pedir</button></div>
  </article>`;
}
function wireCards(step, multi) {
  $$(".card").forEach((el) => {
    const id = el.dataset.id;
    $(".take", el).onclick = () => { pick(step, id, multi); renderStep(); rebuildMain(); autosave(); };
    $(".more", el).onclick = () => el.classList.toggle("more");
    $(".more-box .btn", el).onclick = () => { const v = $(".more-box input", el).value.trim(); L.extras.push({ step, base: id, ask: v || "variação parecida" }); el.classList.remove("more"); autosave(); toast(`Pedido anotado: ${v || "variação parecida"} (base: ${id})`); renderNav(); };
  });
}
function pick(step, id, multi) {
  if (id.startsWith("lds-in:")) { const v = id.slice(7); L.ldsEntrada = L.ldsEntrada === v ? null : v; L.preset = null; return; }
  if (multi) { const a = L[step]; const i = a.indexOf(id); i >= 0 ? a.splice(i, 1) : a.push(id); }
  else L[step] = L[step] === id ? null : id;
  if (step === "captions" && !isLds()) L.ldsEntrada = null;
  if (step !== "review") L.preset = null;
}
// GIF card body (LDS catalogue previews are 1080×420 strips)
const gifFrame = (src) => `<div class="frame gif" style="padding-bottom:62%"><img src="${esc(src)}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain"></div>`;
const divider = (title, sub) => `<div class="divider" style="grid-column:1/-1"><b>${esc(title)}</b><span>${esc(sub)}</span></div>`;

// ---- preset cards: a mini frame of the clip with the preset's hook and first caption word in its colours/fonts.
// A generated tile at assets/presets/<id>.png|jpg (see assets/presets/PROMPT-CHATGPT.md) replaces the drawn one.
const PRESET_IMG = {};
async function loadPresetImages() {
  try { const r = await fetch("/api/preset-images").then((x) => x.json()); Object.assign(PRESET_IMG, r.images || {}); } catch {}
  if (Object.keys(PRESET_IMG).length && UI.step === 0) renderStep();
}
function presetCard(p) {
  const ratio = (UI.H / UI.W) * 100;
  const img = PRESET_IMG[p.id];
  const frame = !p.skill ? `<div class="pframe blank">∅</div>`
    : img ? `<div class="pframe" style="padding-bottom:${Math.min(ratio, 100)}%"><img src="${img}" alt="" loading="lazy"></div>`
    : `<div class="pframe" style="padding-bottom:${ratio}%"><div class="cam" style="${UI.poster ? `background-image:url(${UI.poster})` : ""}"></div><div class="world" style="width:${UI.W}px;height:${UI.H}px"></div></div>`;
  const acc = p.picks.colours ? byId(COLOURS, p.picks.colours).vars.acc : "#333";
  return `<button class="preset ${L.preset === p.id ? "on" : ""}" data-p="${p.id}" title="${esc(p.desc)}" style="--pacc:${acc}">${frame}<b>${esc(p.name)}</b><span>${esc(p.skill ? (SKILLS[p.skill] || {}).name || p.skill : "nada marcado")}</span></button>`;
}
function fillPresetCards() {
  $$(".preset[data-p]").forEach((el) => {
    const p = byId(PRESETS, el.dataset.p); const w = $(".world", el), f = $(".pframe", el);
    if (!p || !p.skill || !w || !f) return;
    const s = withPick({ colours: p.picks.colours, fonts: p.picks.fonts });
    const hook = byId(HOOKS, p.picks.hook && p.picks.hook !== "none" ? p.picks.hook : "big-caps");
    const caps = byId(CAPTIONS, p.picks.captions && p.picks.captions !== "none" ? p.picks.captions : "one-word-outline");
    w.innerHTML = hook.render(s) + caps.render(s);
    const first = $(".w", w); if (first) first.style.opacity = 1;
    w.style.transform = `scale(${f.clientWidth / UI.W})`;
  });
}

// cycle one-word captions inside an element
function cycleWords(tl, el, start = 0, dt = 0.34, hold = 0) {
  const ws = $$(".w", el); if (!ws.length) return;
  ws.forEach((w, i) => { tl.set(w, { opacity: 1 }, start + i * dt); tl.set(w, { opacity: 0 }, start + (i + 1) * dt + (i === ws.length - 1 ? hold : 0)); });
}
const entrance = (id) => byId(MOTIONS, id) || byId(MOTIONS, "blur-rise");

// ------------------------------------------------------------------ step renderers
function renderStep() {
  killCards();
  const st = STEPS[UI.step];
  renderNav();
  $("#stepKicker").textContent = `Passo ${UI.step + 1} de 7`;
  $("#stepTitle").textContent = st.title;
  $("#progressBar").style.width = `${((UI.step + 1) / STEPS.length) * 100}%`;
  renderPicks();
  $("#stepHelp").textContent = st.help;
  const grid = $("#grid"); grid.classList.toggle("wide", UI.landscape || st.id === "review");
  $("#quick").innerHTML = UI.step === 0 ? `<span class="lbl" style="width:100%">Começo rápido: um look pronto de uma skill. Você muda qualquer peça depois.</span><div class="presets">` + PRESETS.map((p) => presetCard(p)).join("") + `<button class="preset surprise" id="surprise" title="Um look coerente de uma skill, ao acaso"><div class="pframe dice">🎲</div><b>Surpreenda-me</b><span>look coerente, ao acaso</span></button></div>` : "";
  if (UI.step === 0) requestAnimationFrame(fillPresetCards);
  if (st.id === "captions") {
    UI.capFilter = UI.capFilter || "all";
    const lds = LDS.available ? `${LDS.prontos.length} prontos · ${LDS.entradas.length} entradas` : "catálogo não encontrado";
    $("#quick").innerHTML = `<span class="lbl">Mostrar:</span>` +
      [["all", "Todas"], ["kit", "Kit HyperFrames"], ["lds", `Legenda Dinâmica · EffectCraft`]].map(([k, t]) => `<button class="${UI.capFilter === k ? "on" : ""}" data-f="${k}" ${k === "lds" && !LDS.available ? "disabled" : ""}>${t}</button>`).join("") +
      `<span class="lbl status ${LDS.available ? "ok" : ""}">${LDS.available ? "✓ Catálogo LDS carregado: " + lds : "LDS: " + lds + " (Desktop\\EFEECTCRAFT EDITOR CLAUDE\\catalogo ou LDS_CATALOG)"}</span>`;
    $$("#quick button[data-f]").forEach((b) => (b.onclick = () => { UI.capFilter = b.dataset.f; renderStep(); }));
  }
  $$("#quick button[data-p]").forEach((b) => (b.onclick = () => applyPreset(b.dataset.p)));
  const sp = $("#surprise"); if (sp) sp.onclick = surprise;
  const s = S();
  if (st.id === "review") return renderReview(grid);
  const multi = st.id === "elements" || st.id === "motion";
  const list = st.id === "captions" && UI.capFilter === "lds" ? [] : { colours: COLOURS, fonts: FONTS, hook: HOOKS, captions: CAPTIONS, elements: ELEMENTS, motion: MOTIONS }[st.id];
  let html = list.map((o, i) => card({
    idx: i + 1, id: o.id, name: o.name, desc: o.sub || o.desc, skills: o.skills, multi, step: st.id,
    on: multi ? L[st.id].includes(o.id) : L[st.id] === o.id,
    swatches: st.id === "colours" ? [o.vars.bg, o.vars.acc, o.vars.txt, o.vars.sec] : null,
    body: frameHtml(st.id === "colours" ? withPick({ colours: o.id }) : st.id === "fonts" ? withPick({ fonts: o.id }) : s),
  })).join("");
  // Legenda Dinâmica (EffectCraft): real GIF previews from the user's catalogue
  if (st.id === "captions" && LDS.available && UI.capFilter !== "kit") {
    html += divider(`Legenda Dinâmica · EffectCraft (${LDS.prontos.length})`, "Prontos do Legenda Dinâmica Studio: palavra-chave gigante, conectivos pequenos, entrada palavra por palavra. Prévia real do catálogo; no palco à esquerda, uma aproximação nas suas cores. A entrada se escolhe no passo Motion.");
    html += LDS.prontos.map((p, i) => card({ idx: list.length + i + 1, id: `lds:${p.id}`, name: p.name, desc: `${p.modelo} · entrada ${p.entrada} · saída ${p.saida}`, skills: ["legenda-dinamica-studio"], multi: false, step: "captions", on: L.captions === `lds:${p.id}`, body: gifFrame(p.gif) })).join("");
  }
  if (st.id === "motion" && LDS.available && isLds()) {
    html += divider("Entrada da Legenda Dinâmica", "Troca a entrada do pronto escolhido. Uma só; sem escolher, vale a entrada do pronto.");
    html += LDS.entradas.map((e, i) => card({ idx: list.length + i + 1, id: `lds-in:${e.id}`, name: e.name, desc: `entrada "${e.id}"`, skills: ["legenda-dinamica-studio"], multi: false, step: "motion", on: L.ldsEntrada === e.id, body: gifFrame(e.gif) })).join("");
  }
  grid.innerHTML = html;
  wireCards(st.id, multi);
  requestAnimationFrame(() => { scaleWorlds(); const cards = $$(".card"); list.forEach((o, i) => fillCard(st.id, o, cards[i])); });
}

// one-word captions cycle; LDS screens also reveal word by word
function playCaptions(tl, root, caps, start) {
  if (!caps) return;
  const c = $(".caps", root); if (!c) return;
  const dt = caps.mode === "phrase" ? 1.2 : caps.mode === "lds" ? 1.3 : 0.34;
  cycleWords(tl, c, start, dt);
  if (caps.mode === "phrase") $$(".w", c).forEach((x, i) => tl.from(x, { y: 16, opacity: 0, duration: 0.3 }, start + i * dt));
  if (caps.mode === "lds") $$(".w", c).forEach((x, i) => tl.from($$(".ldw", x), { y: 14, opacity: 0, scale: 0.92, duration: 0.22, stagger: 0.18, ease: "back.out(1.6)" }, start + i * dt));
}
function fillCard(step, o, el) {
  if (!el) return;
  const w = $(".world", el), camEl = $(".cam", el);
  if (!w) return;
  const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6, paused: false });
  cardTls.push(tl);
  if (step === "colours" || step === "fonts") {
    const s = step === "colours" ? withPick({ colours: o.id }) : withPick({ fonts: o.id });
    const hook = byId(HOOKS, L.hook) || byId(HOOKS, step === "fonts" ? "serif-stack" : "big-caps");
    const caps = capById(L.captions) || byId(CAPTIONS, "one-word-outline");
    w.innerHTML = (hook.id === "none" ? byId(HOOKS, "big-caps") : hook).render(s) + caps.render(s);
    const h = $(".hook", w); if (h) hook.anim(tl, h);
    playCaptions(tl, w, caps, 0.4);
    return;
  }
  if (step === "hook") { w.innerHTML = o.render(S()); const h = $(".hook", w); if (h) o.anim(tl, h); tl.to({}, { duration: 1.2 }); return; }
  if (step === "captions") { w.innerHTML = o.render(S()); playCaptions(tl, w, o, 0.1); tl.to({}, { duration: 0.8 }); return; }
  if (step === "elements") {
    w.innerHTML = o.render(S());
    const e = $(".el", w); if (!e) return;
    const m = entrance(L.motion[0]);
    if (m.camera) byId(MOTIONS, "blur-rise").anim(tl, e); else m.anim(tl, e, camEl);
    const tick = byId(MOTIONS, "count-tick"); if ($(".num,.bar", e)) tick.anim(tl, e);
    $$("path", e).forEach((p) => { const Lz = p.getTotalLength(); p.style.strokeDasharray = Lz; tl.fromTo(p, { strokeDashoffset: Lz }, { strokeDashoffset: 0, duration: 0.45 }, 0.3); });
    const li = $$(".li,.row,.th,.ch", e); if (li.length) tl.from(li, { opacity: 0, y: 10, duration: 0.3, stagger: 0.15 }, 0.2);
    const strip = $(".strip", e); if (strip) tl.to(strip, { x: -700, duration: 3, ease: "none" }, 0);
    tl.to({}, { duration: 1.6 });
    return;
  }
  if (step === "motion") {
    w.innerHTML = motionDemo(o, S());
    const demo = $(".demo", w);
    o.anim(tl, demo, camEl);
    if (o.camera) { tl.to({}, { duration: 0.6 }); }
    tl.to({}, { duration: 1 });
  }
}
function motionDemo(o, s) {
  const base = `position:absolute;`;
  const txtOnAcc = /ffd21f|f4e27c|F5D82A|ffffff/.test(s.v.acc) ? "#111" : "#fff";
  if (o.demo === "cards") return `<div class="ov demo" style="${base}left:${s.W / 2 - 120}px;top:${s.headTop - 420}px;display:flex;gap:24px">${[0, 1, 2, 3].map((i) => `<div class="dc" style="width:160px;height:240px;border-radius:20px;background:${i === 1 ? s.v.acc : "#fff"};box-shadow:0 20px 50px rgba(0,0,0,.4);flex:none"></div>`).join("")}</div>`;
  if (o.demo === "orbit") return `<div class="ov demo" style="${base}left:${s.W / 2 - 330}px;top:${s.headTop - 60}px;width:660px;height:660px"><div class="ring" style="position:absolute;inset:0">${[0, 1, 2, 3, 4].map((i) => { const a = i * 72 * Math.PI / 180; return `<div class="ph" style="position:absolute;left:${330 + Math.cos(a) * 300 - 60}px;top:${330 + Math.sin(a) * 300 - 80}px;width:120px;height:160px;border-radius:16px;background:${i ? "#fff" : s.v.acc};box-shadow:0 10px 30px rgba(0,0,0,.4)"></div>`; }).join("")}</div></div>`;
  if (o.demo === "burst") return `<div class="ov demo" style="${base}left:${s.W / 2}px;top:${s.headTop + 300}px">${Array.from({ length: 12 }).map((_, i) => { const a = i * 30 * Math.PI / 180, r = 380 + (i % 3) * 90; return `<div class="th" style="position:absolute;left:${Math.cos(a) * r - 70}px;top:${Math.sin(a) * r * .8 - 100}px;width:140px;height:200px;border-radius:18px;background:linear-gradient(${i * 30}deg,#333,#111);box-shadow:0 14px 40px rgba(0,0,0,.4)"></div>`; }).join("")}</div>`;
  if (o.demo === "flash") return `<div class="ov demo" style="${base}left:0;top:0;width:${s.W}px;height:${s.H}px"><div class="fl" style="position:absolute;inset:0;background:radial-gradient(circle at 50% 40%,#fff,${s.v.acc} 60%,transparent 100%)"></div></div>`;
  // default: a colour card with the keyword
  return `<div class="ov demo" style="${base}left:${s.W / 2 - 280}px;top:${s.headTop - 460}px;width:560px;height:330px;border-radius:28px;background:${s.v.acc};color:${txtOnAcc};display:flex;align-items:center;justify-content:center;font-family:${s.font.display};font-weight:${s.font.dw};font-size:92px;box-shadow:0 30px 80px rgba(0,0,0,.4)"><svg viewBox="0 0 200 60" style="position:absolute;left:-200px;top:40%;width:180px;height:60px;overflow:visible"><path d="M4 30 H160 M130 8 L170 30 L130 52" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/></svg>${esc(s.text.keyword)}</div>`;
}

// ------------------------------------------------------------------ main preview composition
function rebuildMain() {
  if (mainTl) mainTl.kill();
  const s = S();
  gsap.set(cam, { clearProps: "all" });
  const hook = byId(HOOKS, L.hook), caps = capById(L.captions);
  const els = L.elements.map((id) => byId(ELEMENTS, id)).filter(Boolean);
  world.innerHTML = (hook ? hook.render(s) : "") + (caps ? caps.render(s) : "") + els.map((e) => e.render(s)).join("");
  mainTl = gsap.timeline({ repeat: -1, repeatDelay: 0.8 });
  const h = $(".hook", world);
  if (h && hook) { hook.anim(mainTl, h); mainTl.to(h, { opacity: 0, duration: 0.25 }, 3.2); }
  playCaptions(mainTl, world, caps, 0.3);
  const motions = L.motion.map((m) => byId(MOTIONS, m)).filter(Boolean);
  const camM = motions.filter((m) => m.camera), objM = motions.filter((m) => !m.camera);
  $$(".el", world).forEach((e, i) => {
    const t0 = 2.9 + i * 1.5;
    const m = objM[i % Math.max(1, objM.length)] || byId(MOTIONS, "blur-rise");
    gsap.set(e, { opacity: 0 }); mainTl.set(e, { opacity: 1 }, t0);
    const sub = gsap.timeline(); m.anim(sub, e, cam); mainTl.add(sub, t0);
    if ($(".num,.bar", e)) { const t = gsap.timeline(); byId(MOTIONS, "count-tick").anim(t, e); mainTl.add(t, t0 + 0.2); }
    $$("path", e).forEach((p) => { const Lz = p.getTotalLength(); p.style.strokeDasharray = Lz; mainTl.fromTo(p, { strokeDashoffset: Lz }, { strokeDashoffset: 0, duration: 0.45 }, t0 + 0.2); });
    const li = $$(".li,.row,.ch", e); if (li.length) mainTl.from(li, { opacity: 0, y: 10, duration: 0.3, stagger: 0.18 }, t0 + 0.1);
    const strip = $(".strip", e); if (strip) mainTl.to(strip, { x: -900, duration: 4, ease: "none" }, t0);
    mainTl.to(e, { opacity: 0, duration: 0.25 }, t0 + 2.6);
  });
  camM.forEach((m, i) => { const t = gsap.timeline(); m.anim(t, null, cam); mainTl.add(t, 3 + i * 3); });
  const total = Math.max(5, 3.2 + $$(".el", world).length * 1.5 + 1.5, caps ? 0.3 + $$(".w", world).length * (caps.mode === "lds" ? 1.3 : caps.mode === "phrase" ? 1.2 : 0.34) + 0.5 : 0);
  mainTl.to({}, { duration: 0.1 }, total);
  $("#jsonPre").textContent = JSON.stringify(lookJson(), null, 2);
  autosave();
}

// ------------------------------------------------------------------ review
function guessSkill() {
  if (L.skill) return L.skill;
  const votes = {};
  const add = (o) => o && (o.skills || []).forEach((k) => (votes[k] = (votes[k] || 0) + 1));
  add(byId(COLOURS, L.colours)); add(byId(FONTS, L.fonts)); add(byId(HOOKS, L.hook)); if (!isLds()) add(capById(L.captions));
  L.elements.forEach((id) => add(byId(ELEMENTS, id))); L.motion.forEach((id) => add(byId(MOTIONS, id)));
  return Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
function captionsJson() {
  const c = capById(L.captions); if (!c) return null;
  if (c.mode !== "lds") return { id: L.captions, name: c.name };
  const ent = byId(LDS.entradas, L.ldsEntrada);
  return { id: L.captions, name: c.name, engine: "legenda-dinamica-studio", skillCommand: "/legenda",
    lds: { pronto: c.lds.id, prontoName: c.lds.name, modelo: c.lds.modelo, entradaPadrao: c.lds.entrada, saida: c.lds.saida, entradaId: L.ldsEntrada, entradaName: ent ? ent.name : null } };
}
function conflicts(skill) { return skill ? CONFLICTS.filter((c) => c.skill === skill && c.test(L)).map((c) => c.msg) : []; }
function lookJson() {
  const skill = guessSkill();
  const name = (arr, id) => (byId(arr, id) || {}).name || null;
  return {
    version: 1, tool: "tools/look-builder", clip: UI.clip, orientation: UI.landscape ? "16:9" : "9:16", canvas: { width: UI.W, height: UI.H },
    framing: { headTop: UI.headTop, capTop: UI.capTop },
    preset: L.preset, skill, skillCommand: skill ? SKILLS[skill].cmd : null,
    colours: L.colours ? { id: L.colours, name: name(COLOURS, L.colours), ...byId(COLOURS, L.colours).vars } : null,
    fonts: L.fonts ? { id: L.fonts, name: name(FONTS, L.fonts), display: byId(FONTS, L.fonts).display, body: byId(FONTS, L.fonts).body, serif: byId(FONTS, L.fonts).serif || null, hand: byId(FONTS, L.fonts).hand || null } : null,
    hook: L.hook ? { id: L.hook, name: name(HOOKS, L.hook) } : null,
    captions: captionsJson(), ldsEntrada: L.ldsEntrada,
    elements: L.elements.map((id) => ({ id, name: name(ELEMENTS, id) })),
    motion: L.motion.map((id) => ({ id, name: name(MOTIONS, id) })),
    sampleText: UI.text, extras: L.extras, notes: L.notes, conflicts: conflicts(skill),
  };
}
function promptText() {
  const j = lookJson(); const slug = $("#slug").value.trim() || "meu-video";
  const cmd = j.skillCommand || "/edit-video";
  const list = (a) => a.map((x) => x.name).join(", ") || "—";
  return `${cmd} edita "${UI.clip || "<caminho do vídeo>"}" no projeto video-projects/${slug}.
Siga video-projects/${slug}/look.json (gerado pelo Look builder) em todas as decisões visuais:
- Cores: ${j.colours?.name || "—"} · Fontes: ${j.fonts?.name || "—"}
- Gancho: ${j.hook?.name || "—"} · Legendas: ${j.captions?.name || "—"}
- Elementos: ${list(j.elements)}
- Motion: ${list(j.motion)}
- Topo da cabeça ≈ ${UI.headTop}px, legenda em ${UI.capTop}px (${j.orientation}).${j.captions && j.captions.lds ? `\n- LEGENDAS no EffectCraft (skill legenda-dinamica-studio, /legenda): pronto "${j.captions.lds.prontoName}" (${j.captions.lds.modelo}), entrada ${j.captions.lds.entradaName || j.captions.lds.entradaPadrao}, saída ${j.captions.lds.saida}. Deixe a faixa da legenda livre na composição HyperFrames e entregue words.json para o LDS.` : ""}${j.extras.length ? `\n- Variações pedidas: ${j.extras.map((e) => `${e.base} → ${e.ask}`).join("; ")}` : ""}${j.notes ? `\n- Notas: ${j.notes}` : ""}${j.conflicts.length ? `\n- Atenção, o look conflita com a skill: ${j.conflicts.join(" ")} Resolva com o aluno antes de montar.` : ""}
Mostre o mapa de beats antes de montar e não publique nada.`;
}
function renderReview(grid) {
  const skill = guessSkill(); const cf = conflicts(skill); const j = lookJson();
  const row = (k, v) => `<li><b>${k}:</b> ${v || "<em style='color:var(--faint)'>não escolhido</em>"}</li>`;
  grid.innerHTML = `<div class="review" style="grid-column:1/-1">
    <div class="box"><h3>Seu look</h3><ul>
      ${row("Cores", j.colours?.name)}${row("Fontes", j.fonts?.name)}${row("Gancho", j.hook?.name)}${row("Legendas", j.captions ? j.captions.name + (j.captions.lds ? ` <em style="color:var(--dim)">(EffectCraft · entrada ${esc(j.captions.lds.entradaName || j.captions.lds.entradaPadrao)})</em>` : "") : null)}
      ${row("Elementos", j.elements.map((x) => x.name).join(", "))}${row("Motion", j.motion.map((x) => x.name).join(", "))}
      ${row("Enquadramento", `cabeça ${UI.headTop}px · legenda ${UI.capTop}px · ${j.orientation}`)}</ul>
      ${L.extras.length ? `<h3 style="margin-top:14px">Variações pedidas</h3><ul>${L.extras.map((e, i) => `<li>${esc(e.base)} → ${esc(e.ask)} <a href="#" data-x="${i}">remover</a></li>`).join("")}</ul>` : ""}
    </div>
    <div class="box"><h3>Skill que vai executar</h3>
      <div class="skillpick">${Object.entries(SKILLS).map(([k, v]) => `<button class="${k === skill ? "on" : ""}" data-s="${k}">${esc(v.name)}</button>`).join("")}</div>
      <p style="color:var(--dim);margin:10px 0 0">${skill ? esc(SKILLS[skill].note) : "Escolha uma skill ou deixe o palpite (a mais votada pelas suas escolhas)."}</p>
      <h3 style="margin-top:14px">Conflitos com o DESIGN.md da skill</h3>
      ${cf.length ? `<ul>${cf.map((m) => `<li class="warn">⚠ ${esc(m)}</li>`).join("")}</ul>` : `<p class="ok">✓ Nenhum conflito. O look cabe nessa skill.</p>`}
    </div>
    <div class="box"><h3>Notas para o Claude</h3><textarea id="notes" placeholder="Ex.: a cor do canal é #ff6600, use no acento; não cubra o quadro atrás de mim; prints estão em Pictures/Screenshots.">${esc(L.notes)}</textarea></div>
    <div class="box"><h3>Prompt pronto</h3><pre id="promptPre">${esc(promptText())}</pre></div>
  </div>`;
  $$(".skillpick button", grid).forEach((b) => (b.onclick = () => { L.skill = b.dataset.s === L.skill ? null : b.dataset.s; renderStep(); }));
  $$("[data-x]", grid).forEach((a) => (a.onclick = (e) => { e.preventDefault(); L.extras.splice(Number(a.dataset.x), 1); renderStep(); }));
  $("#notes").oninput = (e) => { L.notes = e.target.value; autosave(); $("#promptPre").textContent = promptText(); };
}

// ------------------------------------------------------------------ presets, save, prompt
function applyPreset(id) {
  const p = byId(PRESETS, id); if (!p) return;
  L.preset = id; L.skill = p.skill;
  L.colours = p.picks.colours || null; L.fonts = p.picks.fonts || null; L.hook = p.picks.hook || null; L.captions = p.picks.captions || null;
  L.elements = [...(p.picks.elements || [])]; L.motion = [...(p.picks.motion || [])];
  toast(p.skill ? `Preset ${p.name}: ${SKILLS[p.skill].name}. Você ainda pode mudar tudo.` : "Começando do zero.");
  renderStep(); rebuildMain();
}
async function save() {
  const slug = $("#slug").value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return toast("Slug inválido: minúsculas, números e hífens (ex.: meu-reel-01).");
  const r = await fetch("/api/look", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project: slug, look: lookJson() }) }).then((x) => x.json());
  if (r.error) return toast("Erro: " + r.error);
  toast(`Salvo em ${r.file} (+ LOOK.md). Prompt copiado: cole no Claude.`);
  try { await navigator.clipboard.writeText(promptText()); } catch {}
}
$("#save").onclick = save;
// ---- "Testar de verdade": real HyperFrames snapshot of the current look
async function testReal() {
  const slug = $("#slug").value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return toast("Slug inválido: minúsculas, números e hífens.");
  if (!UI.clip) return toast("Escolha um clipe antes de testar.");
  const dlg = $("#testDlg"), body = $("#testBody"), btn = $("#testReal");
  body.innerHTML = `<p class="test-wait">Montando o projeto de teste e capturando frames com o HyperFrames… no seu PC pode levar um minuto.</p>`;
  $("#testPath").textContent = ""; btn.classList.add("busy"); if (!dlg.open) dlg.showModal();
  try {
    const r = await fetch("/api/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project: slug, look: lookJson(), from: video.currentTime || 0, dur: 8 }) }).then((x) => x.json());
    if (r.error) { body.innerHTML = `<div class="test-err">${esc(r.error)}</div>`; return; }
    const label = (f) => { const m = /at-(\d+(?:\.\d+)?)s/.exec(f); return m ? `${Number(m[1]).toFixed(1)} s` : f; };
    body.innerHTML = `<div class="shots ${UI.landscape ? "wide" : ""}">${r.images.map((im, i) => `<figure class="shot"><a href="${im.url}" target="_blank" rel="noopener"><img src="${im.url}" alt="${esc(im.file)}" loading="lazy"></a><figcaption><span>${label(im.file)}</span><span>${esc(im.file)}</span></figcaption></figure>`).join("")}</div>`;
    $("#testPath").textContent = `${r.dir} · ${r.images.length} frames · ${(r.ms / 1000).toFixed(0)} s · trecho a partir de ${r.start.toFixed(1)} s`;
    toast("Frames reais prontos.");
  } catch (e) { body.innerHTML = `<div class="test-err">${esc(e.message || e)}</div>`; }
  finally { btn.classList.remove("busy"); }
}
$("#testReal").onclick = testReal;
$("#testClose").onclick = () => $("#testDlg").close();
$("#slug").oninput = () => { UI.slugTouched = true; };
$("#copyPrompt").onclick = async () => { try { await navigator.clipboard.writeText(promptText()); toast("Prompt copiado."); } catch { toast("Não deu para copiar; veja a Revisão."); } };

// ------------------------------------------------------------------ misc wiring
$("#clipSelect").onchange = (e) => openClip(e.target.value, e.target.selectedOptions[0]?.dataset.project || null);
$("#clipLoad").onclick = () => openClip($("#clipPath").value.trim(), null);
$("#play").onclick = () => { if (video.paused) { video.play(); if (mainTl) mainTl.restart(); $("#play").textContent = "Pause"; } else { video.pause(); $("#play").textContent = "Play"; } };
$("#reset").onclick = () => { if (confirm("Limpar todas as escolhas deste clipe?")) resetAll(); };
$("#copyJson").onclick = async () => { try { await navigator.clipboard.writeText(JSON.stringify(lookJson(), null, 2)); toast("JSON copiado."); } catch { toast("Não deu para copiar."); } };
// keyboard: ← → steps · 1–9 pick the Nth card · Esc closes "mais como essa" boxes
window.addEventListener("keydown", (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.key === "ArrowRight") go(UI.step + 1);
  else if (e.key === "ArrowLeft") go(UI.step - 1);
  else if (/^[1-9]$/.test(e.key)) { const c = $$(".card")[Number(e.key) - 1]; if (c) $(".take", c).click(); }
  else if (e.key === "Escape") $$(".card.more").forEach((c) => c.classList.remove("more"));
  else if (e.key === " ") { e.preventDefault(); $("#play").click(); }
});
$("#back5").onclick = () => (video.currentTime = Math.max(0, video.currentTime - 5));
$("#fwd5").onclick = () => (video.currentTime = Math.min(video.duration || 0, video.currentTime + 5));
$("#mute").onchange = (e) => (video.muted = e.target.checked);
$("#showGuides").onchange = drawGuides;
$("#detectHead").onclick = () => detectHead();
$("#autoDetect").onchange = (e) => { try { localStorage.setItem(LS + "autoDetect", e.target.checked ? "1" : "0"); } catch {} };
try { $("#autoDetect").checked = localStorage.getItem(LS + "autoDetect") !== "0"; } catch {}
$("#headTop").oninput = (e) => { UI.headTop = Number(e.target.value); syncSliders(); drawGuides(); debounce(() => { renderStep(); rebuildMain(); autosave(); }); };
$("#capTop").oninput = (e) => { UI.capTop = Number(e.target.value); syncSliders(); drawGuides(); debounce(() => { renderStep(); rebuildMain(); autosave(); }); };
["hook1", "hook2", "keyword", "note", "comment", "user"].forEach((k) => { $("#" + k).value = UI.text[k]; $("#" + k).oninput = (e) => { UI.text[k] = e.target.value; debounce(() => { renderStep(); rebuildMain(); }); }; });
$("#wordsIn").value = UI.text.words.join(" ");
$("#wordsIn").oninput = (e) => { UI.text.words = e.target.value.trim().split(/\s+/).filter(Boolean).slice(0, 14); debounce(() => { renderStep(); rebuildMain(); }); };
$("#fromTranscript").onclick = async () => {
  const slug = UI.clipProject || $("#slug").value.trim();
  const r = await fetch(`/api/transcript?project=${encodeURIComponent(slug)}`).then((x) => x.json());
  if (!r.sample) return toast("Sem transcrição em video-projects/" + slug + "/assets (transcript.json ou raw.json).");
  const ws = r.sample.words.map((w) => w.text.replace(/[.,!?;:]+$/, "")).filter(Boolean);
  UI.text.words = ws.slice(0, 12); UI.text.hook1 = ws.slice(0, 3).join(" "); UI.text.hook2 = ws.slice(3, 7).join(" ");
  UI.text.keyword = [...ws.slice(0, 12)].sort((a, b) => b.length - a.length)[0] || UI.text.keyword;
  ["hook1", "hook2", "keyword"].forEach((k) => ($("#" + k).value = UI.text[k])); $("#wordsIn").value = UI.text.words.join(" ");
  toast(`Texto de exemplo vindo de ${r.sample.file}.`); renderStep(); rebuildMain();
};
$$(".tab").forEach((t) => (t.onclick = () => { $$(".tab").forEach((x) => x.classList.toggle("on", x === t)); const j = t.dataset.view === "json"; $("#jsonView").hidden = !j; $("#grid").hidden = j; $(".step-head").hidden = j; if (j) $("#jsonPre").textContent = JSON.stringify(lookJson(), null, 2); }));
window.addEventListener("resize", () => { layoutStage(); scaleWorlds(); });

let deb; function debounce(fn) { clearTimeout(deb); deb = setTimeout(fn, 160); }
let toastT; function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 3200); }
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// boot
syncSliders(); layoutStage(); renderStep(); rebuildMain(); loadLds(); loadPresetImages(); loadClips();

window.__lb = { L, UI, rebuildMain, renderStep, lookJson, fillPresetCards };
