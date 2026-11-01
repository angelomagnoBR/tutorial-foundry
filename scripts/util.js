// Guia da Mesa — utilitários e camada de compatibilidade (Foundry v12 / v13)
export const MODULE_ID = "guia-da-mesa";
export const SOCKET = `module.${MODULE_ID}`;

/** Tradução curta: t("Dock.Pointer") -> GDM.Dock.Pointer */
export function t(key, data) {
  const k = `GDM.${key}`;
  return data ? game.i18n.format(k, data) : game.i18n.localize(k);
}

export const getSetting = (k) => game.settings.get(MODULE_ID, k);
export const setSetting = (k, v) => game.settings.set(MODULE_ID, k, v);

export function randomId() {
  return foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2, 18);
}

export function deepClone(o) {
  return foundry?.utils?.deepClone ? foundry.utils.deepClone(o) : JSON.parse(JSON.stringify(o));
}

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cria elemento a partir de HTML */
export function html(str) {
  const tpl = document.createElement("template");
  tpl.innerHTML = str.trim();
  return tpl.content.firstElementChild;
}

/** Enriquecimento de texto (links @UUID, rolagens [[/r 1d20]], etc.) */
export async function enrich(text) {
  const TE = foundry?.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  const src = text ?? "";
  try {
    if (TE?.enrichHTML) return await TE.enrichHTML(src, { async: true });
  } catch (e) { console.warn(`${MODULE_ID} | enrichHTML falhou`, e); }
  return src;
}

export function openFilePicker({ type = "image", current = "", callback }) {
  const FP = foundry?.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  if (!FP) return ui.notifications?.warn("FilePicker indisponível");
  const fp = new FP({ type, current, callback });
  fp.render(true);
  // Garante que o seletor de arquivos apareça acima das janelas do módulo
  let tries = 0;
  const bump = () => {
    const el = appElement(fp);
    if (el) el.style.zIndex = "9800";
    else if (tries++ < 20) setTimeout(bump, 50);
  };
  bump();
  return fp;
}

export function saveJSON(data, filename) {
  const fn = foundry?.utils?.saveDataToFile ?? globalThis.saveDataToFile;
  const text = JSON.stringify(data, null, 2);
  if (fn) return fn(text, "text/json", filename);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = filename;
  a.click();
}

export function pickJSONFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try { resolve(JSON.parse(await file.text())); }
      catch (e) { ui.notifications?.error(t("Notify.ImportError")); resolve(null); }
    });
    input.click();
  });
}

export function playChime() {
  if (!getSetting("sound")) return;
  const AH = foundry?.audio?.AudioHelper ?? globalThis.AudioHelper;
  try { AH?.play({ src: "sounds/notify.wav", volume: 0.45, autoplay: true, loop: false }, false); }
  catch (e) { /* sem som, sem problema */ }
}

/* ---------------------------------------------------------------- */
/*  Janelas do Foundry                                              */
/* ---------------------------------------------------------------- */

/** Elemento HTML de uma aplicação (v12 usa jQuery, v13 HTMLElement) */
export function appElement(app) {
  const el = app?.element;
  if (!el) return null;
  if (el instanceof HTMLElement) return el;
  return el[0] ?? null;
}

/** Todas as janelas abertas (v12 + v13) */
export function openApps() {
  const list = [];
  const inst = foundry?.applications?.instances;
  if (inst) for (const app of inst.values()) list.push(app);
  if (globalThis.ui?.windows) for (const app of Object.values(ui.windows)) list.push(app);
  return list.filter((a) => a?.rendered !== false);
}

/** A partir de um elemento do DOM, encontra a janela (app) que o contém */
export function findAppForElement(el) {
  const root = el?.closest?.(".application, .app.window-app, .window-app, .app");
  if (!root) return null;
  let app = null;
  const inst = foundry?.applications?.instances;
  if (inst && root.id) app = inst.get(root.id) ?? null;
  if (!app && root.dataset?.appid && globalThis.ui?.windows) app = ui.windows[root.dataset.appid] ?? null;
  if (!app) app = openApps().find((a) => appElement(a) === root) ?? null;
  return { root, app };
}

export function documentOfApp(app) {
  return app?.document ?? app?.object ?? app?.actor ?? null;
}

/** Ficha aberta (elemento) de um documento */
export function findOpenSheetElement(uuid) {
  for (const app of openApps()) {
    const doc = documentOfApp(app);
    if (doc?.uuid === uuid) {
      const el = appElement(app);
      if (el?.isConnected) return el;
    }
  }
  return null;
}

/** Ator "do jogador": personagem vinculado; para o narrador, um ator de teste */
export function myActor() {
  if (game.user.character) return game.user.character;
  const controlled = globalThis.canvas?.tokens?.controlled?.[0]?.actor;
  if (controlled) return controlled;
  const actors = game.actors?.contents ?? [];
  if (!game.user.isGM) return actors.find((a) => a.isOwner) ?? null;
  return actors.find((a) => a.hasPlayerOwner) ?? actors[0] ?? null;
}

export async function openActorSheet(actor) {
  if (!actor?.sheet) return null;
  const existing = findOpenSheetElement(actor.uuid);
  if (existing) { actor.sheet.bringToFront?.() ?? actor.sheet.bringToTop?.(); return existing; }
  await actor.sheet.render(true);
  for (let i = 0; i < 30; i++) {
    const el = findOpenSheetElement(actor.uuid);
    if (el) return el;
    await sleep(80);
  }
  return null;
}

/** Abre uma aba da barra lateral e garante que ela esteja expandida */
export async function openSidebarTab(tab) {
  if (!tab) return;
  const sb = globalThis.ui?.sidebar;
  try {
    if (typeof sb?.toggleExpanded === "function") sb.toggleExpanded(true);
    else if (sb?._collapsed && typeof sb.expand === "function") sb.expand();
  } catch (e) { /* ignora */ }
  try {
    if (typeof sb?.changeTab === "function") sb.changeTab(tab, "primary");
    else if (typeof sb?.activateTab === "function") sb.activateTab(tab);
    else throw new Error("sem API");
  } catch (e) {
    document.querySelector(`#sidebar-tabs [data-tab="${tab}"]`)?.click();
  }
  await sleep(120);
}

export async function closeAllWindows() {
  // Nunca fecha as peças fixas da interface (barra lateral, hotbar, chat...)
  const fixed = new Set(Object.values(globalThis.ui ?? {}).filter((v) => v && typeof v === "object"));
  for (const app of openApps()) {
    if (fixed.has(app)) continue;
    if (app.hasFrame === false || app.options?.window?.frame === false) continue; // v13
    if (app.popOut === false || app.options?.popOut === false) continue;           // v12
    const el = appElement(app);
    if (!el?.isConnected || el.closest("#sidebar, #interface #ui-left, #ui-bottom")) continue;
    try { await app.close(); } catch (e) { /* ignora */ }
  }
}

export function isVisible(el) {
  if (!el?.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.02;
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!m) return "232, 176, 75";
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function applyTheme() {
  const root = document.documentElement;
  let color = getSetting("accentColor");
  if (typeof color !== "string") color = color?.css ?? String(color ?? "#e8b04b");
  root.style.setProperty("--gdm-accent", color);
  root.style.setProperty("--gdm-accent-rgb", hexToRgb(color));
  root.style.setProperty("--gdm-dim", String(getSetting("dimOpacity") ?? 0.68));
}

/** Toast discreto no canto (usado para avisos ao narrador) */
export function toast(message, icon = "fa-solid fa-circle-info") {
  let host = document.getElementById("gdm-toasts");
  if (!host) {
    host = html(`<div id="gdm-toasts"></div>`);
    document.body.append(host);
  }
  const el = html(`<div class="gdm-toast"><i class="${icon}"></i><span>${message}</span></div>`);
  host.append(el);
  setTimeout(() => el.classList.add("gdm-out"), 4200);
  setTimeout(() => el.remove(), 4800);
}

/** Envia uma mensagem pelo canal do módulo */
export function emit(data) {
  try { game.socket?.emit(SOCKET, { ...data, from: game.user.id }); }
  catch (e) { console.warn(`${MODULE_ID} | socket`, e); }
}
