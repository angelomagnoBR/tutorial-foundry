// Guia da Mesa — motor visual: holofote, brilho pulsante, seta animada e cartão
import { html } from "./util.js";

const ARROW_SVG = `
<svg viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <linearGradient id="gdm-arrow-grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="rgb(var(--gdm-accent-rgb))" stop-opacity="0.55"/>
      <stop offset="1" stop-color="rgb(var(--gdm-accent-rgb))"/>
    </linearGradient>
  </defs>
  <path d="M4 24 H36 V10 L62 32 L36 54 V40 H4 Z" fill="url(#gdm-arrow-grad)"
        stroke="rgba(255,255,255,.85)" stroke-width="2.5" stroke-linejoin="round"/>
</svg>`;

const PAD = 6;          // folga em volta do alvo
const ARROW = 54;       // tamanho da seta
const MARGIN = 12;      // margem da tela

export class Spotlight {
  /**
   * @param {"tour"|"live"} kind
   */
  constructor(kind = "tour") {
    this.kind = kind;
    this.layer = html(`
      <div class="gdm-layer gdm-kind-${kind}">
        <div class="gdm-hole"></div>
        <div class="gdm-block" data-b="t"></div><div class="gdm-block" data-b="r"></div>
        <div class="gdm-block" data-b="b"></div><div class="gdm-block" data-b="l"></div>
        <div class="gdm-block" data-b="c"></div>
        <div class="gdm-ring"><span class="gdm-ripple"></span><span class="gdm-ripple gdm-r2"></span></div>
        <div class="gdm-arrow"><div class="gdm-arrow-inner">${ARROW_SVG}</div></div>
        <div class="gdm-card-slot"></div>
      </div>`);
    this.hole = this.layer.querySelector(".gdm-hole");
    this.ring = this.layer.querySelector(".gdm-ring");
    this.arrow = this.layer.querySelector(".gdm-arrow");
    this.slot = this.layer.querySelector(".gdm-card-slot");
    this.blocks = Object.fromEntries([...this.layer.querySelectorAll(".gdm-block")].map((b) => [b.dataset.b, b]));
    this._last = {};
    this._raf = null;
    this.opts = {};
    document.body.append(this.layer);
    requestAnimationFrame(() => this.layer.classList.add("gdm-in"));
  }

  /**
   * Mostra/atualiza o destaque.
   * @param {object} o
   * @param {Function|null} o.getRect   função que devolve o DOMRect atual do alvo (null = sem alvo)
   * @param {HTMLElement|null} o.card   cartão de texto
   * @param {boolean} o.dim             escurecer o resto da tela
   * @param {boolean} o.ring            brilho pulsante
   * @param {boolean} o.arrow           seta animada
   * @param {boolean} o.blockOutside    impedir cliques fora do destaque
   * @param {boolean} o.interactive     permitir clicar no próprio destaque
   * @param {string}  o.position        auto | top | bottom | left | right | center
   */
  show(o) {
    this.opts = { dim: true, ring: true, arrow: true, blockOutside: true, interactive: false, position: "auto", ...o };
    const L = this.layer.classList;
    L.toggle("gdm-dim-on", !!this.opts.dim);
    L.toggle("gdm-ring-on", !!this.opts.ring && !!this.opts.getRect);
    L.toggle("gdm-arrow-on", !!this.opts.arrow && !!this.opts.getRect);
    L.toggle("gdm-no-target", !this.opts.getRect);
    L.toggle("gdm-block-out", !!this.opts.blockOutside);
    L.toggle("gdm-block-in", !this.opts.interactive);

    // cartão novo
    this.slot.replaceChildren();
    if (this.opts.card) {
      this.opts.card.classList.add("gdm-measuring");
      this.slot.append(this.opts.card);
    }
    // reinicia a animação de "entrada" do brilho
    this.ring.classList.remove("gdm-pop");
    void this.ring.offsetWidth;
    this.ring.classList.add("gdm-pop");
    this._last = {};
    this._cardSide = null;
    this._loop();
  }

  _loop() {
    cancelAnimationFrame(this._raf);
    const tick = () => {
      this._update();
      this._raf = requestAnimationFrame(tick);
    };
    tick();
  }

  _set(el, key, styles) {
    const sig = JSON.stringify(styles);
    if (this._last[key] === sig) return;
    this._last[key] = sig;
    Object.assign(el.style, styles);
  }

  _update() {
    const W = window.innerWidth, H = window.innerHeight;
    let r = this.opts.getRect ? this.opts.getRect() : null;
    const hasTarget = !!r && r.width > 0 && r.height > 0;
    this.layer.classList.toggle("gdm-lost", !!this.opts.getRect && !hasTarget);

    let box;
    if (hasTarget) {
      const x = Math.max(r.left - PAD, -PAD), y = Math.max(r.top - PAD, -PAD);
      const w = Math.min(r.right + PAD, W + PAD) - x, h = Math.min(r.bottom + PAD, H + PAD) - y;
      box = { x, y, w, h };
    } else {
      box = { x: W / 2, y: H / 2, w: 0, h: 0 };
    }
    const px = (n) => `${Math.round(n)}px`;
    const boxStyle = { left: px(box.x), top: px(box.y), width: px(box.w), height: px(box.h) };
    this._set(this.hole, "hole", boxStyle);
    this._set(this.ring, "ring", boxStyle);

    // bloqueadores em volta do buraco
    this._set(this.blocks.t, "bt", { left: "0px", top: "0px", width: px(W), height: px(Math.max(0, box.y)) });
    this._set(this.blocks.b, "bb", { left: "0px", top: px(box.y + box.h), width: px(W), height: px(Math.max(0, H - box.y - box.h)) });
    this._set(this.blocks.l, "bl", { left: "0px", top: px(box.y), width: px(Math.max(0, box.x)), height: px(box.h) });
    this._set(this.blocks.r, "br", { left: px(box.x + box.w), top: px(box.y), width: px(Math.max(0, W - box.x - box.w)), height: px(box.h) });
    this._set(this.blocks.c, "bc", boxStyle);

    // cartão + seta
    const card = this.opts.card;
    let side = null;
    if (card?.isConnected) {
      const cw = card.offsetWidth, ch = card.offsetHeight;
      const place = this._placeCard(hasTarget ? box : null, cw, ch, W, H);
      side = place.side;
      this._set(card, "card", { left: px(place.x), top: px(place.y) });
      if (card.classList.contains("gdm-measuring")) {
        requestAnimationFrame(() => card.classList.remove("gdm-measuring"));
      }
    } else if (hasTarget) {
      side = this._bestSide(box, ARROW + 20, ARROW + 20, W, H, "auto").side;
    }
    this._placeArrow(hasTarget && this.opts.arrow ? box : null, side, W, H);
  }

  _bestSide(box, cw, ch, W, H, pref) {
    const gap = this.opts.arrow ? ARROW + 22 : 18;
    const space = { top: box.y, bottom: H - box.y - box.h, left: box.x, right: W - box.x - box.w };
    const fits = {
      top: space.top >= ch + gap + MARGIN,
      bottom: space.bottom >= ch + gap + MARGIN,
      left: space.left >= cw + gap + MARGIN,
      right: space.right >= cw + gap + MARGIN
    };
    // mantém o lado anterior para o cartão não "pular" enquanto a janela se move
    if (this._cardSide && fits[this._cardSide] && (pref === "auto" || pref === this._cardSide)) return { side: this._cardSide, gap };
    if (pref !== "auto" && fits[pref]) return { side: pref, gap };
    const order = ["bottom", "right", "left", "top"].filter((s) => fits[s]);
    if (order.length) {
      order.sort((a, b) => space[b] - space[a]);
      return { side: order[0], gap };
    }
    return { side: null, gap };
  }

  _placeCard(box, cw, ch, W, H) {
    const clampX = (x) => Math.min(Math.max(x, MARGIN), W - cw - MARGIN);
    const clampY = (y) => Math.min(Math.max(y, MARGIN), H - ch - MARGIN);
    const pref = this.opts.position ?? "auto";
    if (!box || pref === "center") return { x: (W - cw) / 2, y: (H - ch) / 2, side: null };

    const { side, gap } = this._bestSide(box, cw, ch, W, H, pref);
    this._cardSide = side;
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    switch (side) {
      case "top": return { x: clampX(cx - cw / 2), y: box.y - gap - ch, side };
      case "bottom": return { x: clampX(cx - cw / 2), y: box.y + box.h + gap, side };
      case "left": return { x: box.x - gap - cw, y: clampY(cy - ch / 2), side };
      case "right": return { x: box.x + box.w + gap, y: clampY(cy - ch / 2), side };
      default: {
        // Alvo enorme: cartão no canto oposto ao centro do alvo
        const x = cx > W / 2 ? MARGIN * 3 : W - cw - MARGIN * 3;
        return { x: clampX(x), y: clampY(H - ch - 90), side: null };
      }
    }
  }

  _placeArrow(box, side, W, H) {
    if (!box || !side) {
      this._set(this.arrow, "arrow", { opacity: "0" });
      return;
    }
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
    let x, y, rot;
    switch (side) {
      case "top": x = clamp(cx, box.x + 14, box.x + box.w - 14) - ARROW / 2; y = box.y - ARROW - 8; rot = 90; break;
      case "bottom": x = clamp(cx, box.x + 14, box.x + box.w - 14) - ARROW / 2; y = box.y + box.h + 8; rot = -90; break;
      case "left": x = box.x - ARROW - 8; y = clamp(cy, box.y + 14, box.y + box.h - 14) - ARROW / 2; rot = 0; break;
      case "right": x = box.x + box.w + 8; y = clamp(cy, box.y + 14, box.y + box.h - 14) - ARROW / 2; rot = 180; break;
    }
    x = clamp(x, 2, W - ARROW - 2);
    y = clamp(y, 2, H - ARROW - 2);
    this._set(this.arrow, "arrow", {
      opacity: "1",
      transform: `translate(${Math.round(x)}px, ${Math.round(y)}px) rotate(${rot}deg)`
    });
  }

  /** Esconde com animação e remove */
  destroy() {
    cancelAnimationFrame(this._raf);
    this.layer.classList.remove("gdm-in");
    this.layer.classList.add("gdm-out");
    const el = this.layer;
    setTimeout(() => el.remove(), 320);
  }
}
