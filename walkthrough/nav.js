/* Walkable map of each floor: decodes the exported grids and plans routes through doorways and up the stairs. No DOM or 3D code here.
   Some areas, stairs and room outlines depend on the options chosen (lookout add-on, garage entry, basement finish): setState picks the set that applies. */
(function (root) {
  'use strict';
  function bytes(b64) {
    var s = (typeof atob === 'function') ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    var u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }
  function Nav(d) {
    this.c = d.c; this.x0 = d.x0; this.y0 = d.y0; this.nx = d.nx; this.ny = d.ny; this.eye = d.eye;
    this.links = d.links; this.zones = d.zones;
    var n = d.nx * d.ny;
    function unpack(g) {
      var bits = bytes(g), free = new Uint8Array(n);
      for (var k = 0; k < n; k++) free[k] = (bits[k >> 3] >> (k & 7)) & 1;
      return free;
    }
    this._unpack = unpack;
    this.floors = d.areas.map(function (f) {
      var base = { free: unpack(f.grid), spots: f.spots, rooms: f.rooms };
      return { key: f.key, name: f.name, z: f.z, seed: f.seed, when: f.when || '', on: true, base: base, free: base.free, spots: base.spots, rooms: base.rooms,
        alt: (f.alt || []).map(function (a) { return { when: a[0], grid: a[1], free: null, spots: a[2] || f.spots, rooms: a[3] || f.rooms }; }) };
    });
    this.allLinks = d.links;
    this._g = new Float32Array(n); this._from = new Int32Array(n); this._state = new Uint8Array(n);
  }
  /* Does a condition such as "g=s&st=farm|col" hold for the chosen options? An empty condition always holds. */
  function holds(cond, st) {
    if (!cond) return true;
    var terms = cond.split('&');
    for (var i = 0; i < terms.length; i++) {
      var kv = terms[i].split('=');
      if (kv[1].split('|').indexOf(String(st[kv[0]])) < 0) return false;
    }
    return true;
  }
  var P = Nav.prototype;
  P.setState = function (st) {
    var F = this.floors, un = this._unpack;
    F.forEach(function (f) {
      var v = f.base;
      for (var i = 0; i < f.alt.length; i++) if (holds(f.alt[i].when, st)) { v = f.alt[i]; if (!v.free) v.free = un(v.grid); break; }
      f.on = holds(f.when, st); f.free = v.free; f.spots = v.spots; f.rooms = v.rooms;
    });
    this.links = this.allLinks.filter(function (L) { return holds(L.when || '', st) && F[L.a].on && F[L.b].on; });
  };
  P.cell = function (x, y) {
    var i = Math.floor((x - this.x0) / this.c), j = Math.floor((y - this.y0) / this.c);
    return (i < 0 || j < 0 || i >= this.nx || j >= this.ny) ? -1 : j * this.nx + i;
  };
  P.center = function (k) {
    return [this.x0 + ((k % this.nx) + 0.5) * this.c, this.y0 + (Math.floor(k / this.nx) + 0.5) * this.c];
  };
  P.isFree = function (f, x, y) {
    var k = this.cell(x, y);
    return k >= 0 && this.floors[f].free[k] === 1;
  };
  /* Closest walkable cell to a point, searching outward up to maxR cells. Returns the cell index or -1. */
  P.nearestCell = function (f, x, y, maxR) {
    var free = this.floors[f].free, nx = this.nx, ny = this.ny, c = this.c;
    var i0 = Math.floor((x - this.x0) / c), j0 = Math.floor((y - this.y0) / c), best = -1, bd = Infinity;
    for (var r = 0; r <= maxR; r++) {
      if (best >= 0 && (r - 0.5) * c > Math.sqrt(bd)) break;     // no cell this far out can be closer than the best so far
      for (var j = j0 - r; j <= j0 + r; j++) {
        if (j < 0 || j >= ny) continue;
        var edge = (j === j0 - r || j === j0 + r);
        for (var i = i0 - r; i <= i0 + r; i += (edge ? 1 : 2 * r || 1)) {
          if (i < 0 || i >= nx || !free[j * nx + i]) continue;
          var dx = this.x0 + (i + 0.5) * c - x, dy = this.y0 + (j + 0.5) * c - y, dd = dx * dx + dy * dy;
          if (dd < bd) { bd = dd; best = j * nx + i; }
        }
      }
    }
    return best;
  };
  P.nearest = function (f, x, y, maxR) {
    var k = this.nearestCell(f, x, y, maxR);
    return k < 0 ? null : this.center(k);
  };
  /* True when the straight line between two points stays on walkable cells (exact: every cell the line touches is checked). */
  P.los = function (f, ax, ay, bx, by) {
    var free = this.floors[f].free, nx = this.nx, ny = this.ny, c = this.c;
    var x = (ax - this.x0) / c, y = (ay - this.y0) / c, dx = (bx - ax) / c, dy = (by - ay) / c;
    var i = Math.floor(x), j = Math.floor(y), si = dx > 0 ? 1 : -1, sj = dy > 0 ? 1 : -1;
    var tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    var tx = dx !== 0 ? (dx > 0 ? i + 1 - x : x - i) * tdx : Infinity, ty = dy !== 0 ? (dy > 0 ? j + 1 - y : y - j) * tdy : Infinity;
    function ok(a, b) { return a >= 0 && b >= 0 && a < nx && b < ny && free[b * nx + a] === 1; }
    for (var guard = 0; guard < 2048; guard++) {
      if (!ok(i, j)) return false;
      if (tx > 1 && ty > 1) return true;                         // the line ends inside this cell
      if (Math.abs(tx - ty) < 1e-9) {                            // through a corner: the two cells beside it must be clear as well
        if (!ok(i + si, j) || !ok(i, j + sj)) return false;
        i += si; j += sj; tx += tdx; ty += tdy;
      } else if (tx < ty) { i += si; tx += tdx; } else { j += sj; ty += tdy; }
    }
    return false;
  };
  /* Farthest walkable point on the straight line from a toward b, or null when the first step is blocked. */
  P.march = function (f, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, L = Math.sqrt(dx * dx + dy * dy), n = Math.floor(L / 0.25), out = null;
    for (var k = 1; k <= n; k++) {
      var x = ax + dx * k / n, y = ay + dy * k / n;
      if (!this.isFree(f, x, y)) break;
      out = [x, y];
    }
    return out;
  };
  /* Shortest walkable path on one floor as a short list of [x, y] corner points, or null. */
  P.path = function (f, ax, ay, bx, by) {
    var free = this.floors[f].free, nx = this.nx, ny = this.ny, n = nx * ny;
    var s = this.cell(ax, ay), g = this.cell(bx, by);
    if (s < 0 || !free[s]) s = this.nearestCell(f, ax, ay, 8);
    if (g < 0 || !free[g]) g = this.nearestCell(f, bx, by, 8);
    if (s < 0 || g < 0) return null;
    if (s === g) return [[ax, ay], this.isFree(f, bx, by) ? [bx, by] : this.center(g)];
    var G = this._g, from = this._from, st = this._state, heap = [], hf = [];
    for (var q = 0; q < n; q++) { st[q] = 0; G[q] = Infinity; }
    var gi = g % nx, gj = Math.floor(g / nx), R2 = Math.SQRT2;
    function h(k) { var a = Math.abs((k % nx) - gi), b = Math.abs(Math.floor(k / nx) - gj); return (a > b ? a + (R2 - 1) * b : b + (R2 - 1) * a); }
    function push(k, fv) {
      var i = heap.length; heap.push(k); hf.push(fv);
      while (i > 0) { var p = (i - 1) >> 1; if (hf[p] <= fv) break; heap[i] = heap[p]; hf[i] = hf[p]; i = p; }
      heap[i] = k; hf[i] = fv;
    }
    function pop() {
      var top = heap[0], k = heap.pop(), fv = hf.pop(), m = heap.length, i = 0;
      if (m) {
        for (;;) {
          var l = 2 * i + 1, r = l + 1, c = l;
          if (l >= m) break;
          if (r < m && hf[r] < hf[l]) c = r;
          if (hf[c] >= fv) break;
          heap[i] = heap[c]; hf[i] = hf[c]; i = c;
        }
        heap[i] = k; hf[i] = fv;
      }
      return top;
    }
    G[s] = 0; from[s] = -1; push(s, h(s));
    var found = false;
    while (heap.length) {
      var k = pop();
      if (st[k] === 2) continue;
      st[k] = 2;
      if (k === g) { found = true; break; }
      var i = k % nx, j = Math.floor(k / nx);
      for (var dj = -1; dj <= 1; dj++) {
        for (var di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          var a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
          var m = b * nx + a;
          if (!free[m] || st[m] === 2) continue;
          if (di && dj && (!free[j * nx + a] || !free[b * nx + i])) continue;     // no cutting corners
          var ng = G[k] + (di && dj ? R2 : 1);
          if (ng < G[m]) { G[m] = ng; from[m] = k; push(m, ng + h(m)); }
        }
      }
    }
    if (!found) return null;
    var cells = [];
    for (var c2 = g; c2 >= 0; c2 = from[c2]) cells.push(c2);
    cells.reverse();
    var pts = [[ax, ay]];
    for (var t = 1; t < cells.length - 1; t++) pts.push(this.center(cells[t]));
    pts.push(this.isFree(f, bx, by) && this.cell(bx, by) === g ? [bx, by] : this.center(g));
    var out = [pts[0]], at = 0;                                                    // pull the path straight where the way is clear
    while (at < pts.length - 1) {
      var far = at + 1;
      for (var e = pts.length - 1; e > at + 1; e--) {
        if (this.los(f, pts[at][0], pts[at][1], pts[e][0], pts[e][1])) { far = e; break; }
      }
      out.push(pts[far]); at = far;
    }
    return out;
  };
  /* The stairs to take, in order, to get from one area to another: [{ link, fwd }], or null. */
  P.chain = function (a, b) {
    if (a === b) return [];
    var prev = {}, q = [a], seen = {}; seen[a] = true;
    while (q.length) {
      var u = q.shift();
      for (var i = 0; i < this.links.length; i++) {
        var L = this.links[i], v = L.a === u ? L.b : (L.b === u ? L.a : -1);
        if (v < 0 || seen[v]) continue;
        seen[v] = true; prev[v] = { from: u, link: L, fwd: L.a === u }; q.push(v);
      }
    }
    if (!seen[b]) return null;
    var out = [];
    for (var c = b; c !== a; c = prev[c].from) out.unshift({ link: prev[c].link, fwd: prev[c].fwd });
    return out;
  };
  /* Route between two places that may be in different areas. Points carry z (standing height), f (area) and r (true while on a stair). */
  P.route = function (from, to) {
    var self = this, pts = [], cur = { f: from.f, x: from.x, y: from.y }, seq = this.chain(from.f, to.f);
    if (!seq) return null;
    function flat(f, ax, ay, bx, by) {
      var p = self.path(f, ax, ay, bx, by);
      if (!p) return false;
      for (var i = 0; i < p.length; i++) pts.push({ x: p[i][0], y: p[i][1], z: self.floors[f].z, f: f, r: false, k: 1 });
      return true;
    }
    for (var s = 0; s < seq.length; s++) {
      var L = seq[s].link, fwd = seq[s].fwd, a = fwd ? L.pa : L.pb, b = fwd ? L.pb : L.pa, nf = fwd ? L.b : L.a;
      var P2 = fwd ? L.pts : L.pts.slice().reverse(), n = P2.length, slow = n > 4 ? 0.5 : 1;       // a spiral is walked at half pace
      if (!flat(cur.f, cur.x, cur.y, a[0], a[1])) return null;
      for (var i = 0; i < n; i++) pts.push({ x: P2[i][0], y: P2[i][1], z: P2[i][2], f: i < n / 2 ? cur.f : nf, r: i < n - 1, k: slow });
      cur = { f: nf, x: b[0], y: b[1] };
    }
    if (!flat(cur.f, cur.x, cur.y, to.x, to.y)) return null;
    return pts;
  };
  /* Standing height at a point: the floor level, lowered in the garage and on the porch, deck and stoop. */
  P.floorZ = function (f, x, y) {
    if (f === 0) {
      for (var i = 0; i < this.zones.length; i++) {
        var z = this.zones[i];
        if (x >= z[0] && x <= z[2] && y >= z[1] && y <= z[3]) return z[4];
      }
    }
    return this.floors[f].z;
  };
  P.room = function (f, x, y) {
    var rooms = this.floors[f].rooms;
    for (var i = 0; i < rooms.length; i++) {
      var r = rooms[i];
      if (x >= r[1] && x <= r[3] && y >= r[2] && y <= r[4]) return r[0];
    }
    return '';
  };
  root.NAV = { Nav: Nav, holds: holds };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NAV;
})(typeof window !== 'undefined' ? window : globalThis);
