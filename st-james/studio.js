/* The St. James: page wiring and the design studio.
   The studio never asks a server for a new picture. Each view comes as one rendered base picture plus small parts rendered in every finish:
   coverage masks (how much of each pixel belongs to the siding, the stone, the windows ...), "replace" layers (a part in another finish),
   "region" layers (the picture where shapes change) and colour transfers learned from real renders. The parts are combined here, pixel by pixel. */
(function () {
  "use strict";
  var S = window.SJ, $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* links inside the page scroll, they do not navigate (the page has a base address) */
  document.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return; var t = document.getElementById(a.getAttribute("href").slice(1)); if (t) { e.preventDefault(); t.scrollIntoView({ behavior: "smooth", block: "start" }); } });
  /* ---------- hero, stats, gallery, plans, lot, specifications ---------- */
  var hero = $("hero"); hero.querySelector("img.a").src = S.hero.day; var nb = hero.querySelector("img.b");
  Array.prototype.forEach.call(hero.querySelectorAll(".tog button"), function (b) {
    b.onclick = function () { if (!nb.src) nb.src = S.hero.night; hero.classList.toggle("night", b.dataset.m === "night"); Array.prototype.forEach.call(hero.querySelectorAll(".tog button"), function (x) { x.classList.toggle("on", x === b); }); };
  });
  S.stats.forEach(function (s) { $("stats").appendChild(el("div", "", "<b>" + s[0] + "</b><span>" + s[1] + "</span>")); });
  /* The pictures further down the page are the studio's own views, each drawn in the choices made (see "every room" below, after the compositor). The large view shows one of them. */
  var lb = $("lb"), lbi = 0, lbSeq = 0;
  function show(i) {
    var n = S.views.length, v = S.views[lbi = (i + n) % n], my = ++lbSeq, im = lb.querySelector("img");
    lb.querySelector("p").textContent = v.name; im.src = "v/" + v.id + "/base.jpg"; lb.classList.add("on");
    if (roomDefault(v)) return;
    roomPicture(v, function () { return my === lbSeq; }).then(function (c) { if (c && my === lbSeq) im.src = c.toDataURL("image/jpeg", 0.9); });
  }
  lb.querySelector(".go").onclick = function (e) { e.stopPropagation(); var v = S.views[lbi]; lb.classList.remove("on"); setView(v.id); var t = $("studio"); window.scrollTo({ top: t.getBoundingClientRect().top + window.pageYOffset - 46, behavior: "smooth" }); };
  lb.querySelector(".x").onclick = function () { lb.classList.remove("on"); }; lb.querySelector(".p").onclick = function (e) { e.stopPropagation(); show(lbi - 1); }; lb.querySelector(".n").onclick = function (e) { e.stopPropagation(); show(lbi + 1); };
  lb.onclick = function (e) { if (e.target === lb) lb.classList.remove("on"); };
  document.addEventListener("keydown", function (e) { if (!lb.classList.contains("on")) return; if (e.key === "Escape") lb.classList.remove("on"); if (e.key === "ArrowLeft") show(lbi - 1); if (e.key === "ArrowRight") show(lbi + 1); });
  $("planlead").textContent = S.plan_lead;
  S.plans.forEach(function (p, i) {
    var b = el("button", i ? "" : "on", p.name + "<small>" + p.note + "</small>");
    b.onclick = function () { Array.prototype.forEach.call($("lv").children, function (x) { x.classList.toggle("on", x === b); }); $("sheet").innerHTML = p.svg; };
    $("lv").appendChild(b); if (!i) $("sheet").innerHTML = p.svg;
  });
  $("lotlead").textContent = S.lot.lead; $("lotsheet").innerHTML = S.lot.svg; $("lotfacts").innerHTML = S.lot.facts;
  S.specs.forEach(function (s) { $("spec").appendChild(el("div", "", "<h3>" + s.h + "</h3><ul>" + s.items.map(function (i) { return "<li>" + i + "</li>"; }).join("") + "</ul>")); });
  $("foot").innerHTML = S.foot.map(function (p) { return "<p>" + p + "</p>"; }).join("");
  var tb = $("tourbox");
  if (S.tour) { var go = el("div", "go", "<b>Walk through the house</b><span>Start the 360&deg; walk-through</span>"); go.style.backgroundImage = "url(" + S.tour.poster + ")"; go.onclick = function () { tb.innerHTML = '<iframe allowfullscreen src="' + S.tour.src + '"></iframe>'; }; tb.appendChild(go); }
  else tb.parentNode.parentNode.style.display = "none";

  /* ---------- the 3D model: opened in place with the choices made so far, and kept in step with them both ways ---------- */
  var m3 = $("m3dbox");
  function open3d() { if (!S.model3d || $("f3d")) return; m3.innerHTML = '<iframe id="f3d" allowfullscreen src="' + S.model3d.src + "#d=" + hashOf() + '"></iframe>'; }
  if (S.model3d) {
    var go3 = el("div", "go", "<b>See your design in 3D</b><span>Open the 3D model</span>"); go3.style.backgroundImage = "url(" + S.model3d.poster + ")"; go3.onclick = open3d; m3.appendChild(go3);
    $("b3d").hidden = false; $("b3d").onclick = function () { open3d(); $("model3d").scrollIntoView({ behavior: "smooth", block: "start" }); };
    $("m3dfull").onclick = function () { $("m3dfull").href = S.model3d.src + "#d=" + hashOf(); };
    window.addEventListener("message", function (e) {
      if (!e.data || typeof e.data.sj3d !== "string") return; var kn = e.data.known, has = function (k) { return !kn || kn.indexOf(k) >= 0; };      /* a choice the 3D model does not know (it was baked before the choice existed) keeps its value */
      Object.keys(state).forEach(function (k) { var q = k.indexOf(":"); if (q > 0) { if (has(k.slice(q + 1))) delete state[k]; } else if (has(k)) state[k] = D[k]; }); readHash(e.data.sj3d);
      panel(); summary(true); render();
    });
  } else { $("model3d").style.display = "none"; $("nav3d").style.display = "none"; }

  /* ---------- design studio ----------
     State: one choice per group for the house, and for the bathrooms a second layer: "ba:<group>" for all bathrooms and "<bath>:<group>" for one bathroom (cabinets, tops, tile, paint and
     hardware there no longer follow the kitchen). A view of a bathroom is drawn with that bathroom's own choices. */
  var cv = $("cv"), ctx = cv.getContext("2d", { willReadFrequently: true });
  var D = S.defaults, state = {}, view = null, man = null, seq = 0, cache = {}, last = null, baseImg = null, mans = {}, allBaths = true, OPT = {}, BK = {}, BATHS = S.baths || [];
  S.opts.forEach(function (o) { OPT[o.key] = o; }); (S.bathkeys || []).forEach(function (k) { BK[k] = 1; });
  Object.keys(D).forEach(function (k) { state[k] = D[k]; });
  var qv = (location.search.match(/[?&]v=([\w-]+)/) || [])[1];      /* ?v=<id> opens one view directly (used to check new layer sets; there, any known choice key is taken from the link) */
  function readHash(h) {
    (h || "").split(",").forEach(function (kv) {
      var p = kv.split("."); if (p.length !== 2) return; var q = p[0].split(":"), k = q[q.length - 1], sc = q.length === 2 ? q[0] : "";
      if (D[k] == null || (OPT[k] && !OPT[k].ch.some(function (c) { return c.id === p[1]; }))) return;      /* (a choice the page does not list yet, made in the 3D model, is kept as it came) */
      if (!sc) state[k] = p[1]; else if (BK[k] && (sc === "ba" || BATHS.some(function (b) { return b.id === sc; }))) state[sc + ":" + k] = p[1];
    });
  }
  readHash((location.hash.match(/d=([^&]+)/) || ["", ""])[1]);
  function bathVal(sc, k) { var v = state[sc + ":" + k]; if (v == null) v = state["ba:" + k]; return v == null ? D[k] : v; }
  function eff(sc) { var e = {}; Object.keys(D).forEach(function (k) { e[k] = sc && BK[k] ? bathVal(sc, k) : state[k]; }); return e; }      /* the choices one view is drawn with */
  function vw(id) { return S.views.filter(function (v) { return v.id === id; })[0]; }
  function choose(sc, k, id) {
    if (!(sc && BK[k])) { state[k] = id; return; }
    if (allBaths) { BATHS.forEach(function (b) { delete state[b.id + ":" + k]; }); if (id === D[k]) delete state["ba:" + k]; else state["ba:" + k] = id; }
    else { var inh = state["ba:" + k] == null ? D[k] : state["ba:" + k]; if (id === inh) delete state[sc + ":" + k]; else state[sc + ":" + k] = id; }
  }
  function cname(k, id) { var o = OPT[k], c = o && o.ch.filter(function (c) { return c.id === id; })[0]; return c ? c.name : (o ? o.ch[0].name : id); }
  function busy(on) { $("busy").classList.toggle("on", !!on); }
  function img(url) { return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error(url)); }; im.src = url; }); }
  var lru = [];
  function keep(k) { var i = lru.indexOf(k); if (i >= 0) lru.splice(i, 1); lru.push(k); while (lru.length > 40) delete cache[lru.shift()]; }
  function pix(url, w, h) {                                 /* decoded RGBA of a picture at w x h (the last 40 are kept) */
    keep(url); if (cache[url]) return cache[url];
    return cache[url] = img(url).then(function (im) { var c = document.createElement("canvas"); c.width = w; c.height = h; var x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(im, 0, 0, w, h); return x.getImageData(0, 0, w, h).data; });
  }
  function chans(url, w, h) {                               /* a mask picture as three one-byte planes */
    var k = "m:" + url; keep(k); if (cache[k]) return cache[k];
    return cache[k] = img(url).then(function (im) {
      var c = document.createElement("canvas"); c.width = w; c.height = h; var x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(im, 0, 0, w, h); var d = x.getImageData(0, 0, w, h).data, n = w * h, P = [new Uint8Array(n), new Uint8Array(n), new Uint8Array(n)];
      for (var i = 0, j = 0; i < n; i++, j += 4) { P[0][i] = d[j]; P[1][i] = d[j + 1]; P[2][i] = d[j + 2]; }
      return P;
    });
  }
  function key(ks, st) { return ks.map(function (k) { return st[k]; }).join("-"); }
  /* One view in one set of choices. Returns { out, base } (RGBA bytes), or null when `alive` says the answer is no longer wanted. */
  async function compose(vid, m, state, alive) {
    var W = m.w, H = m.h, G = m.groups, vurl = function (f) { return "v/" + vid + "/" + f; };
    var REG = m.regs || ["sc", "pst", "dr", "fp", "sr"].filter(function (k) { return G[k]; }), REGKEYS = {}; REG.forEach(function (k) { G[k].keys.forEach(function (q) { REGKEYS[q] = 1; }); });
    var base = await pix(vurl(m.base), W, H); if (!alive()) return null;
    var out = new Uint8ClampedArray(base), patches = [], g, d, i, x, y;
    /* 1. choices that change shapes: the picture inside their rectangle, feathered into the base */
    for (var r = 0; r < REG.length; r++) {
      g = REG[r]; d = G[g]; if (!d || d.kind !== "region") continue;
      var ck = key(d.keys, state); if (ck === key(d.keys, D)) continue;
      var L = d.layers[ck + (d.deps.length ? "@" + key(d.deps, state) : "")]; if (!L) continue;
      var b = d.box, bw = b[2] - b[0], bh = b[3] - b[1], p = await pix(vurl(L.img), bw, bh); if (!alive()) return null;
      var F = 10, al = null;
      if (L.chg) for (var pk = 0; pk < patches.length; pk++) {      /* its rectangle runs into one already laid down: deep inside that one, only what this picture really changes goes over it (the bookcase beside the stair stays) */
        var pb = patches[pk].box, ix0 = Math.max(b[0], pb[0]), iy0 = Math.max(b[1], pb[1]), ix1 = Math.min(b[2], pb[2]), iy1 = Math.min(b[3], pb[3]); if (ix1 <= ix0 || iy1 <= iy0) continue;
        if (!al) { al = new Uint8Array(bw * bh).fill(255); var CH = (await chans(vurl(L.chg), bw, bh))[0]; if (!alive()) return null; }
        for (y = iy0; y < iy1; y++) for (x = ix0; x < ix1; x++) {
          var dp = Math.min(pb[0] > 0 ? x - pb[0] : 1e9, pb[2] < W ? pb[2] - 1 - x : 1e9, pb[1] > 0 ? y - pb[1] : 1e9, pb[3] < H ? pb[3] - 1 - y : 1e9), e1 = dp >= 40 ? 0 : 255 * (1 - dp / 40), qi = (y - b[1]) * bw + x - b[0];
          al[qi] = Math.min(al[qi], Math.max(CH[qi], e1));
        }
      }
      for (y = 0; y < bh; y++) {
        var fy = Math.min(b[1] > 0 ? (y + 1) / F : 1, b[3] < H ? (bh - y) / F : 1, 1);
        for (x = 0; x < bw; x++) {
          var f = Math.min(fy, b[0] > 0 ? (x + 1) / F : 1, b[2] < W ? (bw - x) / F : 1), o = ((y + b[1]) * W + x + b[0]) * 4, q = (y * bw + x) * 4;
          if (al) f *= al[y * bw + x] / 255;
          if (f >= 1) { out[o] = p[q]; out[o + 1] = p[q + 1]; out[o + 2] = p[q + 2]; } else { out[o] += (p[q] - out[o]) * f; out[o + 1] += (p[q + 1] - out[o + 1]) * f; out[o + 2] += (p[q + 2] - out[o + 2]) * f; }
        }
      }
      patches.push({ box: b, masks: L.masks, al: al });
    }
    var PM = null; if (patches.length) { PM = new Uint8Array(W * H); patches.forEach(function (pt) { var bq = pt.box; for (var yq = bq[1]; yq < bq[3]; yq++) PM.fill(1, yq * W + bq[0], yq * W + bq[2]); }); }
    /* 2. the mask of a group for the shapes now chosen */
    var mc = {};
    var mask = async function (gg) {
      if (mc[gg] !== undefined) return mc[gg]; var e = m.masks[gg]; if (!e) return (mc[gg] = null);
      var a = (await chans(vurl(e[0]), W, H))[e[1]], cp = false;
      for (var k = 0; k < patches.length; k++) {
        var pm = patches[k].masks[gg]; if (!pm) continue; var bb = patches[k].box, w2 = bb[2] - bb[0], h2 = bb[3] - bb[1], c = (await chans(vurl(pm[0]), w2, h2))[pm[1]];
        if (!cp) { a = a.slice(); cp = true; }
        var pa = patches[k].al;
        for (var yy = 0; yy < h2; yy++) {
          if (!pa) { a.set(c.subarray(yy * w2, yy * w2 + w2), (yy + bb[1]) * W + bb[0]); continue; }
          for (var xx = 0; xx < w2; xx++) { var ai = pa[yy * w2 + xx], gi = (yy + bb[1]) * W + bb[0] + xx; a[gi] = ai === 255 ? c[yy * w2 + xx] : (c[yy * w2 + xx] * ai + a[gi] * (255 - ai)) / 255; }
        }
      }
      return (mc[gg] = a);
    };
    /* 3. parts in another finish: add (new - as first shown) wherever the part shows. Where the layers hold nothing for a pixel the part now covers
          (another arrangement of the house shows more of it), a transfer learned from the layers recolours what is there. */
    var cval = function (C, r8, g8, b8, res) {              /* the transfer's value for one colour */
      var NB = C.length, R = r8 / 255, Gc = g8 / 255, Bc = b8 / 255, tt = (0.3 * R + 0.59 * Gc + 0.11 * Bc) * NB - 0.5, i0 = Math.max(0, Math.min(NB - 1, Math.floor(tt))), i1 = Math.min(NB - 1, i0 + 1), ff = Math.max(0, Math.min(1, tt - i0)), a0 = C[i0], a1 = C[i1];
      for (var c2 = 0; c2 < 3; c2++) { var k0 = c2 * 4; res[c2] = ((a0[k0] * R + a0[k0 + 1] * Gc + a0[k0 + 2] * Bc + a0[k0 + 3]) * (1 - ff) + (a1[k0] * R + a1[k0 + 1] * Gc + a1[k0 + 2] * Bc + a1[k0 + 3]) * ff) * 255; }
    };
    var curve = function (C, o3, tm) {
      var NB = C.length, R = out[o3] / 255, Gc = out[o3 + 1] / 255, Bc = out[o3 + 2] / 255, tt = (0.3 * R + 0.59 * Gc + 0.11 * Bc) * NB - 0.5, i0 = Math.max(0, Math.min(NB - 1, Math.floor(tt))), i1 = Math.min(NB - 1, i0 + 1), ff = Math.max(0, Math.min(1, tt - i0)), a0 = C[i0], a1 = C[i1];
      for (var c2 = 0; c2 < 3; c2++) { var k0 = c2 * 4, v = (a0[k0] * R + a0[k0 + 1] * Gc + a0[k0 + 2] * Bc + a0[k0 + 3]) * (1 - ff) + (a1[k0] * R + a1[k0 + 1] * Gc + a1[k0 + 2] * Bc + a1[k0 + 3]) * ff; out[o3 + c2] += (v * 255 - out[o3 + c2]) * tm; }
    };
    for (g in G) {
      d = G[g]; if (d.kind !== "replace") continue;
      var rs = {}; Object.keys(D).forEach(function (k) { rs[k] = D[k]; }); d.deps.forEach(function (k) { if (REGKEYS[k]) rs[k] = state[k]; });
      var ref = key(d.keys, D) + (d.deps.length ? "@" + key(d.deps, rs) : ""), tgt = key(d.keys, state) + (d.deps.length ? "@" + key(d.deps, state) : "");
      if (key(d.keys, state) === key(d.keys, D) && ref === tgt) continue;
      var M = await mask(g); if (!alive()) return null; if (!M) continue;
      var Cv = d.curves && d.curves[key(d.keys, state)], done = Cv ? new Uint8Array(W * H) : null, pre = Cv && ref !== tgt ? out.slice() : null;
      if (ref !== tgt && d.layers[ref] && d.layers[tgt]) {
        var bx = d.box, w3 = bx[2] - bx[0], h3 = bx[3] - bx[1], A = await pix(vurl(d.layers[ref]), w3, h3), T = await pix(vurl(d.layers[tgt]), w3, h3);
        var vf = d.valid && d.valid[ref.indexOf("@") >= 0 ? ref.split("@")[1] : ""], V = vf ? (await chans(vurl(vf), w3, h3))[0] : null; if (!alive()) return null;
        for (y = 0; y < h3; y++) for (x = 0; x < w3; x++) {
          var pi = (y + bx[1]) * W + x + bx[0], mi = M[pi]; if (!mi) continue; var o2 = pi * 4, q2 = (y * w3 + x) * 4;
          if (V && V[y * w3 + x] < 128) continue;        /* the layers hold nothing here */
          if (done) done[pi] = 1;
          var dr = T[q2] - A[q2], dg = T[q2 + 1] - A[q2 + 1], db = T[q2 + 2] - A[q2 + 2];
          if (mi > 249) {                                /* fully this part: where the finish really differs, the new layer itself; where it does not (glass in a window whose frame changed), the picture stays as it is */
            var dm = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)), w = dm <= 4 ? 0 : dm >= 14 ? 1 : (dm - 4) / 10, kk = 1; w = w * w * (3 - 2 * w);
            if (PM && PM[pi] && ref.indexOf("@") < 0) {     /* inside a changed shape's rectangle the light itself may have changed (a wall gone): the new layer takes the light of the picture as it now is */
              kk = (0.3 * out[o2] + 0.59 * out[o2 + 1] + 0.11 * out[o2 + 2] + 6) / (0.3 * A[q2] + 0.59 * A[q2 + 1] + 0.11 * A[q2 + 2] + 6); kk = Math.max(0.6, Math.min(1.6, kk));
              var ka = Math.abs(kk - 1), ks = ka <= 0.025 ? 0 : ka >= 0.07 ? 1 : (ka - 0.025) / 0.045; kk = 1 + (kk - 1) * ks;
            }
            out[o2] += dr + (T[q2] * kk - out[o2] - dr) * w; out[o2 + 1] += dg + (T[q2 + 1] * kk - out[o2 + 1] - dg) * w; out[o2 + 2] += db + (T[q2 + 2] * kk - out[o2 + 2] - db) * w;
          } else { var t = mi / 255; out[o2] += dr * t; out[o2 + 1] += dg * t; out[o2 + 2] += db * t; }
        }
      }
      if (Cv) {                                          /* (the transfer is learned over the whole picture: around each place it fills, it is first matched to what the layers gave there, so the two meet without a step) */
        var CE = 8, gw = Math.ceil(W / CE), gh = Math.ceil(H / CE), S4 = [new Float32Array(gw * gh), new Float32Array(gw * gh), new Float32Array(gw * gh), new Float32Array(gw * gh)], any = false, cv3 = [0, 0, 0];
        for (i = 0; i < W * H; i++) if (M[i] && !done[i]) { any = true; break; }
        if (any && pre) {
          for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
            i = y * W + x; if (!done[i] || M[i] < 250) continue; var o4 = i * 4, ci = (y / CE | 0) * gw + (x / CE | 0);
            cval(Cv, pre[o4], pre[o4 + 1], pre[o4 + 2], cv3); S4[0][ci] += out[o4] - cv3[0]; S4[1][ci] += out[o4 + 1] - cv3[1]; S4[2][ci] += out[o4 + 2] - cv3[2]; S4[3][ci] += 1;
          }
          var tmpB = new Float32Array(gw * gh), RB = 3;
          S4.forEach(function (a4) {                       /* (a wide, soft average: three passes each way) */
            for (var ps = 0; ps < 3; ps++) {
              var X, Y, k4, acc;
              for (Y = 0; Y < gh; Y++) for (X = 0; X < gw; X++) { acc = 0; for (k4 = Math.max(0, X - RB); k4 <= Math.min(gw - 1, X + RB); k4++) acc += a4[Y * gw + k4]; tmpB[Y * gw + X] = acc; }
              for (Y = 0; Y < gh; Y++) for (X = 0; X < gw; X++) { acc = 0; for (k4 = Math.max(0, Y - RB); k4 <= Math.min(gh - 1, Y + RB); k4++) acc += tmpB[k4 * gw + X]; a4[Y * gw + X] = acc; }
            }
          });
        }
        if (any) for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
          i = y * W + x; if (!M[i] || done[i]) continue; var o5 = i * 4, t5 = M[i] / 255, c5 = (y / CE | 0) * gw + (x / CE | 0), n5 = S4[3][c5];
          cval(Cv, out[o5], out[o5 + 1], out[o5 + 2], cv3);
          if (n5 > 1e-3) { cv3[0] += Math.max(-40, Math.min(40, S4[0][c5] / n5)); cv3[1] += Math.max(-40, Math.min(40, S4[1][c5] / n5)); cv3[2] += Math.max(-40, Math.min(40, S4[2][c5] / n5)); }
          out[o5] += (cv3[0] - out[o5]) * t5; out[o5 + 1] += (cv3[1] - out[o5 + 1]) * t5; out[o5 + 2] += (cv3[2] - out[o5 + 2]) * t5;
        }
      }
    }
    /* 4. paint colours: the transfer learned from real renders of that colour, band by band of brightness */
    for (g in G) {
      d = G[g]; if (d.kind !== "paint") continue; if (d.only && !Object.keys(d.only).every(function (k) { return state[k] === d.only[k]; })) continue;
      var C = d.curves[key(d.keys, state)]; if (!C) continue; var Mp = await mask(g); if (!alive()) return null; if (!Mp) continue;
      for (i = 0; i < W * H; i++) { if (Mp[i]) curve(C, i * 4, Mp[i] / 255); }
    }
    /* 5. parts the home as first shown does not have (shutters): their picture goes over whatever is there, by how much of each pixel they cover */
    for (g in G) {
      d = G[g]; if (d.kind !== "addon") continue; var La = d.layers[key(d.keys, state) + (d.deps && d.deps.length ? "@" + key(d.deps, state) : "")]; if (!La) continue;
      var ba = d.box, wa = ba[2] - ba[0], ha = ba[3] - ba[1], Ta = await pix(vurl(La.img), wa, ha), Ma = (await chans(vurl(La.mask), wa, ha))[0]; if (!alive()) return null;
      for (y = 0; y < ha; y++) for (x = 0; x < wa; x++) {
        var ma = Ma[y * wa + x]; if (!ma) continue; var oa = ((y + ba[1]) * W + x + ba[0]) * 4, qa = (y * wa + x) * 4, ta = ma / 255;
        out[oa] += (Ta[qa] - out[oa]) * ta; out[oa + 1] += (Ta[qa + 1] - out[oa + 1]) * ta; out[oa + 2] += (Ta[qa + 2] - out[oa + 2]) * ta;
      }
    }
    return alive() ? { out: out, base: base } : null;
  }
  async function render() {
    if (!man) return; var my = ++seq, m = man, v = vw(view); busy(true);
    try {
      var r = await compose(view, m, eff(v && v.scope), function () { return my === seq; });
      if (r) { last = new ImageData(r.out, m.w, m.h); baseImg = new ImageData(new Uint8ClampedArray(r.base), m.w, m.h); ctx.putImageData(last, 0, 0); if (view === "hero") topShow(last); roomShow(v, last); }
    } catch (e) { console.error(e); }
    if (my === seq) busy(false);
  }
  async function manOf(id) { return mans[id] || (mans[id] = await (await fetch("v/" + id + "/m.json")).json()); }
  /* The picture at the top of the page wears the design too: the street view, drawn in the choices made. It is drawn again when a choice it shows has changed and the picture is on screen
     (the studio's own street view hands its picture over as it is). The dusk picture stays the home as first drawn. */
  var topCv = $("heroCv"), topSeq = 0, topDirty = false, topSeen = true, topT = 0, topKey = "";
  function topKeys() { var v = vw("hero"); return (v && v.keys) || []; }
  function topSig() { return topKeys().map(function (k) { return state[k]; }).join("."); }
  function topShow(im) { topSeq++; topKey = topSig(); topDirty = false; if (!topKeys().some(function (k) { return state[k] !== D[k]; })) { hero.classList.remove("mine"); return; }
    if (topCv.width !== im.width) { topCv.width = im.width; topCv.height = im.height; } topCv.getContext("2d").putImageData(im, 0, 0); hero.classList.add("mine"); }
  function topPaint() {
    if (!vw("hero") || topSig() === topKey) return; topDirty = true; if (!topSeen) return;
    clearTimeout(topT); topT = setTimeout(async function () {
      if (!topKeys().some(function (k) { return state[k] !== D[k]; })) { topSeq++; topKey = topSig(); topDirty = false; hero.classList.remove("mine"); return; }
      var my = ++topSeq, sig = topSig();
      try { var m = await manOf("hero"), r = await compose("hero", m, eff(""), function () { return my === topSeq; }); if (r && my === topSeq && sig === topSig()) topShow(new ImageData(r.out, m.w, m.h)); } catch (e) { console.error(e); }
    }, 220);
  }
  /* ---------- every room: the pictures at the foot of the page are these same views in the choices made. A view no choice has touched shows its picture as first drawn;
     the others are drawn when they come on screen, one at a time, and again when a choice they show changes. ---------- */
  var ROOM = {}, roomQ = [], roomBusy = false;
  function roomSig(v) { var e = eff(v.scope || ""); return (v.keys || []).map(function (k) { return e[k]; }).join("."); }
  function roomDefault(v) { var e = eff(v.scope || ""); return (v.keys || []).every(function (k) { return e[k] === D[k]; }); }
  async function roomPicture(v, alive) {                  /* a canvas with the view in the choices made */
    var m = await manOf(v.id), r = await compose(v.id, m, eff(v.scope || ""), alive); if (!r) return null;
    var c = document.createElement("canvas"); c.width = m.w; c.height = m.h; c.getContext("2d").putImageData(new ImageData(r.out, m.w, m.h), 0, 0); return c;
  }
  function roomDraw(t, src) { var x = t.cv.getContext("2d"); x.drawImage(src, 0, 0, t.cv.width, t.cv.height); t.fig.classList.add("mine"); }
  function roomShow(v, im) {                               /* the studio has just drawn this view: its small picture takes it over */
    var t = v && ROOM[v.id]; if (!t) return; t.sig = roomSig(v); t.dirty = false;
    if (roomDefault(v)) { t.fig.classList.remove("mine"); return; }
    var c = document.createElement("canvas"); c.width = im.width; c.height = im.height; c.getContext("2d").putImageData(im, 0, 0); roomDraw(t, c);
  }
  async function roomNext() {
    if (roomBusy) return; roomBusy = true;
    while (roomQ.length) {
      var t = roomQ.shift(), v = t.v, sig = roomSig(v); t.queued = false;
      if (sig === t.sig && !t.dirty) continue;
      if (roomDefault(v)) { t.fig.classList.remove("mine"); t.sig = sig; t.dirty = false; continue; }
      t.fig.classList.add("work");
      try { var c = await roomPicture(v, function () { return roomSig(v) === sig; }); if (c) { roomDraw(t, c); t.sig = sig; t.dirty = false; } else if (t.seen && !t.queued) { t.queued = true; roomQ.push(t); } } catch (e) { console.error(e); }
      t.fig.classList.remove("work");
      await new Promise(function (res) { setTimeout(res, 30); });      /* (the page stays responsive between two pictures) */
    }
    roomBusy = false;
  }
  function roomsPaint() { Object.keys(ROOM).forEach(function (id) { var t = ROOM[id]; if (roomSig(t.v) !== t.sig) { t.dirty = true; if (t.seen && !t.queued) { t.queued = true; roomQ.push(t); } } }); roomNext(); }
  var roomIO = window.IntersectionObserver ? new IntersectionObserver(function (es) { es.forEach(function (e) { var t = ROOM[e.target.dataset.v]; if (!t) return; t.seen = e.isIntersecting; if (t.seen && t.dirty && !t.queued) { t.queued = true; roomQ.push(t); } }); roomNext(); }, { rootMargin: "300px 0px" }) : null;
  S.views.forEach(function (v, i) {
    var f = el("figure", "", '<img loading="lazy" alt="' + v.name + '" src="v/' + v.id + '/base-s.jpg"><canvas width="800" height="500"></canvas><figcaption>' + v.name + "</figcaption>"); f.dataset.v = v.id; f.onclick = function () { show(i); };
    $("grid").appendChild(f); ROOM[v.id] = { v: v, fig: f, cv: f.querySelector("canvas"), seen: !roomIO, dirty: true, sig: null, queued: false }; if (roomIO) roomIO.observe(f);
  });
  if (window.IntersectionObserver) { topSeen = false; new IntersectionObserver(function (es) { topSeen = es[es.length - 1].isIntersecting; if (topSeen && topDirty) topPaint(); }, { rootMargin: "200px 0px" }).observe(hero); }
  async function setView(id) {
    view = id; Array.prototype.forEach.call($("views").children, function (b) { b.classList.toggle("on", b.dataset.v === id); if (b.dataset.v === id) { var vs = $("views"); vs.scrollLeft = Math.max(0, b.offsetLeft - (vs.clientWidth - b.offsetWidth) / 2); } }); busy(true);
    var im = await img("v/" + id + "/base-s.jpg").catch(function () { return null; }); if (view !== id) return;
    man = await manOf(id); if (view !== id) return;
    cv.width = man.w; cv.height = man.h; if (im) ctx.drawImage(im, 0, 0, man.w, man.h);
    panel(); render();
  }
  function uses(k) { if (!man) return true; for (var g in man.groups) if (man.groups[g].keys.indexOf(k) >= 0 || (man.groups[g].deps || []).indexOf(k) >= 0) return true; return false; }
  function shownIn(k) { return S.views.filter(function (v) { return (v.keys || []).indexOf(k) >= 0; }); }      /* the views whose picture a choice changes */
  function oname(o, sc) { return sc && BK[o.key] && o.bname ? o.bname : o.name; }
  /* Under the picture: only the choices this room's picture answers to. In a bathroom, a switch says whether a choice goes to every bathroom or to this one alone. */
  function panel() {
    var v = vw(view) || {}, sc = v.scope || "", O = $("opts"); O.innerHTML = "";
    $("tabs").innerHTML = "<b>" + (v.name || "") + "</b><span>" + (v.kind === "ext" ? "Choices in this view" : "Choices in this room") + "</span>";
    if (sc) {
      var sw = el("div", "opt scope", "<h4>Bathroom choices go to</h4>"), seg = el("div", "seg");
      [[true, "All bathrooms"], [false, "This bathroom only"]].forEach(function (t) { var b = el("button", allBaths === t[0] ? "on" : "", t[1]); b.onclick = function () { allBaths = t[0]; panel(); }; seg.appendChild(b); });
      sw.appendChild(seg); O.appendChild(sw);
    }
    var e = eff(sc), rank = function (o) { return (sc && BK[o.key] ? 0 : 2) + (o.cat === (v.kind || "int") ? 0 : 1); };
    var shown = S.opts.filter(function (o) { return uses(o.key); }).map(function (o, i) { return [rank(o), i, o]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).map(function (t) { return t[2]; });      /* the room's own choices first */
    shown.forEach(function (o) {
      var bath = sc && BK[o.key], cur = o.ch.filter(function (c) { return c.id === e[o.key]; })[0] || o.ch[0], off = o.only && !Object.keys(o.only).every(function (k) { return e[k] === o.only[k]; });
      var box = el("div", "opt" + (off ? " off" : ""), "<h4>" + oname(o, sc) + "<em>" + cur.name + "</em></h4>"), row = el("div", o.ch[0].css ? "sw" : "chips");
      o.ch.forEach(function (c) {
        var b = el("button", c.id === e[o.key] ? "on" : "", c.css ? "" : c.name); b.title = c.name; b.setAttribute("aria-label", oname(o, sc) + ": " + c.name); if (c.css) b.style.background = c.css;
        b.onclick = function () { if (o.only) Object.keys(o.only).forEach(function (k) { choose(sc, k, o.only[k]); }); choose(sc, o.key, c.id); summary(); panel(); render(); }; row.appendChild(b);      /* (a carpet colour brings the carpet back) */
      });
      box.appendChild(row);
      if (bath && !allBaths) box.appendChild(el("p", "where", "Only in the " + v.name.toLowerCase()));
      else if (sc && !bath) box.appendChild(el("p", "where", "Not a bathroom choice: it applies to the whole home"));
      else if (v.veil && v.veil.keys.indexOf(o.key) >= 0 && Object.keys(v.veil.when).every(function (k) { return e[k] === v.veil.when[k]; })) box.appendChild(el("p", "where", v.veil.note));      /* (a choice hidden behind another one in this picture) */
      else if (o.note) box.appendChild(el("p", "where", o.note));
      O.appendChild(box);
    });
    if (!shown.length) O.appendChild(el("div", "opt", "<h4>Nothing to choose in this view</h4>"));
    var lk = el("div", "opt looks", "<h4>Or start from a whole look</h4>"), lr = el("div", "chips"), cat = v.kind || "int";      /* a whole scheme in one tap; every choice can still be changed afterwards */
    (S.looks || []).filter(function (l) { return l.cat === cat; }).forEach(function (l) {
      var same = S.opts.filter(function (o) { return o.cat === cat; }).every(function (o) { return state[o.key] === (l.set[o.key] || D[o.key]); }), b = el("button", same ? "on" : "", l.name);
      b.onclick = function () { S.opts.forEach(function (o) { if (o.cat === cat) state[o.key] = l.set[o.key] || D[o.key]; }); panel(); summary(); render(); }; lr.appendChild(b);
    });
    lk.appendChild(lr); lk.appendChild(el("p", "where", cat === "ext" ? "Sets every outside choice at once." : "Sets every inside choice at once, except the bathrooms.")); O.appendChild(lk);
  }
  /* every selection as rows of [group, choice, changed?]: the house, then the bathrooms (one line when all share a choice, a line per bathroom when they differ) */
  function rows() {
    var R = S.opts.filter(function (o) { return !o.bathonly; }).map(function (o) { return [o.name, cname(o.key, state[o.key]), state[o.key] !== D[o.key], o.cat]; });
    S.opts.forEach(function (o) {
      if (!BK[o.key] || !o.bname) return; var vals = BATHS.map(function (b) { return bathVal(b.id, o.key); });
      if (vals.every(function (x) { return x === vals[0]; })) R.push(["Bathrooms: " + o.bname.toLowerCase(), cname(o.key, vals[0]), vals[0] !== D[o.key], "bath"]);
      else BATHS.forEach(function (b, i) { if (b.keys.indexOf(o.key) >= 0) R.push([b.name + ": " + o.bname.toLowerCase(), cname(o.key, vals[i]), vals[i] !== D[o.key], "bath"]); });
    });
    return R;
  }
  function hashOf() {
    var h = Object.keys(D).filter(function (k) { return state[k] !== D[k]; }).map(function (k) { return k + "." + state[k]; });
    Object.keys(state).forEach(function (k) { if (k.indexOf(":") > 0) h.push(k + "." + state[k]); }); return h.join(",");
  }
  function summary(from3d) {
    $("sum").innerHTML = rows().map(function (r) { return "<li" + (r[2] ? ' class="chg"' : "") + "><b>" + r[0] + ":</b> " + r[1] + "</li>"; }).join("");
    var h = hashOf(); history.replaceState(null, "", location.pathname + location.search + (h ? "#d=" + h : ""));
    try { localStorage.setItem("sj-design", h); } catch (e) { }
    var f3 = $("f3d"); if (f3 && f3.contentWindow && from3d !== true) f3.contentWindow.postMessage({ sj: h }, "*");
    if (view !== "hero") topPaint();
    roomsPaint();
  }
  S.views.forEach(function (v) { var b = el("button", "", '<img loading="lazy" alt="" src="v/' + v.id + '/base-s.jpg"><span>' + v.name + "</span>"); b.dataset.v = v.id; b.onclick = function () { setView(v.id); }; $("views").appendChild(b); });
  /* hold to see the home as the plans draw it, release to come back to your choices */
  (function () { var b = $("bCmp"), down = function (e) { e.preventDefault(); if (baseImg) ctx.putImageData(baseImg, 0, 0); b.classList.add("on"); }, up = function () { if (b.classList.contains("on") && last) ctx.putImageData(last, 0, 0); b.classList.remove("on"); };
    b.addEventListener("pointerdown", down); ["pointerup", "pointerleave", "pointercancel"].forEach(function (n) { b.addEventListener(n, up); }); })();

  /* ---------- my design as a PDF: every view drawn in the choices made, with its list, written here in the browser ---------- */
  var WH = "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584".split(" ");
  var WB = "278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584".split(" ");
  function clean(s) { return String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7e\xa0-\xff]/g, "?"); }
  function tw(s, size, bold) { var T = bold ? WB : WH, w = 0; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); w += c >= 32 && c < 127 ? +T[c - 32] : 556; } return w * size / 1000; }
  function wrap(s, size, bold, width) { var out = [], line = ""; clean(s).split(" ").forEach(function (w) { var t = line ? line + " " + w : w; if (line && tw(t, size, bold) > width) { out.push(line); line = w; } else line = t; }); if (line) out.push(line); return out; }
  function buildPDF(shots, link) {
    var PW = 612, PH = 792, MG = 42, CW = PW - 2 * MG, objs = [null], pages = [], ink = "0.09 0.094 0.1", soft = "0.36 0.38 0.4", acc = "0.12 0.23 0.2";
    function add(body, stream) { objs.push({ body: body, stream: stream || null }); return objs.length - 1; }
    var fR = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"), fB = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    function page() { var p = { ops: [], im: {}, links: [] }; pages.push(p); return p; }
    function T(p, x, y, size, bold, s, col) { p.ops.push("BT /F" + (bold ? 2 : 1) + " " + size + " Tf " + (col || ink) + " rg " + x.toFixed(2) + " " + y.toFixed(2) + " Td (" + clean(s).replace(/([\\()])/g, "\\$1") + ") Tj ET"); }
    function rule(p, y, col) { p.ops.push((col || "0.86 0.85 0.82") + " RG 0.6 w " + MG + " " + y.toFixed(2) + " m " + (PW - MG) + " " + y.toFixed(2) + " l S"); }
    function pic(p, sh, x, y, w) { var h = w * sh.h / sh.w, id = add("<< /Type /XObject /Subtype /Image /Width " + sh.w + " /Height " + sh.h + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + sh.data.length + " >>", sh.data), nm = "Im" + id;
      p.im[nm] = id; p.ops.push("q " + w.toFixed(2) + " 0 0 " + h.toFixed(2) + " " + x.toFixed(2) + " " + (y - h).toFixed(2) + " cm /" + nm + " Do Q"); return h; }
    function list(p, items, y, cols) {                      /* [name, value, changed] in columns; returns the y below the list */
      var gw = 18, cw = (CW - gw * (cols - 1)) / cols, size = 10, lh = 13, blocks = items.map(function (it) { var n = clean(it[0]) + ":", nw = tw(n + " ", size, true), ls = wrap(it[1], size, false, cw - 10 - nw); if (!ls.length) ls = [""]; return { n: n, nw: nw, ls: ls, chg: it[2], h: ls.length * lh + 4 }; });
      var total = blocks.reduce(function (a, b) { return a + b.h; }, 0), per = Math.ceil(total / cols), c = 0, yy = y, used = 0, ymin = y;
      blocks.forEach(function (b) {
        if (used + b.h > per + 6 && c < cols - 1) { c++; yy = y; used = 0; }
        var x = MG + c * (cw + gw);
        if (b.chg) p.ops.push(acc + " rg " + x.toFixed(2) + " " + (yy - 7.8).toFixed(2) + " 4.6 4.6 re f");
        T(p, x + 9, yy - 8, size, true, b.n); b.ls.forEach(function (l, i) { T(p, x + 9 + (i ? 0 : b.nw), yy - 8 - i * lh, size, false, l, soft); });
        yy -= b.h; used += b.h; ymin = Math.min(ymin, yy);
      });
      return ymin;
    }
    var today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), all = rows(), chg = all.filter(function (r) { return r[2]; });
    /* cover */
    var p = page(), y = PH - MG; T(p, MG, y - 30, 34, true, "The St. James"); T(p, MG, y - 52, 13, false, "My design  \xb7  " + today, soft); y -= 70;
    y -= pic(p, shots[0], MG, y, CW) + 16; wrap(S.sub, 11, false, CW).forEach(function (l) { T(p, MG, y - 9, 11, false, l); y -= 15; }); y -= 10; rule(p, y); y -= 20;
    T(p, MG, y, 13, true, chg.length ? "What I changed (" + chg.length + ")" : "Every choice is as the home was first shown"); y -= 10;
    if (chg.length) y = list(p, chg.slice(0, 40), y, 2);
    if (link) { y = Math.max(MG + 30, y - 16); T(p, MG, y, 9.5, true, "Open this design:"); var ls = wrap(link.replace(/([\/#,&])/g, "$1 "), 9.5, false, CW - 96).map(function (l) { return l.replace(/ /g, ""); }); ls.slice(0, 4).forEach(function (l, i) { T(p, MG + 92, y - i * 12, 9.5, false, l, acc); }); p.links.push([MG, y - 12 * Math.min(4, ls.length) + 6, PW - MG, y + 10, link]); }
    /* one page per view */
    shots.forEach(function (sh) {
      var p = page(), y = PH - MG, v = sh.v, rk = function (o) { return (v.scope && BK[o.key] ? 0 : 2) + (o.cat === v.kind ? 0 : 1); };
      var items = S.opts.filter(function (o) { return v.keys.indexOf(o.key) >= 0; }).map(function (o, i) { return [rk(o), i, o]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).map(function (t) { var o = t[2]; return [oname(o, v.scope), cname(o.key, sh.st[o.key]), sh.st[o.key] !== D[o.key]]; });
      T(p, MG, y - 20, 22, true, v.name); var t = "The St. James"; T(p, PW - MG - tw(t, 10, false), y - 20, 10, false, t, soft); y -= 34;
      y -= pic(p, sh, MG, y, CW) + 22; T(p, MG, y, 12, true, items.length ? "Selections in this " + (v.kind === "ext" ? "view" : "room") : ""); y -= 10;
      if (items.length) y = list(p, items, y, 2);
      if (v.scope) { var own = S.opts.some(function (o) { return BK[o.key] && state[v.scope + ":" + o.key] != null; }); T(p, MG, y - 16, 9, false, own ? "This bathroom has choices of its own." : "Bathroom choices here are the ones set for all bathrooms.", soft); }
    });
    /* everything, in one table */
    var groups = [["Outside", "ext"], ["Inside", "int"], ["Bathrooms", "bath"]], p2 = page(), y2 = PH - MG; T(p2, MG, y2 - 20, 22, true, "All selections"); y2 -= 40;
    groups.forEach(function (gp) {
      var it = all.filter(function (r) { return r[3] === gp[1]; }); if (!it.length) return;
      if (y2 < MG + 150) { p2 = page(); y2 = PH - MG - 10; }
      T(p2, MG, y2, 12.5, true, gp[0]); y2 -= 8; y2 = list(p2, it, y2, 2) - 18;
    });
    y2 = Math.max(MG + 26, y2); p2.ops.push(acc + " rg " + MG + " " + (y2 - 7.4).toFixed(2) + " 4.2 4.2 re f"); T(p2, MG + 9, y2 - 8, 9, false, "changed from the home as first shown", soft); y2 -= 20;
    wrap("Pictures are computer renderings made from the plan set. Finishes are examples for planning; the plan set and the builder's contract govern.", 8.5, false, CW).forEach(function (l, i) { T(p2, MG, y2 - 8 - i * 11, 8.5, false, l, soft); });
    /* write the file */
    var kids = [], pagesId = objs.length + pages.length * 2 + pages.reduce(function (a, p) { return a + p.links.length; }, 0);      /* the id the page tree will get (added after the pages) */
    pages.forEach(function (p, i) {
      rule(p, MG - 8); T(p, MG, MG - 22, 8, false, "The St. James  \xb7  Lot 9, 0.74 acre", soft); var pn = "Page " + (i + 1) + " of " + pages.length; T(p, PW - MG - tw(pn, 8, false), MG - 22, 8, false, pn, soft);
      var body = p.ops.join("\n"), cid = add("<< /Length " + body.length + " >>", body), an = p.links.map(function (l) { return add("<< /Type /Annot /Subtype /Link /Rect [" + l.slice(0, 4).map(function (n) { return n.toFixed(1); }).join(" ") + "] /Border [0 0 0] /A << /S /URI /URI (" + clean(l[4]).replace(/([\\()])/g, "\\$1") + ") >> >>"); });
      var xo = Object.keys(p.im).map(function (k) { return "/" + k + " " + p.im[k] + " 0 R"; }).join(" ");
      kids.push(add("<< /Type /Page /Parent " + pagesId + " 0 R /MediaBox [0 0 " + PW + " " + PH + "] /Contents " + cid + " 0 R /Resources << /Font << /F1 " + fR + " 0 R /F2 " + fB + " 0 R >> /XObject << " + xo + " >> >>" + (an.length ? " /Annots [" + an.map(function (a) { return a + " 0 R"; }).join(" ") + "]" : "") + " >>"));
    });
    var pid = add("<< /Type /Pages /Count " + kids.length + " /Kids [" + kids.map(function (k) { return k + " 0 R"; }).join(" ") + "] >>"); if (pid !== pagesId) throw new Error("page tree id");
    var cat = add("<< /Type /Catalog /Pages " + pid + " 0 R >>"), info = add("<< /Title (The St. James: my design) /Creator (The St. James design studio) >>");
    var chunks = [], off = 0, xref = [];
    function put(x) { var u; if (typeof x === "string") { u = new Uint8Array(x.length); for (var i = 0; i < x.length; i++) u[i] = x.charCodeAt(i) & 255; } else u = x; chunks.push(u); off += u.length; }
    put("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
    for (var i = 1; i < objs.length; i++) { xref[i] = off; put(i + " 0 obj\n" + objs[i].body + "\n"); if (objs[i].stream) { put("stream\n"); put(objs[i].stream); put("\nendstream\n"); } put("endobj\n"); }
    var xo2 = off, xr = "xref\n0 " + objs.length + "\n0000000000 65535 f \n"; for (i = 1; i < objs.length; i++) xr += ("0000000000" + xref[i]).slice(-10) + " 00000 n \n";
    put(xr + "trailer\n<< /Size " + objs.length + " /Root " + cat + " 0 R /Info " + info + " 0 R >>\nstartxref\n" + xo2 + "\n%%EOF\n");
    return new Blob(chunks, { type: "application/pdf" });
  }
  async function makePDF() {
    var b = $("bPdf"), label = b.textContent, shots = [], oc = document.createElement("canvas"), ox = oc.getContext("2d"); if (b.disabled) return; b.disabled = true;
    try {
      for (var i = 0; i < S.views.length; i++) {
        var v = S.views[i]; b.textContent = "Building your PDF: " + (i + 1) + " of " + S.views.length;
        var m = await manOf(v.id), st = eff(v.scope), r = await compose(v.id, m, st, function () { return true; });
        oc.width = m.w; oc.height = m.h; ox.putImageData(new ImageData(r.out, m.w, m.h), 0, 0);
        var jb = await new Promise(function (res) { oc.toBlob(res, "image/jpeg", 0.86); });
        shots.push({ v: v, w: m.w, h: m.h, st: st, data: new Uint8Array(await jb.arrayBuffer()) });
        if (v.id !== view) { cache = {}; lru = []; }       /* one room's parts in memory at a time */
      }
      var blob = buildPDF(shots, location.href); window.SJPDF = blob; var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "the-st-james-my-design.pdf"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
      b.textContent = "PDF saved"; setTimeout(function () { b.textContent = label; }, 2500);
    } catch (e) { console.error(e); b.textContent = "The PDF could not be made: try again"; setTimeout(function () { b.textContent = label; }, 4000); }
    b.disabled = false;
  }
  $("bPdf").onclick = makePDF;
  (function () { var n = 1, c = 0; S.opts.forEach(function (o) { n *= o.ch.length; c += o.ch.length; }); var t = n >= 1e15 ? Math.floor(n / 1e15) + " quadrillion" : n >= 1e12 ? (n / 1e12).toFixed(1) + " trillion" : n >= 1e9 ? (n / 1e9).toFixed(1) + " billion" : n >= 1e6 ? Math.round(n / 1e6) + " million" : String(n);
    $("combos").textContent = S.opts.length + " choices to make, " + c + " finishes and shapes to choose from: more than " + t + " combinations before the bathrooms are counted one by one, each shown as a picture built from real renders."; })();
  $("bReset").onclick = function () { Object.keys(state).forEach(function (k) { if (k.indexOf(":") > 0) delete state[k]; else state[k] = D[k]; }); panel(); summary(); render(); };
  $("bSave").onclick = function () { cv.toBlob(function (bl) { var a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = "st-james-" + view + ".jpg"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }, "image/jpeg", 0.92); };
  $("bLink").onclick = function () { var t = location.href; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { $("bLink").textContent = "Link copied"; }, function () { prompt("Copy this link", t); }); };
  summary();
  if (qv) setView(qv); else
  if (S.views.length) { var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); setView(S.views[0].id); } }, { rootMargin: "600px" }); io.observe($("studio")); }
  else $("studio").style.display = "none";
})();
