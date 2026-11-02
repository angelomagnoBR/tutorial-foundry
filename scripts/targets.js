// Guia da Mesa — alvos: criar seletores a partir de um clique e reencontrá-los na tela de cada jogador
import {
  t, sleep, isVisible, findAppForElement, documentOfApp, findOpenSheetElement,
  myActor, openActorSheet, openSidebarTab
} from "./util.js";

/**
 * Formatos de alvo:
 *  { type: "none" }                                   mensagem no centro da tela
 *  { type: "selector", selector, sidebarTab?, label }  qualquer parte da interface
 *  { type: "sheet", inner, docUuid?, mine, label }     algo dentro da ficha (do próprio jogador)
 *  { type: "area", rect: {x,y,w,h} (frações 0–1), label } retângulo livre na tela
 */

/* ---------------------------------------------------------------- */
/*  Locais comuns do Foundry (funcionam no v12 e no v13)            */
/* ---------------------------------------------------------------- */
const TAB = (tab) => `#sidebar-tabs [data-tab="${tab}"]`;

export const PRESETS = [
  { id: "sidebar", selector: "#sidebar" },
  { id: "tab-chat", selector: TAB("chat") },
  { id: "chat-log", selector: "#chat-log, #chat .chat-scroll", sidebarTab: "chat" },
  { id: "chat-input", selector: "#chat-message, #chat-form textarea, .chat-form textarea", sidebarTab: "chat" },
  { id: "roll-mode", selector: "#roll-privacy, #chat-controls .roll-type-select, #chat-controls select[name=\"rollMode\"]", sidebarTab: "chat" },
  { id: "tab-combat", selector: TAB("combat") },
  { id: "tab-scenes", selector: TAB("scenes") },
  { id: "tab-actors", selector: TAB("actors") },
  { id: "tab-items", selector: TAB("items") },
  { id: "tab-journal", selector: TAB("journal") },
  { id: "tab-tables", selector: TAB("tables") },
  { id: "tab-cards", selector: TAB("cards") },
  { id: "tab-playlists", selector: TAB("playlists") },
  { id: "tab-compendium", selector: TAB("compendium") },
  { id: "tab-settings", selector: TAB("settings") },
  { id: "scene-controls", selector: "#scene-controls, #controls" },
  { id: "hotbar", selector: "#hotbar" },
  { id: "players", selector: "#players" },
  { id: "navigation", selector: "#scene-navigation, #navigation" },
  { id: "camera", selector: "#camera-views" },
  { id: "my-sheet", sheet: true }
];

export function presetTarget(id) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return { type: "none" };
  const label = t(`Preset.${p.id}`);
  if (p.sheet) return { type: "sheet", inner: "", mine: true, label, preset: p.id };
  return { type: "selector", selector: p.selector, sidebarTab: p.sidebarTab ?? null, label, preset: p.id };
}

/* ---------------------------------------------------------------- */
/*  Gerar seletor a partir de um elemento clicado                   */
/* ---------------------------------------------------------------- */
const STABLE_ATTRS = [
  "data-tab", "data-action", "data-tool", "data-control", "data-key", "data-skill", "data-ability",
  "data-attribute", "data-roll", "data-type", "data-tooltip", "aria-label", "name", "data-group",
  "data-item-id", "data-entry-id", "data-document-id"
];
const ID_ATTRS = new Set(["data-item-id", "data-entry-id", "data-document-id"]);
const STATE_CLASS = /^(active|hover|focus|focused|open|opened|expanded|collapsed|minimized|selected|disabled|visible|hidden|toggled?|ready|loading|dragging|draggable|faded-ui|theme-.*|gdm-.*|ui-control|flexrow|flexcol|flex\d*|minimizing|maximizing)$/;

function attrValue(v) { return v.replace(/["\\]/g, "\\$&"); }

function segmentFor(el, { avoidIds }) {
  const tag = el.tagName.toLowerCase();
  if (!avoidIds && el.id && !/^\d/.test(el.id) && el.id.length < 80) return `#${CSS.escape(el.id)}`;
  for (const a of STABLE_ATTRS) {
    if (avoidIds && ID_ATTRS.has(a)) continue;
    const v = el.getAttribute(a);
    if (v && v.length < 90) return `${tag}[${a}="${attrValue(v)}"]`;
  }
  const classes = [...el.classList].filter((c) => !STATE_CLASS.test(c)).slice(0, 3);
  return tag + classes.map((c) => "." + CSS.escape(c)).join("");
}

/**
 * Constrói o seletor mais curto que reencontra `el` dentro de `root`.
 * root = document → seletor global; root = elemento de ficha → seletor relativo à ficha.
 */
export function buildSelector(el, root = document, { avoidIds = false } = {}) {
  if (el === root) return "";
  const scope = root === document ? document : root;
  const parts = [];
  let cur = el;
  while (cur && cur !== root && cur !== document.documentElement && cur !== document.body) {
    let seg = segmentFor(cur, { avoidIds });
    const parent = cur.parentElement;
    if (parent && !seg.startsWith("#")) {
      let same = [];
      try { same = [...parent.children].filter((c) => c.matches(seg)); } catch (e) { same = []; }
      if (same.length > 1) seg += `:nth-child(${[...parent.children].indexOf(cur) + 1})`;
    }
    parts.unshift(seg);
    const sel = parts.join(" > ");
    try {
      const found = scope.querySelectorAll(sel);
      if (found.length === 1 && found[0] === el) return sel;
    } catch (e) { /* seletor inválido, continua subindo */ }
    cur = parent;
  }
  return parts.join(" > ");
}

/** Texto curto e humano que descreve um elemento (para rótulos) */
export function describeElement(el) {
  if (!el) return "";
  const tip = el.getAttribute?.("data-tooltip") || el.getAttribute?.("aria-label") || el.getAttribute?.("title");
  if (tip && !tip.startsWith("<")) return tip.trim().slice(0, 60);
  const lbl = el.closest?.("label")?.textContent || el.labels?.[0]?.textContent;
  if (lbl?.trim()) return lbl.trim().slice(0, 60);
  const txt = (el.innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (txt && txt.length <= 40) return txt;
  if (txt) return txt.slice(0, 37) + "…";
  if (el.placeholder) return el.placeholder;
  return el.id ? `#${el.id}` : el.tagName.toLowerCase();
}

/** Aba da barra lateral que contém o elemento (para reabrir na tela do jogador) */
function sidebarTabOf(el) {
  const tab = el.closest?.("#sidebar section.tab[data-tab], #sidebar .sidebar-tab[data-tab], #sidebar-content > [data-tab]");
  return tab?.dataset?.tab ?? null;
}

/**
 * Converte um elemento clicado em um alvo que funcione na tela de outra pessoa.
 * @param {HTMLElement} el
 * @param {object} opts  { forTour: true } → dentro de fichas, vira "ficha do próprio jogador"
 */
export function targetFromElement(el, { forTour = false } = {}) {
  const label = describeElement(el);
  const found = findAppForElement(el);
  const doc = documentOfApp(found?.app);
  if (found?.root && doc && ["Actor", "Item"].includes(doc.documentName)) {
    const inner = buildSelector(el, found.root, { avoidIds: true });
    return {
      type: "sheet",
      inner,
      docUuid: doc.uuid,
      docType: doc.documentName,
      mine: forTour && doc.documentName === "Actor",
      label,
      fallback: buildSelector(el, document)
    };
  }
  return { type: "selector", selector: buildSelector(el, document), sidebarTab: sidebarTabOf(el), label };
}

/* ---- conversão tela <-> mapa (segue zoom e posição da câmera) ---- */
function boardOffset() {
  const b = globalThis.canvas?.app?.view ?? document.getElementById("board");
  const r = b?.getBoundingClientRect?.();
  return { x: r?.left ?? 0, y: r?.top ?? 0 };
}
export function clientToWorld(x, y) {
  const o = boardOffset();
  const c = globalThis.canvas;
  if (typeof c?.canvasCoordinatesFromClient === "function") return c.canvasCoordinatesFromClient({ x, y });
  const p = c.stage.worldTransform.applyInverse({ x: x - o.x, y: y - o.y });
  return { x: p.x, y: p.y };
}
export function worldToClient(x, y) {
  const o = boardOffset();
  const c = globalThis.canvas;
  if (typeof c?.clientCoordinatesFromCanvas === "function") return c.clientCoordinatesFromCanvas({ x, y });
  const p = c.stage.worldTransform.apply({ x, y });
  return { x: p.x + o.x, y: p.y + o.y };
}

const OWN_UI = ".gdm-picker, .gdm-layer, #gdm-dock, .gdm-window, #gdm-toasts, .gdm-quick, .gdm-popover";
const LAYOUT_IDS = new Set(["interface", "ui-left", "ui-right", "ui-middle", "ui-top", "ui-bottom", "ui-left-column-1", "ui-left-column-2"]);

function isMapElement(el) {
  if (!el) return true;
  return el.id === "board" || el.tagName === "CANVAS" || !!el.closest?.("#board");
}

/**
 * Converte uma área desenhada em um alvo que aparece no MESMO lugar para todos,
 * independente de resolução, tamanho da janela, zoom ou posição da câmera:
 *  - sobre o mapa  → coordenadas da cena (type "map")
 *  - sobre um painel → retângulo relativo àquele painel (alvo do elemento + "sub")
 *  - caso contrário → fração da tela (último recurso)
 */
export function targetFromRect(r, { forTour = false } = {}) {
  const W = window.innerWidth, H = window.innerHeight;
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const under = document.elementsFromPoint(cx, cy)
    .filter((el) => el !== document.documentElement && el !== document.body && !el.closest(OWN_UI));
  const top = under[0] ?? null;

  // 1) Mapa
  const c = globalThis.canvas;
  if (isMapElement(top) && c?.ready && c.scene) {
    try {
      const a = clientToWorld(r.left, r.top), b = clientToWorld(r.right, r.bottom);
      return {
        type: "map",
        sceneId: c.scene.id,
        sceneName: c.scene.name,
        rect: { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y },
        label: t("Target.MapArea")
      };
    } catch (e) { console.warn("guia-da-mesa | conversão para o mapa falhou", e); }
  }

  // 2) Painel/janela que contém a área inteira
  let anchor = top;
  while (anchor && anchor !== document.body) {
    const ar = anchor.getBoundingClientRect();
    const fits = ar.left <= r.left + 6 && ar.top <= r.top + 6 && ar.right >= r.right - 6 && ar.bottom >= r.bottom - 6;
    if (fits) break;
    anchor = anchor.parentElement;
  }
  if (anchor && anchor !== document.body && !LAYOUT_IDS.has(anchor.id) && !isMapElement(anchor)) {
    const ar = anchor.getBoundingClientRect();
    if (ar.width * ar.height < W * H * 0.9 && ar.width > 0 && ar.height > 0) {
      const base = targetFromElement(anchor, { forTour });
      base.sub = {
        x: (r.left - ar.left) / ar.width, y: (r.top - ar.top) / ar.height,
        w: r.width / ar.width, h: r.height / ar.height
      };
      base.label = `${t("Target.AreaIn")} ${describeElement(anchor)}`;
      return base;
    }
  }

  // 3) Último recurso: fração da tela
  return {
    type: "area",
    rect: { x: r.left / W, y: r.top / H, w: r.width / W, h: r.height / H },
    label: t("Target.AreaLabel")
  };
}

/** Texto resumido de um alvo, para listas */
export function summarizeTarget(target) {
  switch (target?.type) {
    case "selector": return { icon: target.sub ? "fa-regular fa-square" : "fa-solid fa-crosshairs", text: target.label || target.selector };
    case "sheet": return { icon: "fa-solid fa-id-card", text: (target.mine && !target.preset ? t("Target.MySheet") + " · " : "") + (target.label || t("Target.Sheet")) };
    case "area": return { icon: "fa-regular fa-square", text: target.label || t("Target.AreaLabel") };
    case "map": return { icon: "fa-solid fa-map-location-dot", text: target.label || t("Target.MapArea") };
    default: return { icon: "fa-regular fa-message", text: t("Target.None") };
  }
}

/* ---------------------------------------------------------------- */
/*  Reencontrar o alvo                                              */
/* ---------------------------------------------------------------- */
function firstVisible(root, selector) {
  if (!selector) return isVisible(root) ? root : null;
  let list = [];
  try { list = [...root.querySelectorAll(selector)]; } catch (e) { return null; }
  return list.find(isVisible) ?? null;
}

/** Elemento da ficha correta para este usuário (abre se for preciso e permitido) */
async function sheetRootFor(target, { open = true } = {}) {
  // 1. Ficha específica já aberta
  if (target.docUuid && !target.mine) {
    const el = findOpenSheetElement(target.docUuid);
    if (el) return el;
    const doc = await fromUuidSafe(target.docUuid);
    if (doc?.isOwner && open) return openActorSheet(doc);
  }
  // 2. A ficha do próprio jogador
  const actor = myActor();
  if (!actor) return null;
  const el = findOpenSheetElement(actor.uuid);
  if (el) return el;
  return open ? openActorSheet(actor) : null;
}

async function fromUuidSafe(uuid) {
  try { return await fromUuid(uuid); } catch (e) { return null; }
}

/** Acrescenta handle.hit(evento): o clique caiu dentro do destaque? */
function withHit(handle) {
  handle.hit = (ev) => {
    if (handle.kind === "element" && !handle.target?.sub) {
      const el = handle.element;
      return !!el && (el === ev.target || el.contains(ev.target));
    }
    const r = handle.getRect();
    return !!r && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
  };
  return handle;
}

/**
 * Retorna uma função que devolve o retângulo atual do alvo (ou null),
 * seguindo o elemento se a janela for arrastada.
 */
export async function resolveTarget(target, { open = true, timeout = 2500 } = {}) {
  if (!target || target.type === "none") return { kind: "none" };

  if (target.type === "area") {
    const r = target.rect;
    return withHit({
      kind: "area",
      getRect: () => {
        const W = window.innerWidth, H = window.innerHeight;
        return new DOMRect(r.x * W, r.y * H, r.w * W, r.h * H);
      }
    });
  }

  if (target.type === "map") {
    const c = globalThis.canvas;
    if (!c?.ready || c.scene?.id !== target.sceneId) return { kind: "missing", reason: "scene" };
    const r = target.rect;
    if (open && target.pan !== false) {
      try {
        const view = new DOMRect(0, 0, window.innerWidth, window.innerHeight);
        const a = worldToClient(r.x, r.y), b = worldToClient(r.x + r.w, r.y + r.h);
        const visible = a.x >= view.left && a.y >= view.top && b.x <= view.right && b.y <= view.bottom;
        if (!visible) await c.animatePan({ x: r.x + r.w / 2, y: r.y + r.h / 2, duration: 600 });
      } catch (e) { /* sem pan, sem problema */ }
    }
    return withHit({
      kind: "area",
      getRect: () => {
        if (!globalThis.canvas?.ready || canvas.scene?.id !== target.sceneId) return null;
        const a = worldToClient(r.x, r.y), b = worldToClient(r.x + r.w, r.y + r.h);
        return new DOMRect(a.x, a.y, b.x - a.x, b.y - a.y);
      }
    });
  }

  if (target.type === "selector" && target.sidebarTab && open) {
    const probe = firstVisible(document, target.selector);
    if (!probe) await openSidebarTab(target.sidebarTab);
  }

  const start = performance.now();
  let rootCache = null;
  while (performance.now() - start < timeout) {
    let el = null;
    if (target.type === "selector") {
      el = firstVisible(document, target.selector);
    } else if (target.type === "sheet") {
      rootCache = rootCache?.isConnected ? rootCache : await sheetRootFor(target, { open });
      if (rootCache) el = firstVisible(rootCache, target.inner);
      if (!el && target.fallback && !target.mine) el = firstVisible(document, target.fallback);
    }
    if (el) {
      try { el.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) { /* ok */ }
      // Se a ficha/aba for redesenhada, reencontra o elemento sem esperar
      const requery = () => {
        if (target.type === "selector") return firstVisible(document, target.selector);
        if (!rootCache?.isConnected) {
          const a = target.mine ? myActor() : null;
          rootCache = findOpenSheetElement(a?.uuid ?? target.docUuid) ?? null;
        }
        return rootCache ? firstVisible(rootCache, target.inner) : null;
      };
      const handle = {
        kind: "element",
        element: el,
        target,
        getRect: () => {
          if (!handle.element?.isConnected || !isVisible(handle.element)) handle.element = requery();
          if (!handle.element) return null;
          const br = handle.element.getBoundingClientRect();
          const sb = target.sub;
          if (!sb) return br;
          return new DOMRect(br.left + sb.x * br.width, br.top + sb.y * br.height, sb.w * br.width, sb.h * br.height);
        }
      };
      return withHit(handle);
    }
    await sleep(120);
  }
  return { kind: "missing" };
}
