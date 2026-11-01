// Guia da Mesa — apontar ao vivo durante a sessão
import {
  t, esc, html, enrich, emit, getSetting, setSetting, playChime, toast, randomId
} from "./util.js";
import { Spotlight } from "./spotlight.js";
import { pick } from "./picker.js";
import { GdmWindow } from "./window.js";
import { targetFromElement, targetFromRect, resolveTarget, summarizeTarget } from "./targets.js";

const DEFAULT_OPTS = { dim: false, ring: true, arrow: true, duration: 15 };

class LiveHighlight {
  static current = null;

  constructor(payload, { echo = false } = {}) {
    this.p = payload;
    this.echo = echo;
    this._onClick = this._onClick.bind(this);
  }

  async show() {
    LiveHighlight.current?.close(false);
    LiveHighlight.current = this;
    const p = this.p;
    const res = await resolveTarget(p.target, { open: !this.echo, timeout: this.echo ? 300 : 2200 });
    if (LiveHighlight.current !== this) return;
    this.res = res;
    const hasTarget = res.kind === "element" || res.kind === "area";
    const from = game.users.get(p.from)?.name ?? t("Live.GM");
    const body = p.message ? await enrich(p.message) : `<p>${t("Live.DefaultMessage")}</p>`;
    const dur = Number(p.duration) || 0;

    const recipients = !p.users?.length
      ? t("Live.All")
      : p.users.map((id) => game.users.get(id)?.name).filter(Boolean).join(", ");

    const card = html(`
      <div class="gdm-card gdm-card-live ${this.echo ? "gdm-echo" : ""}">
        <div class="gdm-live-head">
          <span class="gdm-live-dot"></span>
          ${this.echo
            ? `<span>${t("Live.ShowingTo", { who: esc(recipients) })}</span>`
            : `<span>${t("Live.IsShowing", { who: esc(from) })}</span>`}
        </div>
        <div class="gdm-card-body">${body}</div>
        ${res.kind === "missing" ? `<div class="gdm-note"><i class="fa-solid fa-triangle-exclamation"></i>${this.echo ? t("Live.MissingEcho") : t("Live.Missing")}</div>` : ""}
        <div class="gdm-card-actions">
          <span class="gdm-flex"></span>
          ${this.echo
            ? `<button type="button" class="gdm-btn gdm-ghost" data-act="clear"><i class="fa-solid fa-eraser"></i>${t("Live.ClearAll")}</button>`
            : `<button type="button" class="gdm-btn gdm-primary" data-act="ok"><i class="fa-solid fa-check"></i>${t("Live.Got")}</button>`}
        </div>
        ${dur ? `<div class="gdm-timer"><span style="animation-duration:${dur}s"></span></div>` : ""}
      </div>`);
    card.addEventListener("click", (ev) => {
      const act = ev.target.closest("[data-act]")?.dataset.act;
      if (act === "ok") this.close(true);
      if (act === "clear") { emit({ action: "clear" }); this.close(false); }
    });

    this.spot = new Spotlight("live");
    this.spot.show({
      getRect: hasTarget ? res.getRect : null,
      card,
      dim: !!p.effects?.dim,
      ring: p.effects?.ring !== false,
      arrow: p.effects?.arrow !== false,
      blockOutside: false,
      interactive: true,
      position: "auto"
    });
    if (!this.echo) playChime();
    document.addEventListener("click", this._onClick, true);
    if (dur) this._timer = setTimeout(() => this.close(false), dur * 1000);
  }

  _onClick(ev) {
    const el = this.res?.element;
    if (el && (el === ev.target || el.contains(ev.target))) setTimeout(() => this.close(true), 150);
  }

  close(ack) {
    if (this._closed) return;
    this._closed = true;
    clearTimeout(this._timer);
    document.removeEventListener("click", this._onClick, true);
    this.spot?.destroy();
    if (LiveHighlight.current === this) LiveHighlight.current = null;
    if (ack && !this.echo) emit({ action: "ack", hid: this.p.hid });
  }
}

/* ---------------------------------------------------------------- */
/*  Lado do narrador                                                */
/* ---------------------------------------------------------------- */

function lastOpts() {
  return { ...DEFAULT_OPTS, ...(getSetting("liveOptions") ?? {}) };
}

/** Painel rápido para escrever a mensagem e escolher para quem mostrar */
function quickPanel(target, rect) {
  return new Promise((resolve) => {
    const o = lastOpts();
    const players = game.users.filter((u) => !u.isGM);
    const sum = summarizeTarget(target);
    const panel = html(`
      <form class="gdm-quick">
        <div class="gdm-quick-head">
          <i class="fa-solid fa-location-crosshairs"></i>
          <span>${t("Live.QuickTitle")}</span>
          <span class="gdm-flex"></span>
          <button type="button" class="gdm-x" data-act="cancel"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="gdm-quick-target"><i class="${sum.icon}"></i>${esc(sum.text)}</div>
        <input type="text" name="message" autocomplete="off" placeholder="${esc(t("Live.MessagePlaceholder"))}">
        <div class="gdm-chips" data-group="users">
          <button type="button" class="gdm-chip-btn gdm-on" data-user="">${t("Live.All")}</button>
          ${players.map((u) => `<button type="button" class="gdm-chip-btn ${u.active ? "" : "gdm-offline"}" data-user="${u.id}">
              <span class="gdm-dot" style="background:${esc(u.color?.css ?? u.color ?? "#999")}"></span>${esc(u.name)}</button>`).join("")}
        </div>
        <div class="gdm-quick-row">
          <label class="gdm-toggle"><input type="checkbox" name="dim" ${o.dim ? "checked" : ""}><span>${t("Fx.Dim")}</span></label>
          <label class="gdm-toggle"><input type="checkbox" name="ring" ${o.ring ? "checked" : ""}><span>${t("Fx.Ring")}</span></label>
          <label class="gdm-toggle"><input type="checkbox" name="arrow" ${o.arrow ? "checked" : ""}><span>${t("Fx.Arrow")}</span></label>
        </div>
        <div class="gdm-card-actions">
          <button type="button" class="gdm-btn gdm-ghost" data-act="cancel">${t("Common.Cancel")}</button>
          <span class="gdm-flex"></span>
          <i class="fa-regular fa-clock gdm-muted"></i>
          <select class="gdm-dur" name="duration">
            ${[5, 10, 15, 30, 60, 0].map((d) => `<option value="${d}" ${Number(o.duration) === d ? "selected" : ""}>${d ? t("Live.Seconds", { n: d }) : t("Live.UntilClosed")}</option>`).join("")}
          </select>
          <button type="submit" class="gdm-btn gdm-primary"><i class="fa-solid fa-paper-plane"></i>${t("Live.Send")}</button>
        </div>
      </form>`);
    document.body.append(panel);

    // posiciona perto do alvo
    const W = window.innerWidth, H = window.innerHeight;
    const pw = panel.offsetWidth, ph = panel.offsetHeight;
    let x = rect.left + rect.width / 2 - pw / 2;
    let y = rect.bottom + 18;
    if (y + ph > H - 12) y = rect.top - ph - 18;
    if (y < 12) {
      y = Math.min(Math.max(rect.top, 12), H - ph - 12);
      x = rect.right + 18 + pw < W ? rect.right + 18 : rect.left - pw - 18;
    }
    panel.style.left = `${Math.min(Math.max(x, 12), W - pw - 12)}px`;
    panel.style.top = `${Math.min(Math.max(y, 12), H - ph - 12)}px`;
    requestAnimationFrame(() => panel.classList.add("gdm-in"));
    panel.querySelector("input[name=message]").focus();

    // seleção de jogadores: "Todos" ou uma lista
    const chips = panel.querySelector("[data-group=users]");
    chips.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-user]");
      if (!b) return;
      const all = chips.querySelector('[data-user=""]');
      if (!b.dataset.user) {
        chips.querySelectorAll("[data-user]").forEach((c) => c.classList.toggle("gdm-on", c === all));
      } else {
        b.classList.toggle("gdm-on");
        const any = chips.querySelector("[data-user]:not([data-user=''])" + ".gdm-on");
        all.classList.toggle("gdm-on", !any);
      }
    });

    const done = (val) => {
      document.removeEventListener("keydown", onKey, true);
      panel.classList.remove("gdm-in");
      setTimeout(() => panel.remove(), 160);
      resolve(val);
    };
    const onKey = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); done(null); } };
    document.addEventListener("keydown", onKey, true);

    panel.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-act=cancel]")) done(null);
    });
    panel.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const f = new FormData(panel);
      const users = [...chips.querySelectorAll("[data-user].gdm-on")].map((c) => c.dataset.user).filter(Boolean);
      const opts = {
        dim: f.get("dim") === "on",
        ring: f.get("ring") === "on",
        arrow: f.get("arrow") === "on",
        duration: Number(f.get("duration"))
      };
      setSetting("liveOptions", opts);
      done({ message: String(f.get("message") ?? "").trim(), users, ...opts });
    });
  });
}

/**
 * Narrador: escolhe algo na tela e mostra para os jogadores.
 * @param {"element"|"area"} mode
 */
export async function pointLive(mode = "element") {
  if (!game.user.isGM) return;
  // tira as janelas do módulo da frente enquanto o narrador escolhe
  const wins = [...GdmWindow.open.values()].filter((w) => w.el && !w.el.classList.contains("gdm-hidden"));
  wins.forEach((w) => w.hide());
  const restore = () => wins.forEach((w) => w.show());
  const res = await pick({ mode, title: t("Live.PickTitle") });
  if (!res) return restore();
  const target = res.element ? targetFromElement(res.element) : targetFromRect(res.rect);

  // prévia local enquanto o narrador escreve
  const preview = new Spotlight("live");
  const el = res.element;
  const fixed = res.rect;
  preview.show({
    getRect: () => (el?.isConnected ? el.getBoundingClientRect() : fixed),
    card: null, dim: false, ring: true, arrow: false, blockOutside: false, interactive: true
  });
  const choice = await quickPanel(target, res.rect);
  preview.destroy();
  restore();
  if (!choice) return;

  const payload = {
    action: "highlight",
    hid: randomId(),
    target,
    message: choice.message ? `<p>${esc(choice.message)}</p>` : "",
    users: choice.users.length ? choice.users : null,
    effects: { dim: choice.dim, ring: choice.ring, arrow: choice.arrow },
    duration: choice.duration
  };
  emit(payload);
  if (getSetting("echoToGM")) new LiveHighlight({ ...payload, from: game.user.id }, { echo: true }).show();
}

export function clearLive({ broadcast = false } = {}) {
  LiveHighlight.current?.close(false);
  if (broadcast) emit({ action: "clear" });
}

/* ---------------------------------------------------------------- */
/*  Recebendo (jogadores)                                           */
/* ---------------------------------------------------------------- */
export function receiveHighlight(payload) {
  if (game.user.isGM) return;
  if (payload.users?.length && !payload.users.includes(game.user.id)) return;
  new LiveHighlight(payload).show();
}

export function receiveAck(data) {
  if (!game.user.isGM) return;
  const name = game.users.get(data.from)?.name ?? "?";
  toast(t("Live.Acked", { name: esc(name) }), "fa-solid fa-circle-check");
}
