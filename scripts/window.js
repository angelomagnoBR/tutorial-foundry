// Guia da Mesa — janela simples e elegante (independe da versão do Foundry)
import { html, esc, t } from "./util.js";

let Z = 9500;

export class GdmWindow {
  static open = new Map();

  constructor(id, { title = "", icon = "fa-solid fa-compass", width = 560, height = "auto", cls = "" } = {}) {
    this.id = id;
    this.title = title;
    this.icon = icon;
    this.width = width;
    this.height = height;
    this.cls = cls;
    this.el = null;
  }

  /** Subclasses: devolve HTML (string) do conteúdo */
  async content() { return ""; }
  /** Subclasses: liga os eventos do conteúdo */
  activate(_body) {}

  async render() {
    const first = !this.el;
    if (first) {
      GdmWindow.open.get(this.id)?.close();
      this.el = html(`
        <section class="gdm-window ${this.cls}" style="width:${this.width}px">
          <header class="gdm-window-head">
            <i class="${this.icon}"></i>
            <h1>${esc(this.title)}</h1>
            <span class="gdm-flex"></span>
            <button type="button" class="gdm-x" data-wact="close" data-tooltip="${t("Common.Close")}"><i class="fa-solid fa-xmark"></i></button>
          </header>
          <div class="gdm-window-body"></div>
        </section>`);
      if (this.height !== "auto") this.el.style.height = `${this.height}px`;
      document.body.append(this.el);
      this._drag();
      this.el.addEventListener("mousedown", () => this.front());
      this.el.querySelector("[data-wact=close]").addEventListener("click", () => this.close());
      GdmWindow.open.set(this.id, this);
    }
    // corpo novo a cada render (evita listeners duplicados)
    const old = this.el.querySelector(".gdm-window-body");
    const scroll = old.querySelector("[data-keep-scroll]")?.scrollTop ?? 0;
    const body = document.createElement("div");
    body.className = "gdm-window-body";
    body.innerHTML = await this.content();
    if (!this.el) return this;
    this.el.querySelector(".gdm-window-body").replaceWith(body);
    const keep = body.querySelector("[data-keep-scroll]");
    if (keep) keep.scrollTop = scroll;
    this.activate(body);
    if (first) {
      const r = this.el.getBoundingClientRect();
      this.el.style.left = `${Math.max(10, (window.innerWidth - r.width) / 2)}px`;
      this.el.style.top = `${Math.max(10, (window.innerHeight - r.height) / 2.4)}px`;
      requestAnimationFrame(() => this.el?.classList.add("gdm-in"));
    }
    this.front();
    return this;
  }

  front() { if (this.el) this.el.style.zIndex = String(++Z); }

  hide() { this.el?.classList.add("gdm-hidden"); }
  show() { this.el?.classList.remove("gdm-hidden"); this.front(); }

  close() {
    if (!this.el) return;
    const el = this.el;
    this.el = null;
    el.classList.remove("gdm-in");
    setTimeout(() => el.remove(), 180);
    if (GdmWindow.open.get(this.id) === this) GdmWindow.open.delete(this.id);
    this.onClose?.();
  }

  _drag() {
    const head = this.el.querySelector(".gdm-window-head");
    head.addEventListener("mousedown", (ev) => {
      if (ev.button !== 0 || ev.target.closest("button")) return;
      ev.preventDefault();
      const r = this.el.getBoundingClientRect();
      const dx = ev.clientX - r.left, dy = ev.clientY - r.top;
      const move = (e) => {
        this.el.style.left = `${Math.min(Math.max(e.clientX - dx, -r.width + 80), window.innerWidth - 80)}px`;
        this.el.style.top = `${Math.min(Math.max(e.clientY - dy, 0), window.innerHeight - 40)}px`;
      };
      const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }
}

/** Confirmação simples */
export function confirmBox(message, { okLabel, cancelLabel, danger = false } = {}) {
  return new Promise((resolve) => {
    const el = html(`
      <div class="gdm-modal">
        <div class="gdm-modal-card">
          <p>${message}</p>
          <div class="gdm-card-actions">
            <button type="button" class="gdm-btn gdm-ghost" data-v="0">${cancelLabel ?? t("Common.Cancel")}</button>
            <span class="gdm-flex"></span>
            <button type="button" class="gdm-btn ${danger ? "gdm-danger" : "gdm-primary"}" data-v="1">${okLabel ?? t("Common.Confirm")}</button>
          </div>
        </div>
      </div>`);
    document.body.append(el);
    requestAnimationFrame(() => el.classList.add("gdm-in"));
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-v]");
      if (!b) return;
      el.remove();
      resolve(b.dataset.v === "1");
    });
  });
}
