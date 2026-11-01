// Guia da Mesa — seletor na tela: o narrador clica em qualquer coisa (ou desenha uma área)
import { t, html, esc } from "./util.js";
import { describeElement } from "./targets.js";

const OWN = ".gdm-picker, .gdm-layer, #gdm-dock, .gdm-window, #gdm-toasts, .gdm-quick";

/**
 * Inicia o modo de seleção.
 * @param {object} o  { mode: "element"|"area", allowArea: boolean, title: string }
 * @returns {Promise<null | {element:HTMLElement, rect:DOMRect} | {rect:DOMRect}>}
 */
export function pick({ mode = "element", allowArea = true, title = "" } = {}) {
  return new Promise((resolve) => {
    let current = mode;
    let stack = [];   // ancestrais do elemento sob o mouse (0 = mais interno)
    let depth = 0;
    let lastDeep = null;
    let drag = null;

    const ov = html(`
      <div class="gdm-picker gdm-mode-${current}">
        <div class="gdm-picker-banner">
          <i class="fa-solid fa-crosshairs"></i>
          <span class="gdm-picker-title">${esc(title || t("Picker.Title"))}</span>
          ${allowArea ? `
          <span class="gdm-seg">
            <button type="button" data-mode="element"><i class="fa-solid fa-arrow-pointer"></i>${t("Picker.Element")}</button>
            <button type="button" data-mode="area"><i class="fa-regular fa-square"></i>${t("Picker.Area")}</button>
          </span>` : ""}
          <span class="gdm-picker-help"></span>
          <button type="button" class="gdm-picker-cancel" data-act="cancel"><i class="fa-solid fa-xmark"></i>Esc</button>
        </div>
        <div class="gdm-picker-box"><span class="gdm-picker-label"></span></div>
      </div>`);
    const box = ov.querySelector(".gdm-picker-box");
    const label = ov.querySelector(".gdm-picker-label");
    const help = ov.querySelector(".gdm-picker-help");
    document.body.append(ov);

    const setMode = (m) => {
      current = m;
      ov.className = `gdm-picker gdm-mode-${m}`;
      ov.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("gdm-on", b.dataset.mode === m));
      help.textContent = m === "element" ? t("Picker.HelpElement") : t("Picker.HelpArea");
      box.style.opacity = "0";
    };
    setMode(current);

    const finish = (result) => {
      cleanup();
      resolve(result);
    };

    const under = (x, y) => {
      const list = document.elementsFromPoint(x, y)
        .filter((el) => el !== document.documentElement && el !== document.body && !el.closest(OWN));
      const deep = list[0] ?? null;
      if (deep !== lastDeep) {
        lastDeep = deep;
        stack = [];
        let cur = deep;
        while (cur && cur !== document.body) {
          const r = cur.getBoundingClientRect();
          if (r.width > 1 && r.height > 1 && getComputedStyle(cur).display !== "contents") {
            const prev = stack[stack.length - 1];
            const pr = prev?.getBoundingClientRect();
            // pula ancestrais com exatamente o mesmo tamanho (não mudam nada para o usuário)
            if (!pr || Math.abs(pr.width - r.width) > 2 || Math.abs(pr.height - r.height) > 2) stack.push(cur);
          }
          cur = cur.parentElement;
        }
        depth = 0;
      }
      return stack[Math.min(depth, stack.length - 1)] ?? null;
    };

    const drawBox = (r, text) => {
      Object.assign(box.style, {
        opacity: "1",
        left: `${r.left - 3}px`, top: `${r.top - 3}px`,
        width: `${r.width + 6}px`, height: `${r.height + 6}px`
      });
      label.textContent = text ?? "";
      label.classList.toggle("gdm-below", r.top < 40);
    };

    const onMove = (ev) => {
      if (current === "area") {
        if (!drag) return;
        const x = Math.min(drag.x, ev.clientX), y = Math.min(drag.y, ev.clientY);
        drawBox(new DOMRect(x, y, Math.abs(ev.clientX - drag.x), Math.abs(ev.clientY - drag.y)), "");
        return;
      }
      const el = under(ev.clientX, ev.clientY);
      if (!el) { box.style.opacity = "0"; return; }
      drawBox(el.getBoundingClientRect(), describeElement(el));
      ov._hover = el;
    };

    const onDown = (ev) => {
      if (ev.target.closest(".gdm-picker-banner")) return;
      if (ev.button === 2) { ev.preventDefault(); return finish(null); }
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (current === "area") drag = { x: ev.clientX, y: ev.clientY };
    };

    const onUp = (ev) => {
      if (ev.target.closest(".gdm-picker-banner")) return;
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (current === "area") {
        if (!drag) return;
        const x = Math.min(drag.x, ev.clientX), y = Math.min(drag.y, ev.clientY);
        const w = Math.abs(ev.clientX - drag.x), h = Math.abs(ev.clientY - drag.y);
        drag = null;
        if (w < 8 || h < 8) return;
        return finish({ rect: new DOMRect(x, y, w, h) });
      }
      const el = under(ev.clientX, ev.clientY);
      if (el) finish({ element: el, rect: el.getBoundingClientRect() });
    };

    const onWheel = (ev) => {
      if (current !== "element" || !stack.length) return;
      ev.preventDefault();
      ev.stopPropagation();
      depth = Math.max(0, Math.min(stack.length - 1, depth + (ev.deltaY < 0 ? 1 : -1)));
      const el = stack[depth];
      drawBox(el.getBoundingClientRect(), describeElement(el));
    };

    const onKey = (ev) => {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); finish(null); }
      else if (ev.key === "Tab" && allowArea) { ev.preventDefault(); setMode(current === "element" ? "area" : "element"); }
    };

    const onBanner = (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      ev.stopPropagation();
      if (b.dataset.mode) setMode(b.dataset.mode);
      if (b.dataset.act === "cancel") finish(null);
    };

    const stopCtx = (ev) => ev.preventDefault();

    ov.addEventListener("mousemove", onMove);
    ov.addEventListener("mousedown", onDown);
    ov.addEventListener("mouseup", onUp);
    ov.addEventListener("wheel", onWheel, { passive: false });
    ov.addEventListener("contextmenu", stopCtx);
    ov.querySelector(".gdm-picker-banner").addEventListener("click", onBanner);
    document.addEventListener("keydown", onKey, true);

    function cleanup() {
      document.removeEventListener("keydown", onKey, true);
      ov.classList.add("gdm-out");
      setTimeout(() => ov.remove(), 150);
    }
  });
}
