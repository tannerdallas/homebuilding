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
  $("sub").textContent = S.sub;
  var hero = $("hero"); hero.querySelector("img.a").src = S.hero.day; var nb = hero.querySelector("img.b");
  Array.prototype.forEach.call(hero.querySelectorAll(".tog button"), function (b) {
    b.onclick = function () { if (!nb.src) nb.src = S.hero.night; hero.classList.toggle("night", b.dataset.m === "night"); Array.prototype.forEach.call(hero.querySelectorAll(".tog button"), function (x) { x.classList.toggle("on", x === b); }); };
  });
  S.stats.forEach(function (s) { $("stats").appendChild(el("div", "", "<b>" + s[0] + "</b><span>" + s[1] + "</span>")); });
  var lb = $("lb"), lbi = 0;
  function show(i) { lbi = (i + S.gallery.length) % S.gallery.length; lb.querySelector("img").src = S.gallery[lbi].full; lb.querySelector("p").textContent = S.gallery[lbi].cap; lb.classList.add("on"); }
  S.gallery.forEach(function (g, i) { var f = el("figure", "", '<img loading="lazy" alt="' + g.cap + '" src="' + g.src + '"><figcaption>' + g.cap + "</figcaption>"); f.onclick = function () { show(i); }; $("grid").appendChild(f); });
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
  if (S.tour) { var go = el("div", "go", "<b>Walk through the house</b><span>Start the 3D walk-through</span>"); go.style.backgroundImage = "url(" + S.tour.poster + ")"; go.onclick = function () { tb.innerHTML = '<iframe allowfullscreen src="' + S.tour.src + '"></iframe>'; }; tb.appendChild(go); }
  else tb.parentNode.parentNode.style.display = "none";

  /* ---------- design studio ---------- */
  var cv = $("cv"), ctx = cv.getContext("2d", { willReadFrequently: true });
  var D = S.defaults, state = {}, view = null, man = null, seq = 0, cache = {}, tab = "ext", last = null, baseImg = null;
  Object.keys(D).forEach(function (k) { state[k] = D[k]; });
  var qv = (location.search.match(/[?&]v=([\w-]+)/) || [])[1];      /* ?v=<id> opens one view directly (used to check new layer sets; there, any known choice key is taken from the link) */
  (location.hash.match(/d=([^&]+)/) || ["", ""])[1].split(",").forEach(function (kv) { var p = kv.split("."); if (p.length === 2 && D[p[0]] != null && (qv || S.opts.some(function (o) { return o.key === p[0] && o.ch.some(function (c) { return c.id === p[1]; }); }))) state[p[0]] = p[1]; });
  function busy(on) { $("busy").classList.toggle("on", !!on); }
  function vurl(f) { return "v/" + view + "/" + f; }
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
  async function render() {
    if (!man) return; var my = ++seq, m = man, W = m.w, H = m.h, G = m.groups; busy(true);
    var REG = m.regs || ["sc", "pst", "dr", "fp", "sr"].filter(function (k) { return G[k]; }), REGKEYS = {}; REG.forEach(function (k) { G[k].keys.forEach(function (q) { REGKEYS[q] = 1; }); });
    try {
      var base = await pix(vurl(m.base), W, H); if (my !== seq) return;
      var out = new Uint8ClampedArray(base), patches = [], g, d, i, x, y;
      /* 1. choices that change shapes: the picture inside their rectangle, feathered into the base */
      for (var r = 0; r < REG.length; r++) {
        g = REG[r]; d = G[g]; if (!d || d.kind !== "region") continue;
        var ck = key(d.keys, state); if (ck === key(d.keys, D)) continue;
        var L = d.layers[ck + (d.deps.length ? "@" + key(d.deps, state) : "")]; if (!L) continue;
        var b = d.box, bw = b[2] - b[0], bh = b[3] - b[1], p = await pix(vurl(L.img), bw, bh); if (my !== seq) return;
        var F = 10;
        for (y = 0; y < bh; y++) {
          var fy = Math.min(b[1] > 0 ? (y + 1) / F : 1, b[3] < H ? (bh - y) / F : 1, 1);
          for (x = 0; x < bw; x++) {
            var f = Math.min(fy, b[0] > 0 ? (x + 1) / F : 1, b[2] < W ? (bw - x) / F : 1), o = ((y + b[1]) * W + x + b[0]) * 4, q = (y * bw + x) * 4;
            if (f >= 1) { out[o] = p[q]; out[o + 1] = p[q + 1]; out[o + 2] = p[q + 2]; } else { out[o] += (p[q] - out[o]) * f; out[o + 1] += (p[q + 1] - out[o + 1]) * f; out[o + 2] += (p[q + 2] - out[o + 2]) * f; }
          }
        }
        patches.push({ box: b, masks: L.masks });
      }
      /* 2. the mask of a group for the shapes now chosen */
      var mc = {};
      var mask = async function (gg) {
        if (mc[gg] !== undefined) return mc[gg]; var e = m.masks[gg]; if (!e) return (mc[gg] = null);
        var a = (await chans(vurl(e[0]), W, H))[e[1]], cp = false;
        for (var k = 0; k < patches.length; k++) {
          var pm = patches[k].masks[gg]; if (!pm) continue; var bb = patches[k].box, w2 = bb[2] - bb[0], h2 = bb[3] - bb[1], c = (await chans(vurl(pm[0]), w2, h2))[pm[1]];
          if (!cp) { a = a.slice(); cp = true; }
          for (var yy = 0; yy < h2; yy++) a.set(c.subarray(yy * w2, yy * w2 + w2), (yy + bb[1]) * W + bb[0]);
        }
        return (mc[gg] = a);
      };
      /* 3. parts in another finish: add (new - as first shown) wherever the part shows. Where the layers hold nothing for a pixel the part now covers
            (another arrangement of the house shows more of it), a transfer learned from the layers recolours what is there. */
      var curve = function (C, o3, tm) {
        var NB = C.length, R = out[o3] / 255, Gc = out[o3 + 1] / 255, Bc = out[o3 + 2] / 255, tt = (0.3 * R + 0.59 * Gc + 0.11 * Bc) * NB - 0.5, i0 = Math.max(0, Math.min(NB - 1, Math.floor(tt))), i1 = Math.min(NB - 1, i0 + 1), ff = Math.max(0, Math.min(1, tt - i0)), a0 = C[i0], a1 = C[i1];
        for (var c2 = 0; c2 < 3; c2++) { var k0 = c2 * 4, v = (a0[k0] * R + a0[k0 + 1] * Gc + a0[k0 + 2] * Bc + a0[k0 + 3]) * (1 - ff) + (a1[k0] * R + a1[k0 + 1] * Gc + a1[k0 + 2] * Bc + a1[k0 + 3]) * ff; out[o3 + c2] += (v * 255 - out[o3 + c2]) * tm; }
      };
      for (g in G) {
        d = G[g]; if (d.kind !== "replace") continue;
        var rs = {}; Object.keys(D).forEach(function (k) { rs[k] = D[k]; }); d.deps.forEach(function (k) { if (REGKEYS[k]) rs[k] = state[k]; });
        var ref = key(d.keys, D) + (d.deps.length ? "@" + key(d.deps, rs) : ""), tgt = key(d.keys, state) + (d.deps.length ? "@" + key(d.deps, state) : "");
        if (key(d.keys, state) === key(d.keys, D) && ref === tgt) continue;
        var M = await mask(g); if (my !== seq) return; if (!M) continue;
        var Cv = d.curves && d.curves[key(d.keys, state)], done = Cv ? new Uint8Array(W * H) : null;
        if (ref !== tgt && d.layers[ref] && d.layers[tgt]) {
          var bx = d.box, w3 = bx[2] - bx[0], h3 = bx[3] - bx[1], A = await pix(vurl(d.layers[ref]), w3, h3), T = await pix(vurl(d.layers[tgt]), w3, h3);
          var vf = d.valid && d.valid[ref.indexOf("@") >= 0 ? ref.split("@")[1] : ""], V = vf ? (await chans(vurl(vf), w3, h3))[0] : null; if (my !== seq) return;
          for (y = 0; y < h3; y++) for (x = 0; x < w3; x++) {
            var pi = (y + bx[1]) * W + x + bx[0], mi = M[pi]; if (!mi) continue; var o2 = pi * 4, q2 = (y * w3 + x) * 4;
            if (V && V[y * w3 + x] < 128) continue;        /* the layers hold nothing here */
            if (done) done[pi] = 1;
            var dr = T[q2] - A[q2], dg = T[q2 + 1] - A[q2 + 1], db = T[q2 + 2] - A[q2 + 2];
            if (mi > 249) {                                /* fully this part: where the finish really differs, the new layer itself; where it does not (glass in a window whose frame changed), the picture stays as it is */
              var dm = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)), w = dm <= 4 ? 0 : dm >= 14 ? 1 : (dm - 4) / 10; w = w * w * (3 - 2 * w);
              out[o2] += dr + (T[q2] - out[o2] - dr) * w; out[o2 + 1] += dg + (T[q2 + 1] - out[o2 + 1] - dg) * w; out[o2 + 2] += db + (T[q2 + 2] - out[o2 + 2] - db) * w;
            } else { var t = mi / 255; out[o2] += dr * t; out[o2 + 1] += dg * t; out[o2 + 2] += db * t; }
          }
        }
        if (Cv) for (i = 0; i < W * H; i++) { if (M[i] && !done[i]) curve(Cv, i * 4, M[i] / 255); }
      }
      /* 4. paint colours: the transfer learned from real renders of that colour, band by band of brightness */
      for (g in G) {
        d = G[g]; if (d.kind !== "paint") continue; var C = d.curves[key(d.keys, state)]; if (!C) continue; var Mp = await mask(g); if (my !== seq) return; if (!Mp) continue;
        for (i = 0; i < W * H; i++) { if (Mp[i]) curve(C, i * 4, Mp[i] / 255); }
      }
      /* 5. parts the home as first shown does not have (shutters): their picture goes over whatever is there, by how much of each pixel they cover */
      for (g in G) {
        d = G[g]; if (d.kind !== "addon") continue; var La = d.layers[key(d.keys, state) + (d.deps && d.deps.length ? "@" + key(d.deps, state) : "")]; if (!La) continue;
        var ba = d.box, wa = ba[2] - ba[0], ha = ba[3] - ba[1], Ta = await pix(vurl(La.img), wa, ha), Ma = (await chans(vurl(La.mask), wa, ha))[0]; if (my !== seq) return;
        for (y = 0; y < ha; y++) for (x = 0; x < wa; x++) {
          var ma = Ma[y * wa + x]; if (!ma) continue; var oa = ((y + ba[1]) * W + x + ba[0]) * 4, qa = (y * wa + x) * 4, ta = ma / 255;
          out[oa] += (Ta[qa] - out[oa]) * ta; out[oa + 1] += (Ta[qa + 1] - out[oa + 1]) * ta; out[oa + 2] += (Ta[qa + 2] - out[oa + 2]) * ta;
        }
      }
      if (my !== seq) return; last = new ImageData(out, W, H); baseImg = new ImageData(new Uint8ClampedArray(base), W, H); ctx.putImageData(last, 0, 0);
    } catch (e) { console.error(e); }
    if (my === seq) busy(false);
  }
  async function setView(id) {
    view = id; Array.prototype.forEach.call($("views").children, function (b) { b.classList.toggle("on", b.dataset.v === id); if (b.dataset.v === id) { var vs = $("views"); vs.scrollLeft = Math.max(0, b.offsetLeft - (vs.clientWidth - b.offsetWidth) / 2); } }); busy(true);
    var vw = S.views.filter(function (v) { return v.id === id; })[0]; if (vw && vw.kind !== tab) { tab = vw.kind; }
    var im = await img(vurl("base-s.jpg")).catch(function () { return null; }); if (view !== id) return;
    man = await (await fetch(vurl("m.json"))).json(); if (view !== id) return;
    cv.width = man.w; cv.height = man.h; if (im) ctx.drawImage(im, 0, 0, man.w, man.h);
    panel(); render();
  }
  function uses(k) { if (!man) return true; for (var g in man.groups) if (man.groups[g].keys.indexOf(k) >= 0 || (man.groups[g].deps || []).indexOf(k) >= 0) return true; return false; }
  function shownIn(k) { return S.views.filter(function (v) { return (v.keys || []).indexOf(k) >= 0; }); }      /* the views whose picture a choice changes */
  function panel() {
    var T = $("tabs"); T.innerHTML = "";[["ext", "Outside"], ["int", "Inside"]].forEach(function (t) { var b = el("button", t[0] === tab ? "on" : "", t[1]); b.onclick = function () { tab = t[0]; panel(); }; T.appendChild(b); });
    var O = $("opts"); O.innerHTML = "";
    var lk = el("div", "opt looks", "<h4>Start from a look</h4>"), lr = el("div", "chips");      /* a whole scheme in one tap; every choice can still be changed afterwards */
    (S.looks || []).filter(function (l) { return l.cat === tab; }).forEach(function (l) {
      var same = S.opts.filter(function (o) { return o.cat === tab; }).every(function (o) { return state[o.key] === (l.set[o.key] || D[o.key]); }), b = el("button", same ? "on" : "", l.name);
      b.onclick = function () { S.opts.forEach(function (o) { if (o.cat === tab) state[o.key] = l.set[o.key] || D[o.key]; }); panel(); summary(); render(); }; lr.appendChild(b);
    });
    lk.appendChild(lr); O.appendChild(lk);
    S.opts.filter(function (o) { return o.cat === tab; }).sort(function (a, b) { return (uses(b.key) ? 1 : 0) - (uses(a.key) ? 1 : 0); }).forEach(function (o) {      /* what this view shows comes first */
      var cur = o.ch.filter(function (c) { return c.id === state[o.key]; })[0] || o.ch[0], box = el("div", "opt" + (uses(o.key) ? "" : " off"), "<h4>" + o.name + "<em>" + cur.name + "</em></h4>"), row = el("div", o.ch[0].css ? "sw" : "chips");
      o.ch.forEach(function (c) {
        var b = el("button", c.id === state[o.key] ? "on" : "", c.css ? "" : c.name); b.title = c.name; b.setAttribute("aria-label", o.name + ": " + c.name); if (c.css) b.style.background = c.css;
        b.onclick = function () { state[o.key] = c.id; summary(); var w = shownIn(o.key); if (!uses(o.key) && w.length && c.id !== D[o.key]) { setView(w[0].id); return; } panel(); render(); }; row.appendChild(b);      /* a choice this view cannot show opens a view that can */
      });
      box.appendChild(row);
      if (!uses(o.key)) { var w = shownIn(o.key); if (w.length) box.appendChild(el("p", "where", "Shown in: " + w.map(function (v) { return "<b>" + v.name + "</b>"; }).join(", "))); }
      O.appendChild(box);
    });
  }
  function summary() {
    $("sum").innerHTML = S.opts.map(function (o) { var c = o.ch.filter(function (c) { return c.id === state[o.key]; })[0] || o.ch[0]; return "<li><b>" + o.name + ":</b> " + c.name + "</li>"; }).join("");
    var h = Object.keys(state).filter(function (k) { return state[k] !== D[k]; }).map(function (k) { return k + "." + state[k]; }).join(","); history.replaceState(null, "", location.pathname + location.search + (h ? "#d=" + h : ""));
  }
  S.views.forEach(function (v) { var b = el("button", "", '<img loading="lazy" alt="" src="v/' + v.id + '/base-s.jpg"><span>' + v.name + "</span>"); b.dataset.v = v.id; b.onclick = function () { setView(v.id); }; $("views").appendChild(b); });
  /* hold to see the home as the plans draw it, release to come back to your choices */
  (function () { var b = $("bCmp"), down = function (e) { e.preventDefault(); if (baseImg) ctx.putImageData(baseImg, 0, 0); b.classList.add("on"); }, up = function () { if (b.classList.contains("on") && last) ctx.putImageData(last, 0, 0); b.classList.remove("on"); };
    b.addEventListener("pointerdown", down); ["pointerup", "pointerleave", "pointercancel"].forEach(function (n) { b.addEventListener(n, up); }); })();
  $("bPrint").onclick = function () {
    $("pimg").src = cv.toDataURL("image/jpeg", 0.92); $("pdate").textContent = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) + " \u00b7 " + location.href;
    $("plist").innerHTML = S.opts.map(function (o) { var c = o.ch.filter(function (c) { return c.id === state[o.key]; })[0] || o.ch[0]; return "<li><b>" + o.name + ":</b> " + c.name + (state[o.key] === D[o.key] ? "" : " *") + "</li>"; }).join("") + "<li>* changed from the home as first shown</li>";
    setTimeout(function () { window.print(); }, 250);
  };
  (function () { var n = 1, c = 0; S.opts.forEach(function (o) { n *= o.ch.length; c += o.ch.length; }); var t = n >= 1e15 ? Math.floor(n / 1e15) + " quadrillion" : n >= 1e12 ? (n / 1e12).toFixed(1) + " trillion" : n >= 1e9 ? (n / 1e9).toFixed(1) + " billion" : n >= 1e6 ? Math.round(n / 1e6) + " million" : String(n);
    $("combos").textContent = S.opts.length + " choices to make, " + c + " finishes and shapes to choose from: more than " + t + " combinations, each one shown as a picture built from real renders."; })();
  $("bReset").onclick = function () { Object.keys(D).forEach(function (k) { state[k] = D[k]; }); panel(); summary(); render(); };
  $("bSave").onclick = function () { cv.toBlob(function (bl) { var a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = "st-james-" + view + ".jpg"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }, "image/jpeg", 0.92); };
  $("bLink").onclick = function () { var t = location.href; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { $("bLink").textContent = "Link copied"; }, function () { prompt("Copy this link", t); }); };
  summary();
  if (qv) setView(qv); else
  if (S.views.length) { var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); setView(S.views[0].id); } }, { rootMargin: "600px" }); io.observe($("studio")); }
  else $("studio").style.display = "none";
})();
