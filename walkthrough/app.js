/* Farmhouse 3D viewer: loads the exported model parts, opens the house floor by floor, and lets the viewer walk through it room by room. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var stage = $('stage'), app = $('app'), labelsEl = $('labels'), hint = $('hint'), titleEl = $('title'), subEl = $('sub');
  var orbitUI = $('orbit-ui'), walkUI = $('walk-ui'), chipsEl = $('chips'), mapEl = $('map');
  var MODELS = window.MODELS || {};
  function fail(msg) {
    $('fallback').hidden = false;
    $('fallback-msg').textContent = msg;
  }
  if (!window.THREE || !THREE.OrbitControls) { fail('The 3D library did not load. Check your connection, then reopen this page.'); return; }
  if (!MODELS.big || !MODELS.small || !window.NAV) { fail('The model data did not load. Reopen this page to try again.'); return; }

  var renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { fail('This browser could not start 3D graphics. Try opening the page in Chrome or Safari.'); return; }
  var SKY = 0xdfe7ee;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);
  var el = renderer.domElement;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 600, 1900);
  var camera = new THREE.PerspectiveCamera(36, 1, 1, 5000);
  var controls = new THREE.OrbitControls(camera, el);
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.minDistance = 9;
  controls.maxDistance = 560;

  var hemi = new THREE.HemisphereLight(0xe6eef7, 0x8b8f7c, 0.72);
  scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xfff3df, 1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.08;
  var sc = sun.shadow.camera; sc.left = -85; sc.right = 85; sc.top = 85; sc.bottom = -85; sc.near = 1; sc.far = 420;
  scene.add(sun); scene.add(sun.target);
  /* Walkthrough-only lights, kept at zero in the model view: two soft fills so walls that meet at a corner read differently, and a lamp that travels with the viewer. */
  var fillA = new THREE.DirectionalLight(0xffffff, 0), fillB = new THREE.DirectionalLight(0xdde6f5, 0), fillC = new THREE.DirectionalLight(0xffffff, 0), lamp = new THREE.PointLight(0xfff2e2, 0, 48, 1.1);
  fillA.position.set(0.55, 0.5, 0.8); fillB.position.set(-0.8, 0.45, -0.5); fillC.position.set(0.1, -1, 0.15);          // fillC shines upward so ceilings stay light
  scene.add(fillA); scene.add(fillB); scene.add(fillC); scene.add(lamp);

  var ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshLambertMaterial({ color: 0x5f8548 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -2.02; ground.receiveShadow = true;
  scene.add(ground);
  var ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.8, 28),
    new THREE.MeshBasicMaterial({ color: 0x1b56b3, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, fog: false, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.renderOrder = 3;
  scene.add(ring);

  function decode(b64) {
    var s = atob(b64), n = s.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  }
  var GREEN = { shrub: 0x4a7a44, leaf: 0x4e8440 };
  function build(name) {
    var m = MODELS[name], buf = decode(m.bin), root = new THREE.Group(), layers = {}, solid = [], caps = [], wallColor = null;
    function layer(k) { if (!layers[k]) { layers[k] = new THREE.Group(); root.add(layers[k]); } return layers[k]; }
    m.parts.forEach(function (p) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, p.po, p.pn), 3));
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, p.io, p.inn), 1));
      var mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.color[0], p.color[1], p.color[2]), roughness: Math.max(p.rough, 0.25),
        metalness: Math.min(p.metal, 0.2), flatShading: true, side: THREE.DoubleSide });
      var glass = p.alpha < 1;
      if (glass) { mat.transparent = true; mat.opacity = 0.3; mat.depthWrite = false; }
      var mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = !glass; mesh.receiveShadow = !glass;
      if (glass) mesh.renderOrder = 2;
      layer(p.layer).add(mesh);
      if (!glass && p.layer !== 'SITE' && p.layer !== 'DOOR') solid.push(mesh);          // what a tap can land on in the walkthrough
      if (p.mat === 'cap') caps.push({ m: mat, c: mat.color.clone() });                   // dark wall tops for the cutaway views
      if (p.mat === 'wall' && !wallColor) wallColor = mat.color.clone();
    });
    var site = layer('SITE'), ico = new THREE.IcosahedronGeometry(1, 1), mats = {};
    (m.meta.blobs || []).forEach(function (b) {
      var key = b[4];
      if (!mats[key]) mats[key] = new THREE.MeshLambertMaterial({ color: GREEN[key] || 0x4a7a44, flatShading: true });
      var s = new THREE.Mesh(ico, mats[key]);
      s.position.set(b[0], b[2], -b[1]); s.scale.set(b[3], b[3] * b[5], b[3]); s.castShadow = true; s.receiveShadow = true;
      site.add(s);
    });
    var bark = new THREE.MeshLambertMaterial({ color: 0x5b4636 });
    (m.meta.trunks || []).forEach(function (t) {
      var c = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, t[2] * 0.55, 8), bark);
      c.position.set(t[0], m.meta.zg + t[2] * 0.27, -t[1]); c.castShadow = true; site.add(c);
    });
    var nav = new NAV.Nav(m.meta.nav), ext = [1e9, 1e9, -1e9, -1e9];
    nav.floors[0].rooms.forEach(function (r) {
      ext[0] = Math.min(ext[0], r[1]); ext[1] = Math.min(ext[1], r[2]); ext[2] = Math.max(ext[2], r[3]); ext[3] = Math.max(ext[3], r[4]);
    });
    ext[0] -= 1.5; ext[1] -= 1.5; ext[2] += 1.5; ext[3] += 1.5;
    return { root: root, layers: layers, meta: m.meta, nav: nav, solid: solid, ext: ext, caps: caps, wallColor: wallColor };
  }

  /* ---------------------------------------------------------------- model view */
  var HIDE = { exterior: [], lookout: ['TROOF'], upper: ['TROOF', 'L3', 'F3', 'ROOF'], main: ['TROOF', 'L3', 'F3', 'ROOF', 'L2', 'F2', 'SHED'] };
  var LABELKEY = { main: 'f1', upper: 'f2', lookout: 'f3' };
  var HINTS = { exterior: 'Drag to rotate, pinch to zoom, two fingers to move', lookout: 'Roof of the lookout removed', upper: 'Roof and lookout removed', main: 'Second floor removed' };
  var WALKHINT = 'Tap where you want to go. Drag to look around.';
  var PLAN = { big: '3,928 sq ft plan', small: '2,792 sq ft plan' };
  var built = {}, cur = null, curName = '', level = 'exterior', showLabels = true, tags = [], mode = 'orbit';
  var dirty = true, tween = null, booting = true;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function lift() { return cur ? (level === 'upper' ? cur.meta.zf2 : level === 'lookout' ? cur.meta.zf3 : 0) : 0; }
  function view(kind) {
    var W = cur.meta.W, D = cur.meta.D, z = lift(), t = cur.meta.tower;
    if (kind === 'front') return { p: [W + 34, 11, 98], t: [W / 2 + 0.5, 14, -10] };
    if (kind === 'back') return { p: [W + 54, 15, -124], t: [W / 2 + 2, 13, -24] };
    if (kind === 'above') return { p: [W / 2, 150 + z, -(D / 2 - 30)], t: [W / 2, z, -(D / 2 + 3)] };
    if (kind === 'look') return { p: [(t[0] + t[2]) / 2 + 26, z + 24, -(t[1] + t[3]) / 2 + 34], t: [(t[0] + t[2]) / 2, z + 2, -(t[1] + t[3]) / 2] };
    return { p: [W / 2 - 40, 66 + z, 62], t: [W / 2, z + 2, -D / 2 + 2] };            // dollhouse view
  }
  function go(kind, instant) {
    var v = view(kind), asp = camera.aspect || 1, k = kind === 'above' ? Math.min(Math.max(1.0 / asp, 1), 2.2) : Math.min(Math.max(1.5 / asp, 1), 3.2);
    var t = new THREE.Vector3(v.t[0], v.t[1], v.t[2]), p = new THREE.Vector3(v.p[0], v.p[1], v.p[2]).sub(t).multiplyScalar(k).add(t);
    if (instant || reduce) { tween = null; camera.position.copy(p); controls.target.copy(t); controls.update(); dirty = true; return; }
    tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p, t1: t, s: performance.now(), d: 750 };
  }
  function homeView() { return level === 'exterior' ? 'front' : level === 'lookout' ? 'look' : 'doll'; }
  function press(prefix, id) {
    Array.prototype.forEach.call(document.querySelectorAll('[id^="' + prefix + '"]'), function (b) { b.setAttribute('aria-pressed', b.id === prefix + id ? 'true' : 'false'); });
  }
  function setLabels() {
    labelsEl.textContent = ''; tags = [];
    var key = LABELKEY[level];
    if (!showLabels || !key || !cur) return;
    (cur.meta.labels[key] || []).forEach(function (l) {
      var d = document.createElement('div'); d.className = 'tag'; d.textContent = l.t;
      labelsEl.appendChild(d); tags.push({ el: d, v: new THREE.Vector3(l.x, l.z + 1.5, -l.y) });
    });
  }
  function setLevel(lv, move) {
    level = lv; press('l-', lv);
    var hide = HIDE[lv];
    Object.keys(cur.layers).forEach(function (k) { cur.layers[k].visible = hide.indexOf(k) < 0; });
    hint.textContent = HINTS[lv];
    setLabels();
    if (move) go(homeView());
    dirty = true;
  }
  function setHash() {
    if (booting) return;
    try {
      var h = (mode === 'walk' ? 'walk-' : 'plan-') + (curName === 'small' ? '2792' : '3928');
      if (location.hash !== '#' + h) location.hash = h;
    } catch (e) { /* the address is optional */ }
  }
  function setModel(name, first) {
    if (name === curName) return;
    if (cur) scene.remove(cur.root);
    if (!built[name]) built[name] = build(name);
    cur = built[name]; curName = name; scene.add(cur.root);
    press('m-', name);
    var W = cur.meta.W, D = cur.meta.D;
    sun.position.set(W / 2 + 80, 150, 70 - D / 2); sun.target.position.set(W / 2, 0, -D / 2); sun.target.updateMatrixWorld();
    if (mode === 'walk') enterWalk();
    else { setLevel(level, false); go(homeView(), first); }
    setHash();
  }

  function resize() {
    var w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    if (mode === 'walk') setFov(); else camera.updateProjectionMatrix();
    dirty = true;
  }
  var v3 = new THREE.Vector3();
  function placeTags() {
    var w = stage.clientWidth, h = stage.clientHeight;
    for (var i = 0; i < tags.length; i++) {
      v3.copy(tags[i].v).project(camera);
      var ok = v3.z < 1 && v3.x > -1.05 && v3.x < 1.05 && v3.y > -1.05 && v3.y < 1.05;
      tags[i].el.style.display = ok ? '' : 'none';
      if (ok) tags[i].el.style.transform = 'translate(-50%,-50%) translate(' + ((v3.x * 0.5 + 0.5) * w).toFixed(1) + 'px,' + ((-v3.y * 0.5 + 0.5) * h).toFixed(1) + 'px)';
    }
  }

  /* ---------------------------------------------------------------- walkthrough
     Positions are in plan feet: x across the front of the house, y from the front wall toward the back. The 3D scene uses (x, height, -y). */
  var FLOORS = ['Main floor', 'Upstairs', 'Lookout'];
  var ORDER = ['Foyer', 'Office', 'Pocket office', 'Living room', 'Dining room', 'Kitchen', 'Pantry', 'Mudroom', 'Powder room', 'Garage', 'Covered porch', 'Covered deck',
    'Primary bedroom', 'Primary bath', 'Dressing room', 'Laundry', 'Loft', 'Gallery', 'Hall', 'Bedroom 2', 'Bath 2', 'Bedroom 3', 'Bath 3', 'Bedroom 4', 'Lookout'];
  var walk = { f: 0, x: 0, y: 0, h: 0, yaw: Math.PI / 2, pitch: -0.05, route: null, settle: null, userLook: false };
  var tab = 0, lastRoom = null, lastF = -1, flashT = 0, keys = {}, ptr = null;
  var KEY = { ArrowUp: 'f', w: 'f', W: 'f', ArrowDown: 'b', s: 'b', S: 'b', ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r' };
  var ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tmp = { i: 0 }, ahead = { i: 0 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(dt, tau) { return 1 - Math.exp(-dt / tau); }
  function turn(a, b, dt, tau) { return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * ease(dt, tau); }
  function flash(msg) {
    hint.textContent = msg; clearTimeout(flashT);
    flashT = setTimeout(function () { hint.textContent = mode === 'walk' ? WALKHINT : HINTS[level]; }, 1800);
  }
  function setFov() {
    var asp = camera.aspect || 1, v = 2 * Math.atan(Math.tan(33 * Math.PI / 180) / asp) * 180 / Math.PI;      // keep about 66 degrees side to side
    camera.fov = clamp(v, 60, 94); camera.updateProjectionMatrix();
  }
  function placeCamera() {
    var w = walk, cp = Math.cos(w.pitch), px = w.x, py = w.h + cur.nav.eye, pz = -w.y;
    camera.position.set(px, py, pz);
    camera.lookAt(px + Math.cos(w.yaw) * cp, py + Math.sin(w.pitch), pz - Math.sin(w.yaw) * cp);
    lamp.position.set(px, py, pz);
  }

  /* A route is a list of points with running distances; posAt finds the place a given distance along it. */
  function makeRoute(pts) {
    var cum = [0];
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, dz = a.r ? b.z - a.z : 0;
      cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    return { pts: pts, cum: cum, total: cum[cum.length - 1], s: 0, i: 0, ramp: false, endYaw: null, v: 7, t0: 0, ex: 0, ey: 0 };
  }
  function posAt(R, s, out) {
    var pts = R.pts, cum = R.cum, i = out.i || 0;
    if (i > pts.length - 2) i = pts.length - 2;
    while (i < pts.length - 2 && cum[i + 1] <= s) i++;
    while (i > 0 && cum[i] > s) i--;
    var a = pts[i], b = pts[i + 1], L = cum[i + 1] - cum[i], t = L > 1e-6 ? clamp((s - cum[i]) / L, 0, 1) : 1;
    out.i = i; out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t;
    out.ramp = !!a.r; out.z = a.r ? a.z + (b.z - a.z) * t : a.z; out.f = a.r ? (t < 0.5 ? a.f : b.f) : a.f; out.up = b.z > a.z;
    return out;
  }
  function startRoute(dest, spot) {
    var w = walk, n = cur.nav, R0 = w.route, pre = null, from;
    if (R0 && R0.ramp) {                                                     // already on the stairs: finish the flight, then carry on
      var e = R0.pts[R0.i + 1];
      pre = [{ x: w.x, y: w.y, z: w.h, f: w.f, r: true }, e]; from = { f: e.f, x: e.x, y: e.y };
    } else from = { f: w.f, x: w.x, y: w.y };
    var p = n.route(from, dest);
    if (!p || p.length < 2) { flash('That spot can’t be reached on foot'); return false; }
    var R = makeRoute(pre ? pre.concat(p) : p);
    if (spot) {                                                              // a room shortcut: stop a few steps inside the doorway and face the room
      var r = spot.r, o = { i: 0 };
      var inside = function (x, y) { return x > r[0] + 0.4 && x < r[2] - 0.4 && y > r[1] + 0.4 && y < r[3] - 0.4; };
      if (!(w.f === dest.f && !pre && inside(w.x, w.y))) {
        for (var s = 0; s <= R.total; s += 0.25) {
          posAt(R, s, o);
          if (!o.ramp && o.f === dest.f && inside(o.x, o.y)) { R.total = Math.min(R.total, s + 3.2); break; }
        }
      }
    }
    var end = posAt(R, R.total, { i: 0 });
    R.ex = end.x; R.ey = end.y;
    if (spot) {
      var dx = spot.x - end.x, dy = spot.y - end.y;
      if (dx * dx + dy * dy > 2.2) R.endYaw = Math.atan2(dy, dx);
    }
    if (R.total < 0.3) {
      if (R.endYaw !== null) w.settle = { yaw: R.endYaw, t: 1.0 };
      return true;
    }
    R.v = clamp(R.total / 6.5, 7, 14); R.t0 = performance.now();
    w.route = R; w.settle = null;
    ring.position.set(end.x, n.floorZ(end.f, end.x, end.y) + 0.08, -end.y); ring.visible = true;
    dirty = true;
    return true;
  }
  function stairKeys() {                                                     // walking into a flight with the keyboard climbs or descends it
    var w = walk, S = cur.nav.stairs, fy = Math.sin(w.yaw), d = null;
    function near(p) { var dx = w.x - p[0], dy = w.y - p[1]; return dx * dx + dy * dy < 0.72; }
    if (w.f === 0 && fy > 0.5 && near(S.main.a)) d = { f: 1, x: S.main.b[0], y: S.main.b[1] };
    else if (w.f === 1 && fy < -0.5 && near(S.main.b)) d = { f: 0, x: S.main.a[0], y: S.main.a[1] };
    else if (w.f === 1 && fy > 0.5 && near(S.look.a)) d = { f: 2, x: S.look.b[0], y: S.look.b[1] };
    else if (w.f === 2 && fy < -0.5 && near(S.look.b)) d = { f: 1, x: S.look.a[0], y: S.look.a[1] };
    if (d) { w.userLook = false; startRoute(d, null); }
  }
  function keysMove(dt) {
    var w = walk, n = cur.nav, mv = (keys.f ? 1 : 0) - (keys.b ? 1 : 0), tr = (keys.l ? 1 : 0) - (keys.r ? 1 : 0);
    if (!mv && !tr) return false;
    w.settle = null;
    if (tr) w.yaw += tr * 1.9 * dt;
    if (mv) {
      var st = mv * 7.5 * dt, nx = w.x + Math.cos(w.yaw) * st, ny = w.y + Math.sin(w.yaw) * st;
      if (n.isFree(w.f, nx, w.y)) w.x = nx;                                   // slide along a wall instead of stopping dead
      if (n.isFree(w.f, w.x, ny)) w.y = ny;
      if (mv > 0) stairKeys();
    }
    return true;
  }
  function stepWalk(dt) {
    var w = walk, n = cur.nav, R = w.route, moving = false;
    if (R) {
      var el2 = (performance.now() - R.t0) / 1000, k = Math.min(1, 0.3 + el2 / 0.4, 0.3 + (R.total - R.s) / 3);
      R.s = reduce ? R.total : Math.min(R.total, R.s + R.v * k * dt);
      tmp.i = R.i; posAt(R, R.s, tmp); R.i = tmp.i; R.ramp = tmp.ramp;
      w.x = tmp.x; w.y = tmp.y; w.f = tmp.f;
      if (tmp.ramp) w.h = tmp.z;
      if (!w.userLook && !reduce) {
        ahead.i = R.i; posAt(R, Math.min(R.total, R.s + 2.6), ahead);
        var dx = ahead.x - w.x, dy = ahead.y - w.y;
        if (dx * dx + dy * dy > 0.04) w.yaw = turn(w.yaw, Math.atan2(dy, dx), dt, 0.2);
        w.pitch += ((tmp.ramp ? (tmp.up ? 0.14 : -0.42) : -0.05) - w.pitch) * ease(dt, 0.3);
      }
      if (R.s >= R.total - 1e-4) {
        w.route = null; R.ramp = false; ring.visible = false;
        if (reduce && !w.userLook) {
          ahead.i = 0; posAt(R, Math.max(0, R.total - 1.2), ahead);
          var ex = w.x - ahead.x, ey = w.y - ahead.y;
          w.yaw = R.endYaw !== null ? R.endYaw : (ex * ex + ey * ey > 0.01 ? Math.atan2(ey, ex) : w.yaw); w.pitch = -0.05;
        } else if (R.endYaw !== null && !w.userLook) w.settle = { yaw: R.endYaw, t: 1.0 };
        if (tab !== w.f) { tab = w.f; buildChips(); }
      }
      moving = true;
    } else if (w.settle) {
      w.yaw = turn(w.yaw, w.settle.yaw, dt, 0.22); w.pitch += (-0.05 - w.pitch) * ease(dt, 0.3);
      w.settle.t -= dt; if (w.settle.t <= 0) w.settle = null;
      moving = true;
    }
    if (!w.route && keysMove(dt)) moving = true;
    if (!(w.route && w.route.ramp)) {                                        // settle onto the floor here: steps down into the garage, onto the porch or deck
      var ht = n.floorZ(w.f, w.x, w.y);
      if (Math.abs(ht - w.h) > 0.004) { w.h += (ht - w.h) * (reduce ? 1 : ease(dt, 0.11)); moving = true; } else w.h = ht;
    }
    if (moving) { placeCamera(); syncHud(); dirty = true; }
  }

  function tapWalk(px, py) {
    var w = walk, n = cur.nav, rc = el.getBoundingClientRect();
    ndc.set(((px - rc.left) / rc.width) * 2 - 1, -((py - rc.top) / rc.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); ray.far = 400;
    var hits = ray.intersectObjects(cur.solid, false), d = ray.ray.direction, o = ray.ray.origin;
    var hl = Math.sqrt(d.x * d.x + d.z * d.z) || 1e-6, ux = d.x / hl, uy = -d.z / hl, tx, ty, dest = null;
    if (hits.length) {
      var hp = hits[0].point, nrm = hits[0].face ? hits[0].face.normal : null;
      dest = stairTap(hp.x, -hp.z, hp.y);
      tx = hp.x; ty = -hp.z;
      if (nrm && Math.abs(nrm.y) < 0.5) { tx -= ux * 0.9; ty -= uy * 0.9; }      // a wall or cabinet face: stand in front of it, not behind it
    } else if (d.y < -0.02) {
      var t = (w.h - o.y) / d.y; tx = o.x + d.x * t; ty = -(o.z + d.z * t);
    } else { tx = w.x + ux * 30; ty = w.y + uy * 30; }
    if (!dest) {
      var c = n.nearest(w.f, tx, ty, 6);
      if (c && (c[0] - tx) * (c[0] - tx) + (c[1] - ty) * (c[1] - ty) <= 10.5) dest = { f: w.f, x: c[0], y: c[1] };
      else {
        var m = n.march(w.f, w.x, w.y, tx, ty);                                // too far to reach: go as far as the way is clear
        if (m && (m[0] - w.x) * (m[0] - w.x) + (m[1] - w.y) * (m[1] - w.y) > 1) dest = { f: w.f, x: m[0], y: m[1] };
      }
    }
    if (!dest) { flash('That spot can’t be reached on foot'); return; }
    w.userLook = false;
    startRoute(dest, null);
  }
  function stairTap(x, y, h) {                                               // a tap on a flight of stairs means "take the stairs"
    var w = walk, S = cur.nav.stairs, zf2 = S.main.z1, zf3 = S.look.z1;
    if (x < S.x1 - 0.2 || x > S.x2 + 0.2) return null;
    var onMain = y > S.main.y0 - 0.3 && y < S.main.y1 + 0.3 && h > 0.3 && h < zf2 - 0.2;
    var onLook = y > S.look.y0 - 0.3 && y < S.look.y1 + 0.3 && h >= zf2 - 0.2 && h < zf3 - 0.2 && !(w.f === 1 && h < zf2 + 0.3);
    if (!onMain && !onLook) return null;
    if (w.f === 0) return { f: 1, x: S.main.b[0], y: S.main.b[1] };
    if (w.f === 2) return { f: 1, x: S.look.a[0], y: S.look.a[1] };
    return onMain ? { f: 0, x: S.main.a[0], y: S.main.a[1] } : { f: 2, x: S.look.b[0], y: S.look.b[1] };
  }

  function rank(nm) { var i = ORDER.indexOf(nm); return i < 0 ? 99 : i; }
  function buildChips() {
    var ft = tab;
    chipsEl.textContent = '';
    cur.nav.floors[ft].spots.slice().sort(function (a, b) { return rank(a.n) - rank(b.n); }).forEach(function (sp) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = sp.n;
      b.addEventListener('click', function () { walk.userLook = false; startRoute({ f: ft, x: sp.x, y: sp.y }, sp); });
      chipsEl.appendChild(b);
    });
    chipsEl.scrollLeft = 0;
    press('f-', String(ft));
    markChips();
  }
  function markChips() {
    Array.prototype.forEach.call(chipsEl.children, function (b) {
      if (tab === walk.f && b.textContent === lastRoom) {
        b.setAttribute('aria-current', 'true');
        var br = b.getBoundingClientRect(), cr = chipsEl.getBoundingClientRect();                 // keep the current room's button in view
        chipsEl.scrollLeft += (br.left + br.width / 2) - (cr.left + cr.width / 2);
      } else b.removeAttribute('aria-current');
    });
  }
  function syncHud() {
    var w = walk, name = (w.route && w.route.ramp) ? 'Stairs' : (cur.nav.room(w.f, w.x, w.y) || lastRoom || 'Walkthrough');
    if (name !== lastRoom || w.f !== lastF) {
      lastRoom = name; lastF = w.f;
      titleEl.textContent = name; subEl.textContent = FLOORS[w.f] + ' · ' + PLAN[curName];
      markChips();
    }
    drawMap();
  }
  function drawMap() {
    var w = walk, n = cur.nav, e = cur.ext, H = 128, k = H / (e[3] - e[1]), Wd = Math.round((e[2] - e[0]) * k), dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (mapEl.width !== Math.round(Wd * dpr) || mapEl.height !== Math.round(H * dpr)) {
      mapEl.width = Math.round(Wd * dpr); mapEl.height = Math.round(H * dpr); mapEl.style.width = Wd + 'px'; mapEl.style.height = H + 'px';
    }
    var c = mapEl.getContext('2d'), rooms = n.floors[w.f].rooms, i, r, W = cur.meta.W, D = cur.meta.D;
    function X(x) { return (x - e[0]) * k; }
    function Y(y) { return (e[3] - y) * k; }
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, Wd, H);
    c.fillStyle = '#e9edf2'; c.fillRect(X(0), Y(D), W * k, D * k);
    c.lineWidth = 1;
    for (i = 0; i < rooms.length; i++) {
      r = rooms[i];
      c.fillStyle = r[0] === lastRoom ? '#bcd3f7' : '#ffffff'; c.fillRect(X(r[1]), Y(r[4]), (r[3] - r[1]) * k, (r[4] - r[2]) * k);
      c.strokeStyle = '#8f9ba8'; c.strokeRect(X(r[1]) + 0.5, Y(r[4]) + 0.5, (r[3] - r[1]) * k - 1, (r[4] - r[2]) * k - 1);
    }
    c.strokeStyle = '#17212b'; c.lineWidth = 1.5; c.strokeRect(X(0), Y(D), W * k, D * k);
    var R = w.route;
    if (R) {                                                                 // the way ahead on this floor
      c.strokeStyle = '#1b56b3'; c.lineWidth = 2; c.lineJoin = 'round'; c.beginPath(); c.moveTo(X(w.x), Y(w.y));
      for (i = R.i + 1; i < R.pts.length; i++) {
        if (R.cum[i] >= R.total) { c.lineTo(X(R.ex), Y(R.ey)); break; }
        c.lineTo(X(R.pts[i].x), Y(R.pts[i].y));
        if (R.pts[i].r || R.pts[i - 1].r) break;
      }
      c.stroke();
    }
    var px = X(w.x), py = Y(w.y);
    c.fillStyle = 'rgba(27, 86, 179, 0.3)'; c.beginPath(); c.moveTo(px, py); c.arc(px, py, 22, -w.yaw - 0.5, -w.yaw + 0.5); c.closePath(); c.fill();
    c.fillStyle = '#1b56b3'; c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; c.beginPath(); c.arc(px, py, 4.5, 0, Math.PI * 2); c.fill(); c.stroke();
  }

  function enterWalk() {
    var n = cur.nav, s = n.floors[0].seed, w = walk;
    mode = 'walk'; controls.enabled = false; tween = null; ptr = null; keys = {};
    app.classList.add('walking'); orbitUI.hidden = true; walkUI.hidden = false; mapEl.hidden = false;
    Object.keys(cur.layers).forEach(function (k) { cur.layers[k].visible = k !== 'DOOR'; });     // the entry doors and the middle of the slider stand open
    if (cur.wallColor) cur.caps.forEach(function (c) { c.m.color.copy(cur.wallColor); });       // wall tops match the walls when seen from inside
    hemi.groundColor.setHex(0xd2ccc0); hemi.intensity = 0.62; fillA.intensity = 0.24; fillB.intensity = 0.14; fillC.intensity = 0.26; lamp.intensity = 0.42;
    camera.near = 0.25; camera.far = 3000; setFov();
    w.f = 0; w.x = s[0]; w.y = s[1]; w.h = n.floorZ(0, s[0], s[1]); w.yaw = Math.PI / 2; w.pitch = -0.05; w.route = null; w.settle = null; w.userLook = false;
    ring.visible = false; tab = 0; lastRoom = null; lastF = -1;
    clearTimeout(flashT); hint.textContent = WALKHINT;
    buildChips(); placeCamera(); syncHud(); setHash(); dirty = true;
  }
  function exitWalk() {
    mode = 'orbit'; controls.enabled = true; walk.route = null; walk.settle = null; ring.visible = false; ptr = null; keys = {};
    app.classList.remove('walking'); orbitUI.hidden = false; walkUI.hidden = true; mapEl.hidden = true;
    Object.keys(built).forEach(function (k) { built[k].caps.forEach(function (c) { c.m.color.copy(c.c); }); });
    hemi.groundColor.setHex(0x8b8f7c); hemi.intensity = 0.72; fillA.intensity = 0; fillB.intensity = 0; fillC.intensity = 0; lamp.intensity = 0;
    camera.near = 1; camera.far = 5000; camera.fov = 36; camera.up.set(0, 1, 0); camera.updateProjectionMatrix();
    titleEl.textContent = 'Farmhouse 3D Models'; subEl.textContent = 'Concept models from the floor plans, not for construction';
    clearTimeout(flashT);
    setLevel(level, false); go(homeView(), true); setHash();
  }

  el.addEventListener('pointerdown', function (e) {
    if (mode !== 'walk' || ptr) return;
    ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* capture is a nicety */ }
  });
  el.addEventListener('pointermove', function (e) {
    if (mode !== 'walk' || !ptr || e.pointerId !== ptr.id) return;
    var dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
    ptr.x = e.clientX; ptr.y = e.clientY;
    if (!ptr.moved) {
      if (Math.abs(e.clientX - ptr.sx) + Math.abs(e.clientY - ptr.sy) < 8) return;
      ptr.moved = true;
    }
    var k = (camera.fov * Math.PI / 180) / (stage.clientHeight || 1);         // the scene follows the finger
    walk.yaw += dx * k; walk.pitch = clamp(walk.pitch + dy * k, -1.2, 1.2);
    walk.userLook = true; walk.settle = null;
    placeCamera(); syncHud(); dirty = true;
  });
  function release(e) {
    if (!ptr || e.pointerId !== ptr.id) return;
    var tap = mode === 'walk' && e.type === 'pointerup' && !ptr.moved && performance.now() - ptr.t < 500;
    ptr = null;
    if (tap) tapWalk(e.clientX, e.clientY);
  }
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  window.addEventListener('keydown', function (e) {
    if (mode !== 'walk' || e.metaKey || e.ctrlKey || e.altKey) return;
    var k = KEY[e.key];
    if (k) { keys[k] = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', function (e) { var k = KEY[e.key]; if (k) keys[k] = false; });
  window.addEventListener('blur', function () { keys = {}; });
  mapEl.addEventListener('click', function (e) {
    if (mode !== 'walk') return;
    var rc = mapEl.getBoundingClientRect(), ext = cur.ext, k = rc.height / (ext[3] - ext[1]);
    var c = cur.nav.nearest(walk.f, ext[0] + (e.clientX - rc.left) / k, ext[3] - (e.clientY - rc.top) / k, 12);
    if (c) { walk.userLook = false; startRoute({ f: walk.f, x: c[0], y: c[1] }, null); }
    else flash('That spot can’t be reached on foot');
  });

  /* ---------------------------------------------------------------- frame loop and controls */
  var last = 0;
  function frame(now) {
    var dt = clamp((now - last) / 1000, 0, 0.05); last = now;
    if (mode === 'walk') stepWalk(dt);
    else if (tween) {
      var u = Math.min((now - tween.s) / tween.d, 1), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.t0, tween.t1, e); controls.update();
      if (u >= 1) tween = null;
      dirty = true;
    }
    if (dirty) { dirty = false; renderer.render(scene, camera); if (mode !== 'walk') placeTags(); }
    requestAnimationFrame(frame);
  }
  controls.addEventListener('change', function () { dirty = true; });
  controls.addEventListener('start', function () { tween = null; });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  function on(id, fn) { $(id).addEventListener('click', fn); }
  on('m-big', function () { setModel('big'); });
  on('m-small', function () { setModel('small'); });
  ['exterior', 'lookout', 'upper', 'main'].forEach(function (lv) { on('l-' + lv, function () { setLevel(lv, true); }); });
  on('v-front', function () { go('front'); });
  on('v-back', function () { go('back'); });
  on('v-above', function () { go('above'); });
  on('t-labels', function () {
    showLabels = !showLabels; this.setAttribute('aria-pressed', showLabels ? 'true' : 'false'); setLabels(); dirty = true;
  });
  on('b-walk', enterWalk);
  on('b-exit', exitWalk);
  [0, 1, 2].forEach(function (f) {
    on('f-' + f, function () {                                               // a floor button lists that floor's rooms and, from another floor, walks there
      tab = f; buildChips();
      if (walk.f !== f || (walk.route && walk.route.ramp)) {
        var s = cur.nav.floors[f].seed;
        walk.userLook = false; startRoute({ f: f, x: s[0], y: s[1] }, null);
      }
    });
  });
  function parseHash() {
    var m = /^#(plan|walk)-(3928|2792)$/.exec(location.hash || '');
    return m ? { walk: m[1] === 'walk', name: m[2] === '2792' ? 'small' : 'big' } : null;
  }
  window.addEventListener('hashchange', function () {
    var h = parseHash();
    if (!h) return;
    if (h.name !== curName) setModel(h.name);
    if (h.walk && mode !== 'walk') enterWalk(); else if (!h.walk && mode === 'walk') exitWalk();
  });

  var h0 = parseHash();
  resize();
  setModel(h0 ? h0.name : 'big', true);
  if (h0 && h0.walk) enterWalk();
  booting = false;
  requestAnimationFrame(frame);
})();
