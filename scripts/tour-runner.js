// Guia da Mesa — executa um tutorial passo a passo
import {
  t, esc, html, enrich, emit, sleep, myActor, openActorSheet, openSidebarTab, closeAllWindows
} from "./util.js";
import { Spotlight } from "./spotlight.js";
import { resolveTarget } from "./targets.js";
import { markCompleted } from "./store.js";

/** Executa a ação "antes deste passo" */
export async function runBefore(before) {
  const v = before?.value;
  try {
    switch (before?.action) {
      case "sidebarTab": await openSidebarTab(v); break;
      case "openMySheet": await openActorSheet(myActor()); break;
      case "closeWindows": await closeAllWindows(); await sleep(150); break;
      case "openJournal": {
        const doc = v ? await fromUuid(v) : null;
        if (doc?.documentName === "JournalEntryPage") await doc.parent.sheet.render(true, { pageId: doc.id });
        else await doc?.sheet?.render(true);
        await sleep(300);
        break;
      }
      case "runMacro": {
        const m = v ? await fromUuid(v) : null;
        await m?.execute?.();
        await sleep(200);
        break;
      }
    }
  } catch (e) { console.warn("guia-da-mesa | ação antes do passo falhou", e); }
}

export class TourRunner {
  static current = null;

  /**
   * @param {object} tour
   * @param {object} opts { preview: boolean (teste do narrador), startAt: number, onEnd: fn }
   */
  constructor(tour, { preview = false, startAt = 0, onEnd = null } = {}) {
    this.tour = tour;
    this.preview = preview;
    this.index = Math.max(0, Math.min(startAt, tour.steps.length - 1));
    this.onEnd = onEnd;
    this._nav = 0;
    this._onKey = this._onKey.bind(this);
    this._onClick = this._onClick.bind(this);
    this._target = null;
  }

  static start(tour, opts) {
    if (!tour?.steps?.length) return ui.notifications?.warn(t("Notify.EmptyTour"));
    const r = new TourRunner(tour, opts);
    r.start();
    return r;
  }

  async start() {
    TourRunner.current?.end("replaced");
    TourRunner.current = this;
    this.spot = new Spotlight("tour");
    document.addEventListener("keydown", this._onKey, true);
    document.addEventListener("click", this._onClick, true);
    await this.goTo(this.index);
  }

  async goTo(i) {
    if (i < 0 || i >= this.tour.steps.length) return;
    const nav = ++this._nav;
    this.index = i;
    const step = this.tour.steps[i];
    this.spot.layer.classList.add("gdm-busy");

    await runBefore(step.before);
    if (nav !== this._nav) return;
    const res = await resolveTarget(step.target, { open: true });
    if (nav !== this._nav) return;

    this._target = res;
    const card = await this._buildCard(step, res);
    if (nav !== this._nav) return;

    const hasTarget = res.kind === "element" || res.kind === "area";
    const fx = step.effects ?? {};
    this.spot.layer.classList.remove("gdm-busy");
    this.spot.show({
      getRect: hasTarget ? res.getRect : null,
      card,
      dim: fx.dim !== false,
      ring: fx.ring !== false,
      arrow: fx.arrow !== false,
      blockOutside: fx.dim !== false,
      interactive: true,
      position: step.position ?? "auto"
    });
    card.querySelector(".gdm-btn.gdm-primary")?.focus({ preventScroll: true });
  }

  async _buildCard(step, res) {
    const n = this.tour.steps.length;
    const i = this.index;
    const last = i === n - 1;
    const body = await enrich(step.text);
    const clickMode = step.advance === "click" && res.kind === "element";
    const missing = res.kind === "missing";
    const card = html(`
      <div class="gdm-card gdm-card-tour" role="dialog" aria-live="polite">
        <div class="gdm-card-top">
          <span class="gdm-chip"><i class="${esc(this.tour.icon || "fa-solid fa-compass")}"></i>${esc(this.tour.name)}</span>
          ${this.preview ? `<span class="gdm-chip gdm-chip-preview">${t("Tour.Preview")}</span>` : ""}
          <span class="gdm-count">${i + 1} / ${n}</span>
          <button type="button" class="gdm-x" data-act="close" data-tooltip="${t("Tour.Close")}"><i class="fa-solid fa-xmark"></i></button>
        </div>
        ${step.image ? `<div class="gdm-card-img"><img src="${esc(step.image)}" alt=""></div>` : ""}
        ${step.title ? `<h2 class="gdm-card-title">${esc(step.title)}</h2>` : ""}
        <div class="gdm-card-body">${body}</div>
        ${missing ? `<div class="gdm-note"><i class="fa-solid fa-triangle-exclamation"></i>${t("Tour.Missing")}</div>` : ""}
        ${clickMode ? `<div class="gdm-hint"><i class="fa-solid fa-hand-pointer"></i>${t("Tour.ClickHint")}</div>` : ""}
        <div class="gdm-progress"><span style="width:${((i + 1) / n) * 100}%"></span></div>
        <div class="gdm-card-actions">
          ${i > 0 ? `<button type="button" class="gdm-btn gdm-ghost" data-act="prev"><i class="fa-solid fa-arrow-left"></i>${t("Tour.Prev")}</button>` : `<button type="button" class="gdm-btn gdm-ghost" data-act="close">${t("Tour.Skip")}</button>`}
          <span class="gdm-flex"></span>
          <button type="button" class="gdm-btn ${clickMode ? "gdm-ghost" : "gdm-primary"}" data-act="next">
            ${last ? `${t("Tour.Finish")}<i class="fa-solid fa-check"></i>` : `${t("Tour.Next")}<i class="fa-solid fa-arrow-right"></i>`}
          </button>
        </div>
      </div>`);
    card.addEventListener("click", (ev) => {
      const act = ev.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (act === "next") this.next();
      else if (act === "prev") this.prev();
      else if (act === "close") this.end("skipped");
    });
    return card;
  }

  next() {
    if (this.index >= this.tour.steps.length - 1) return this.end("done");
    this.goTo(this.index + 1);
  }

  prev() { this.goTo(this.index - 1); }

  _onClick(ev) {
    const step = this.tour.steps[this.index];
    if (step?.advance !== "click" || this._target?.kind !== "element") return;
    const el = this._target.element;
    if (el && (el === ev.target || el.contains(ev.target))) {
      const idx = this.index;
      // deixa o clique fazer efeito (ex.: abrir a aba) e depois avança
      setTimeout(() => { if (this.index === idx && TourRunner.current === this) this.next(); }, 220);
    }
  }

  _onKey(ev) {
    const tag = ev.target?.tagName;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || ev.target?.isContentEditable) {
      if (ev.key !== "Escape") return;
    }
    if (ev.key === "ArrowRight" || (ev.key === "Enter" && !ev.target?.closest?.(".gdm-card button"))) {
      ev.preventDefault(); ev.stopPropagation(); this.next();
    } else if (ev.key === "ArrowLeft") {
      ev.preventDefault(); ev.stopPropagation(); this.prev();
    } else if (ev.key === "Escape") {
      ev.preventDefault(); ev.stopPropagation(); this.end("skipped");
    }
  }

  async end(status = "done") {
    if (this._ended) return;
    this._ended = true;
    this._nav++;
    document.removeEventListener("keydown", this._onKey, true);
    document.removeEventListener("click", this._onClick, true);
    this.spot?.destroy();
    if (TourRunner.current === this) TourRunner.current = null;
    if (!this.preview && (status === "done" || status === "skipped")) {
      await markCompleted(this.tour.id, status);
      if (!game.user.isGM) emit({ action: "tourDone", tourId: this.tour.id, status });
    }
    this.onEnd?.(status);
  }
}
