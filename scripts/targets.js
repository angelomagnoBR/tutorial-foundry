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

export function targetFromRect(r) {
  const W = window.innerWidth, H = window.innerHeight;
  return {
    type: "area",
    rect: { x: r.left / W, y: r.top / H, w: r.width / W, h: r.height / H },
    label: t("Target.AreaLabel")
  };
}

/** Texto resumido de um alvo, para listas */
export function summarizeTarget(target) {
  switch (target?.type) {
    case "selector": return { icon: "fa-solid fa-crosshairs", text: target.label || target.selector };
    case "sheet": return { icon: "fa-solid fa-id-card", text: (target.mine && !target.preset ? t("Target.MySheet") + " · " : "") + (target.label || t("Target.Sheet")) };
    case "area": return { icon: "fa-regular fa-square", text: target.label || t("Target.AreaLabel") };
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

/**
 * Retorna uma função que devolve o retângulo atual do alvo (ou null),
 * seguindo o elemento se a janela for arrastada.
 */
export async function resolveTarget(target, { open = true, timeout = 2500 } = {}) {
  if (!target || target.type === "none") return { kind: "none" };

  if (target.type === "area") {
    const r = target.rect;
    return {
      kind: "area",
      getRect: () => {
        const W = window.innerWidth, H = window.innerHeight;
        return new DOMRect(r.x * W, r.y * H, r.w * W, r.h * H);
      }
    };
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
        getRect: () => {
          if (!handle.element?.isConnected || !isVisible(handle.element)) handle.element = requery();
          return handle.element ? handle.element.getBoundingClientRect() : null;
        }
      };
      return handle;
    }
    await sleep(120);
  }
  return { kind: "missing" };
}
