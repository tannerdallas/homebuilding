/* Farmhouse 3D viewer: loads a plan's model on demand (Standard or Upgraded version), opens the house level by level down to the basement, and lets the viewer walk through room by room.
   Options change the model in place: exterior style, garage entry, lookout add-on, basement finish, backyard pool. Parts of a model that belong to one option carry it in their layer name
   (for example "L1@g=s"), and the plan's square footage, bedrooms and baths are recomputed whenever an option changes. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var stage = $('stage'), app = $('app'), labelsEl = $('labels'), hint = $('hint'), titleEl = $('title'), subEl = $('sub'), statsEl = $('stats'), dockEl = $('dock');
  var orbitUI = $('orbit-ui'), walkUI = $('walk-ui'), chipsEl = $('chips'), mapEl = $('map'), levelsEl = $('levels'), floorsEl = $('floors'), loadingEl = $('loading');
  var MODELS = window.MODELS = window.MODELS || {};
  function fail(msg) { $('fallback').hidden = false; $('fallback-msg').textContent = msg; }
  if (!window.THREE || !THREE.OrbitControls) { fail('The 3D library did not load. Check your connection, then reopen this page.'); return; }
  if (!window.NAV) { fail('The page did not load completely. Reopen it to try again.'); return; }

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
  scene.fog = new THREE.Fog(SKY, 700, 2100);
  var camera = new THREE.PerspectiveCamera(36, 1, 1, 5000);
  var controls = new THREE.OrbitControls(camera, el);
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.minDistance = 9;
  controls.maxDistance = 700;

  var hemi = new THREE.HemisphereLight(0xe6eef7, 0x8b8f7c, 0.72);
  scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xfff3df, 1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.08;
  var sc = sun.shadow.camera; sc.left = -125; sc.right = 125; sc.top = 125; sc.bottom = -125; sc.near = 1; sc.far = 520;
  scene.add(sun); scene.add(sun.target);
  /* Walkthrough-only lights, kept at zero in the model view: soft fills so walls that meet at a corner read differently, an upward fill for ceilings, and a lamp that travels with the viewer. */
  var fillA = new THREE.DirectionalLight(0xffffff, 0), fillB = new THREE.DirectionalLight(0xdde6f5, 0), fillC = new THREE.DirectionalLight(0xffffff, 0), lamp = new THREE.PointLight(0xfff2e2, 0, 48, 1.1);
  fillA.position.set(0.55, 0.5, 0.8); fillB.position.set(-0.8, 0.45, -0.5); fillC.position.set(0.1, -1, 0.15);
  scene.add(fillA); scene.add(fillB); scene.add(fillC); scene.add(lamp);

  /* Sky: a dome that runs from a pale horizon to blue overhead, with a soft glow around the sun. A small copy of it is filtered into the reflection map, so glass and metal
     pick up the sky the way they would outdoors. */
  var SUNDIR = new THREE.Vector3(80, 150, 70).normalize(), GLASS = [0.62, 0.16], ENV = null;       // glass opacity seen from outside and from inside; the reflection map (glass and metal only, to keep phones quick)
  function skyMat(zen) {                                   // colours are worked in linear light and encoded like every other material, so the reflection map reads them correctly
    return new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
      uniforms: { uSun: { value: SUNDIR }, uHor: { value: new THREE.Color(SKY).convertSRGBToLinear() }, uZen: { value: zen } },
      vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: ['varying vec3 vD; uniform vec3 uSun; uniform vec3 uHor; uniform vec3 uZen;', 'void main() {', '  vec3 d = normalize(vD); float h = clamp(d.y, -1.0, 1.0);',
        '  vec3 zen = uZen, gnd = vec3(0.075, 0.105, 0.06);',
        '  vec3 c = h > 0.0 ? mix(uHor, zen, pow(max(h, 0.0), 0.55)) : mix(uHor, gnd, smoothstep(0.0, 0.12, -h));',
        '  float s = max(dot(d, uSun), 0.0); c += vec3(1.0, 0.9, 0.72) * (0.12 * pow(s, 8.0) + 1.6 * pow(s, 260.0));',
        '  gl_FragColor = vec4(c, 1.0);', '  #include <tonemapping_fragment>', '  #include <encodings_fragment>', '}'].join('\n') });
  }
  var dome = new THREE.Mesh(new THREE.SphereGeometry(4200, 32, 16), skyMat(new THREE.Vector3(0.04, 0.135, 0.43))); dome.renderOrder = -1; dome.frustumCulled = false; scene.add(dome);
  try {
    var pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene(); es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), skyMat(new THREE.Vector3(0.16, 0.24, 0.40))));
    ENV = pm.fromScene(es, 0.03).texture; pm.dispose();
  } catch (e) { /* no reflection map: the plain sky light stays as it was */ }
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshLambertMaterial({ color: new THREE.Color(0.095, 0.175, 0.06) }));       // linear colour: a full green under the sun, not a pale one
  patch(ground.material, 7);
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
  var GREEN = { shrub: 0x3f6f3a, leaf: 0x477a38 };
  /* Surface patterns, drawn in the shader from world position so no textures are needed: brick, lap siding, stone, shingles, floor planks, tile, lawn, concrete, wood grain.
     Each material has its own pattern number and second colour; a look can change both. Lines fade to their average where they would be smaller than a pixel, so nothing shimmers. */
  var PATN = { brick: 1, lap: 2, shiplap: 2, stone: 3, shingle: 4, shingle90: 4, plank: 5, tile: 6, lawn: 7, conc: 8, woodv: 9, woodh: 9, woodf: 9 };
  var BASEPAT = { shingle: 4, shingle90: 4, oak: 5, lvp: 5, tile: 6, tiled: 6, grass: 7, drive: 8, conc: 8, found: 8, bwall: 8, wood: 9, woodv: 9, deck: 9, oakf: 9, gdoor: 9, edoor: 9, post: 9, shiplap: 2, lumber: 9 };
  var PATHEAD = [
    'varying vec3 vWp;', 'uniform vec3 uC2;', 'uniform float uLv[4];',
    'float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
    'float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }',
    'float jl(float f, float w, float j) { return mix(min(clamp((j - f) / w + 0.5, 0.0, 1.0) + clamp((f - 1.0) / w + 0.5, 0.0, 1.0), 1.0), j, smoothstep(0.35, 0.9, w)); }'].join('\n');      // a joint of width j at the start of each unit, filtered to the pixel
  /* The pattern is chosen when the material is compiled (PAT), so a plain painted surface costs nothing extra and each patterned one runs only its own few lines. */
  var PATBODY = [
    '#if PAT > 0',
    '{',
    '  vec3 fn = normalize(cross(dFdx(vWp), dFdy(vWp)));',
    '  bool up = abs(fn.y) < 0.5;',
    '  float hu = abs(fn.x) > abs(fn.z) ? vWp.z : vWp.x;',
    '#if PAT == 1',                                                                                    // brick, running bond
    '  if (up) {',
    '    float u0 = hu / 0.67, bv = vWp.y / 0.25, row = floor(bv), bu = u0 + 0.5 * mod(row, 2.0);',
    '    float wu = max(fwidth(u0), 1e-4), wv = max(fwidth(bv), 1e-4), vis = 1.0 - smoothstep(0.3, 0.8, max(wu, wv));',
    '    float tone = 0.86 + 0.28 * h21(vec2(row, floor(bu)));',
    '    diffuseColor.rgb = mix(diffuseColor.rgb * mix(1.0, tone, vis), uC2, (1.0 - (1.0 - jl(fract(bv), wv, 0.14)) * (1.0 - jl(fract(bu), max(wu, wv), 0.055))) * 0.8);',
    '  }',
    '#elif PAT == 2',                                                                                  // lap siding: 6 in. courses, a shadow line under each lap
    '  if (up) {',
    '    float bv = vWp.y / 0.5, wv = max(fwidth(bv), 1e-4), fv = fract(bv), vis = 1.0 - smoothstep(0.3, 0.8, wv);',
    '    diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 + 0.05 * (0.5 - fv) * vis), uC2, jl(1.0 - fv, wv, 0.11) * 0.85);',
    '  }',
    '#elif PAT == 3',                                                                                  // stone: coursed blocks of mixed length
    '  if (up) {',
    '    float bv = vWp.y / 0.72, row = floor(bv), u0 = hu / 1.45 + h21(vec2(row, 3.0)) * 5.0, wu = max(fwidth(u0), 1e-4), wv = max(fwidth(bv), 1e-4);',
    '    float id = floor(u0), vis = 1.0 - smoothstep(0.3, 0.8, max(wu, wv)), tone = h21(vec2(row * 7.0 + 1.0, id));',
    '    vec3 st = mix(diffuseColor.rgb, uC2, tone * 0.75 * vis + 0.3 * (1.0 - vis));',
    '    diffuseColor.rgb = mix(st, uC2 * 0.55, (1.0 - (1.0 - jl(fract(bv), wv, 0.09)) * (1.0 - jl(fract(u0), max(wu, wv), 0.05))) * 0.85);',
    '  }',
    '#elif PAT == 4',                                                                                  // roof shingles: rows down the slope, staggered tabs
    '  float sn = sqrt(max(1.0 - fn.y * fn.y, 0.0));',
    '  if (sn > 0.08 && abs(fn.y) > 0.2) {',
    '    vec3 ev = normalize(vec3(fn.z, 0.0, -fn.x));',
    '    float bv = vWp.y / (sn * 0.46), row = floor(bv), u0 = dot(vWp, ev) + 0.5 * mod(row, 2.0), wv = max(fwidth(bv), 1e-4), wu = max(fwidth(u0), 1e-4);',
    '    float vis = 1.0 - smoothstep(0.3, 0.8, max(wu, wv)), tone = 0.84 + 0.3 * h21(vec2(row, floor(u0)));',
    '    diffuseColor.rgb = mix(diffuseColor.rgb * mix(1.0, tone, vis), uC2, max(jl(fract(bv), wv, 0.13), jl(fract(u0), max(wu, wv), 0.05) * 0.6) * 0.75);',
    '  }',
    '#elif PAT == 5',                                                                                  // floor planks
    '  if (!up) {',
    '    float bv = vWp.z / 0.42, row = floor(bv), u0 = vWp.x / 5.5 + h21(vec2(row, 9.0)) * 7.0, wv = max(fwidth(bv), 1e-4), wu = max(fwidth(u0), 1e-4);',
    '    float vis = 1.0 - smoothstep(0.3, 0.8, wv), tone = 0.9 + 0.2 * h21(vec2(row, floor(u0))), gr = 0.96 + 0.08 * vn(vec2(vWp.x * 0.7, vWp.z * 16.0));',
    '    diffuseColor.rgb = mix(diffuseColor.rgb * mix(1.0, tone * gr, vis), uC2, max(jl(fract(bv), wv, 0.035), jl(fract(u0), wu, 0.004)) * 0.7);',
    '  }',
    '#elif PAT == 6',                                                                                  // tile, 12 x 24
    '  vec2 q = up ? vec2(hu / 2.0, vWp.y) : vec2(vWp.x / 2.0, vWp.z); q.x += 0.5 * mod(floor(q.y), 2.0);',
    '  vec2 w = max(fwidth(q), vec2(1e-4));',
    '  float vis = 1.0 - smoothstep(0.3, 0.8, max(w.x, w.y)), tone = 0.96 + 0.08 * h21(floor(q));',
    '  diffuseColor.rgb = mix(diffuseColor.rgb * mix(1.0, tone, vis), uC2, max(jl(fract(q.y), w.y, 0.02), jl(fract(q.x), w.x, 0.01)) * 0.8);',
    '#elif PAT == 7',                                                                                  // lawn: mottled, with faint mowing stripes
    '  float n = vn(vWp.xz * 0.11) * 0.5 + vn(vWp.xz * 0.9) * 0.3 + vn(vWp.xz * 7.0) * 0.2;',
    '  diffuseColor.rgb *= (0.8 + 0.4 * n) * (1.0 + 0.045 * sin(vWp.x * 0.52));',
    '#elif PAT == 8',                                                                                  // concrete: soft blotches and a fine broom finish
    '  vec2 q = up ? vec2(hu, vWp.y) : vWp.xz;',
    '  diffuseColor.rgb *= 0.92 + 0.13 * vn(q * 0.4) + 0.05 * vn(q * vec2(3.0, 42.0));',
    '#elif PAT == 9',                                                                                  // wood grain along the piece
    '  vec2 q = up ? vec2(hu * 11.0, vWp.y * 0.8) : vec2(vWp.x * 0.8, vWp.z * 11.0);',
    '  diffuseColor.rgb *= 0.84 + 0.3 * vn(q) * vn(q * vec2(0.37, 2.3) + 4.0) + 0.06 * vn(q * 3.0);',
    '#elif PAT == 10',                                                                                 // foliage: leafy mottling over the canopy shapes
    '  float n = vn(vec2(vWp.x + vWp.z, vWp.y) * 0.8) * 0.45 + vn(vec2(vWp.x - vWp.z, vWp.y * 1.3) * 2.4) * 0.35 + vn(vWp.xz * 6.0 + vWp.y * 3.0) * 0.2;',
    '  diffuseColor.rgb *= 0.5 + 0.85 * n;',
    '#endif',
    '}',
    '#endif',
    '#ifdef LVAO',                                                                                     // indoors: walls, cabinets and furniture darken a little where they meet the floor
    '{ vec3 f2 = normalize(cross(dFdx(vWp), dFdy(vWp)));',
    '  if (abs(f2.y) < 0.5) { float d = 9.0; for (int i = 0; i < 4; i++) { float e = vWp.y - uLv[i]; if (e > -0.05) d = min(d, e); }',
    '    diffuseColor.rgb *= mix(0.74, 1.0, smoothstep(0.0, 1.3, d)); } }',
    '#endif'].join('\n');
  function setPat(mat, code) { if (mat.defines.PAT !== code) { mat.defines.PAT = code; mat.needsUpdate = true; } }
  var INSIDE = { wall: 1, trim: 1, cabw: 1, cabd: 1, oakf: 1, shiplap: 1, tile: 1, bwall: 1, linen: 1, linen2: 1 }, NOLV = { value: [-99, -99, -99, -99] };
  function patch(mat, code, c2, lv) {                   // give a material its pattern and second colour (a look can change both); lv: floor levels for the indoor base shading
    mat.defines = mat.defines || {}; mat.defines.PAT = code || 0; if (lv) mat.defines.LVAO = ''; mat.userData.lv = lv || NOLV;
    mat.userData.c2 = { value: c2 || mat.color.clone().multiplyScalar(0.5) };
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uC2 = mat.userData.c2; sh.uniforms.uLv = mat.userData.lv;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + PATHEAD).replace('#include <color_fragment>', '#include <color_fragment>\n' + PATBODY);
    };
  }
  function build(name) {
    var m = MODELS[name], buf = decode(m.bin), root = new THREE.Group(), layers = {}, solid = [], caps = [], wallColor = null, sty = {}, styled = {}, glasses = [], plants = [], streets = [], walks = [], concMat = null, lvs = { value: [m.meta.bsmt ? m.meta.bsmt.zb : -99, 0, m.meta.zf2 || -99, m.meta.zf3 || -99] };
    Object.keys(m.meta.styles || {}).forEach(function (st) { Object.keys(m.meta.styles[st]).forEach(function (k) { styled[k] = true; }); });      // materials an exterior style recolors
    function layer(k) { if (!layers[k]) { layers[k] = new THREE.Group(); root.add(layers[k]); } return layers[k]; }
    m.parts.forEach(function (p) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, p.po, p.pn), 3));
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, p.io, p.inn), 1));
      var mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.color[0], p.color[1], p.color[2]), roughness: Math.max(p.rough, 0.25),
        metalness: Math.min(p.metal, 0.2), flatShading: true, side: THREE.DoubleSide });
      var water = p.mat === 'water', glass = p.alpha < 1 && !water;
      if (glass) { mat.transparent = true; mat.depthWrite = false; }
      if (water) { mat.transparent = true; mat.opacity = 0.86; mat.roughness = 0.12; mat.color.setRGB(0.1, 0.5, 0.62); }
      if (!glass && !water) { patch(mat, BASEPAT[p.mat] || 0, null, INSIDE[p.mat] ? lvs : null); if (ENV && p.metal > 0.5) { mat.envMap = ENV; mat.envMapIntensity = 0.7; mat.metalness = Math.min(p.metal, 0.55); } }
      if (glass) { mat.color.setRGB(0.045, 0.06, 0.07); mat.roughness = 0.04; mat.opacity = GLASS[0]; mat.envMap = ENV; mat.envMapIntensity = 2.2; glasses.push(mat); }
      if (styled[p.mat]) (sty[p.mat] = sty[p.mat] || []).push({ m: mat, c: mat.color.clone(), r: mat.roughness, k: mat.metalness, p: mat.defines.PAT || 0, env: mat.envMap || null });
      var mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = !glass && !water; mesh.receiveShadow = !glass;
      if (glass || water) mesh.renderOrder = 2;
      layer(p.layer).add(mesh);
      var lb = p.layer.split('@')[0];
      if (lb === 'SITE' || lb === 'GF' || lb === 'GS') {                                  // the sidewalk along the street, and the front walks (the suite add-on links to them)
        g.computeBoundingBox(); var bb = g.boundingBox;
        if (bb.max.x - bb.min.x > 300) streets.push(mesh); else if (p.mat === 'conc') { walks.push({ lay: lb, b: bb }); if (!concMat) concMat = mat; }
      }
      if (!glass && !water && lb !== 'SITE' && lb !== 'DOOR' && lb !== 'BJ' && lb !== 'BC' && lb.indexOf('POOL') !== 0) solid.push(mesh);     // what a tap can land on in the walkthrough
      if (p.mat === 'cap') caps.push({ m: mat, c: mat.color.clone() });                   // dark wall tops for the cutaway views
      if (p.mat === 'wall' && !wallColor) wallColor = mat.color.clone();
    });
    var site = layer('SITE'), ico = new THREE.IcosahedronGeometry(1, 1), mats = {};
    (m.meta.blobs || []).forEach(function (b) {
      var key = b[4];
      if (!mats[key]) { mats[key] = new THREE.MeshLambertMaterial({ color: GREEN[key] || 0x4a7a44 }); patch(mats[key], 10); }
      var s = new THREE.Mesh(ico, mats[key]);
      s.position.set(b[0], b[2], -b[1]); s.scale.set(b[3], b[3] * b[5], b[3]); s.castShadow = true; s.receiveShadow = true;
      (b[6] ? layer(b[6]) : site).add(s);             // shrubs that belong to one garage variation carry its layer name
      s.userData.p = [b[0], b[1]]; plants.push(s);
    });
    var bark = new THREE.MeshLambertMaterial({ color: 0x5b4636 }); patch(bark, 9);
    (m.meta.trunks || []).forEach(function (t) {
      var c = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, t[2] * 0.55, 8), bark);
      c.position.set(t[0], m.meta.zg + t[2] * 0.27, -t[1]); c.castShadow = true; site.add(c); c.userData.p = [t[0], t[1]]; plants.push(c);
    });
    var nav = new NAV.Nav(m.meta.nav), ext = [1e9, 1e9, -1e9, -1e9];
    [nav.floors[0].base].concat(nav.floors[0].alt).forEach(function (v) {                  // the floor map has room for either garage layout
      v.rooms.forEach(function (r) {
        ext[0] = Math.min(ext[0], r[1]); ext[1] = Math.min(ext[1], r[2]); ext[2] = Math.max(ext[2], r[3]); ext[3] = Math.max(ext[3], r[4]);
      });
    });
    var gnd = null, G = m.meta.bsmt && m.meta.bsmt.ground;                                 // the lawn, open over the basement and its window wells
    if (G) {
      var gp = [], gi = [];
      G.forEach(function (r, i) {
        gp.push(r[0], -2.02, -r[1], r[2], -2.02, -r[1], r[2], -2.02, -r[3], r[0], -2.02, -r[3]); gi.push(4 * i, 4 * i + 1, 4 * i + 2, 4 * i, 4 * i + 2, 4 * i + 3);
      });
      var gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); gg.setIndex(gi); gg.computeVertexNormals();
      gnd = new THREE.Mesh(gg, ground.material); gnd.receiveShadow = true; root.add(gnd);
    }
    ext[0] -= 1.5; ext[1] -= 1.5; ext[2] += 1.5; ext[3] += 1.5;
    var pools = {};
    [1, 2, 3].forEach(function (k) { if (layers['POOL' + k]) pools[k] = new THREE.Box3().setFromObject(layers['POOL' + k]); });
    return { root: root, layers: layers, meta: m.meta, nav: nav, solid: solid, solidOn: solid, ext: ext, caps: caps, wallColor: wallColor, pools: pools, sty: sty, gnd: gnd, glasses: glasses, plants: plants, streets: streets, walks: walks, concMat: concMat };
  }

  /* ---------------------------------------------------------------- model view */
  var WALKHINT = 'Tap where you want to go. Drag to look around.';
  var PLAN = { big: '3,928 Plan, Standard', small: '2,792 Plan, Standard', half: '1.5-Story Plan, Standard', ranch: 'Ranch Plan, Standard',
    big2: '3,928 Plan, Upgraded', small2: '2,792 Plan, Upgraded', half2: '1.5-Story Plan, Upgraded', ranch2: 'Ranch Plan, Upgraded',
    p18: '1,856 Plan', p14: '1,420 Plan', suite: 'In-Law Suite with Garage' };
  var FAMS = ['big', 'small', 'half', 'ranch', 'p18', 'p14', 'suite'], HAS2 = { big: 1, small: 1, half: 1, ranch: 1 };       // the compact plans come in one version
  var CODE = { big: '3928', small: '2792', half: '3560', ranch: 'ranch', big2: '3928v2', small2: '2792v2', half2: '3560v2', ranch2: 'ranchv2', p18: '1856', p14: '1420', suite: 'suite' }, NAME = {};
  Object.keys(CODE).forEach(function (k) { NAME[CODE[k]] = k; });
  var built = {}, cur = null, curName = '', level = 'exterior', pool = 0, garage = 'front', family = 'big', ver = 1, showLabels = true, tags = [], mode = 'orbit', pendingWalk = false;
  var opt = { g: 'f', lk: '1', st: 'brick', b: 'u', su: '0' }, optsOpen = false;
  var su = false, side = null, backTo = '';      // in-law suite add-on: a second building (suite + two-car garage) beside the house; backTo: the house a suite walk was started from       // options: garage entry (front, side), lookout add-on, exterior style, basement (unfinished, finished)
  var dirty = true, tween = null, booting = true, loading = {};
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function levelsOn() { return cur.meta.levels.filter(function (L) { return NAV.holds(L.when || '', opt); }); }      // the lookout level goes with the add-on
  function lv() {
    var L = levelsOn();
    for (var i = 0; i < L.length; i++) if (L[i].id === level) return L[i];
    return L[0];
  }
  function view(kind) {
    var m = cur.meta, xl = m.xl - (suiteOn() ? 56 : 0), xr = m.xr, cx = (xl + xr) / 2, D = m.D, k = Math.max(1, (xr - xl) / 60), z = lv().lift || 0, t = m.tower, low = m.stories === 1;
    if (kind === 'front') return suiteOn() ? { p: [cx + 10 * k, 13, 104 * k], t: [cx, low ? 9 : 12, -10] } : { p: [xr + 34 * k, 11, 98 * k], t: [cx + 0.5, low ? 10 : 14, -10] };
    if (kind === 'back') return { p: [xr + 54 * k, 15, -(D + 86 * k)], t: [cx + 2, low ? 9 : 13, -(pool ? D + 24 : 24)] };
    if (kind === 'above') return { p: [cx, 150 * k + z, -(D / 2 - 30)], t: [cx, z, -(D / 2 + 3)] };
    if (kind === 'look') return { p: [(t[0] + t[2]) / 2 + 26, z + 24, -(t[1] + t[3]) / 2 + 34], t: [(t[0] + t[2]) / 2, z + 2, -(t[1] + t[3]) / 2] };
    if (kind === 'pool') {
      var pb = cur.pools[pool], px = pb ? (pb.min.x + pb.max.x) / 2 : cx, pz = pb ? (pb.min.z + pb.max.z) / 2 : -(D + 34);
      return { p: [px + 52, 50, pz - 76], t: [px - 2, 2, pz + 8] };
    }
    if (kind === 'garage') return { p: [xl - 34 * k, 19, 62 * k], t: [xl + 12, 5, -4] };       // front corner on the garage side, to see the side-entry doors and court
    if (kind === 'bsmt') return { p: [cx - 16 * k, z + 82 * k, -(D / 2) + 40 * k], t: [cx, z, -(D / 2) - 1] };      // looking down into the basement
    return { p: [cx - 40 * k, 66 * k + z, 62 * k], t: [cx, z + 2, -D / 2 + 2] };            // dollhouse view
  }
  function go(kind, instant) {
    var v = view(kind), asp = camera.aspect || 1, k = kind === 'above' ? Math.min(Math.max(1.0 / asp, 1), 2.2) : Math.min(Math.max(1.5 / asp, 1), 3.2);
    if (optsOpen && mode === 'orbit' && kind !== 'front') k *= 1.4;                       // less room above the open options panel: stand farther back
    var t = new THREE.Vector3(v.t[0], v.t[1], v.t[2]), p = new THREE.Vector3(v.p[0], v.p[1], v.p[2]).sub(t).multiplyScalar(k).add(t);
    if (instant || reduce) { tween = null; camera.position.copy(p); controls.target.copy(t); controls.update(); dirty = true; return; }
    tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p, t1: t, s: performance.now(), d: 750 };
  }
  function homeView() { return level === 'exterior' ? 'front' : level === 'lookout' ? 'look' : level === 'basement' ? 'bsmt' : 'doll'; }
  function press(prefix, id) {
    Array.prototype.forEach.call(document.querySelectorAll('[id^="' + prefix + '"]'), function (b) { b.setAttribute('aria-pressed', b.id === prefix + id ? 'true' : 'false'); });
  }
  function applyVis() {                                 // which parts of the house are shown
    var hide = mode === 'walk' ? [] : lv().hide, deep = mode === 'walk' || level === 'basement';
    opt.su = suiteOn() ? '1' : '0';
    Object.keys(cur.layers).forEach(function (k) {
      var at = k.indexOf('@'), base = at < 0 ? k : k.slice(0, at), on = hide.indexOf(base) < 0;
      if (base.indexOf('POOL') === 0) on = base === 'POOL' + pool;
      else if (base === 'GF' || base === 'CF') on = on && opt.g === 'f';            // front-entry garage: its drive and planting, its cars
      else if (base === 'GS' || base === 'CS') on = on && opt.g === 's';            // side-entry garage
      else if (base === 'BU' || base === 'BJ') on = on && deep && opt.b === 'u';    // basement fit-out, shown when looking at the basement or walking
      else if (base === 'BF' || base === 'BC') on = on && deep && opt.b === 'f';
      else if (base === 'BT') on = on && deep;
      else if (opt.lk !== '1' && (base === 'L3' || base === 'F3' || base === 'TROOF')) on = false;      // lookout add-on left off
      if (mode === 'walk' && base === 'DOOR') on = false;                           // the entry doors and the middle of the slider stand open
      if (on && at >= 0) on = NAV.holds(k.slice(at + 1), opt);                      // parts that belong to one option
      cur.layers[k].visible = on;
    });
    cur.solidOn = cur.solid.filter(function (m) { return m.parent.visible; });
    applySide();
    dirty = true;
  }
  function suiteOn() { return su && !!side && curName !== 'suite'; }
  function sideCut() { var hd = lv().hide; return mode !== 'walk' && hd.indexOf('ROOF') >= 0 && hd.indexOf('L2') >= 0; }      // the house is open to its main floor or basement: the suite opens too
  function aimSun() {
    var m = cur.meta, cx = (m.xl - (suiteOn() ? 56 : 0) + m.xr) / 2;
    sun.position.set(cx + 80, 150, 70 - m.D / 2); sun.target.position.set(cx, 0, -m.D / 2 - 12); sun.target.updateMatrixWorld();
  }
  function applySide() {                                // the in-law suite add-on: suite and second two-car garage in one building, its garage built against the house's garage
    var onNow = suiteOn(), m = cur.meta, X0 = m.xl - 24;
    if (side) { if (onNow) { if (side.root.parent !== scene) scene.add(side.root); } else if (side.root.parent === scene) scene.remove(side.root); }
    cur.plants.forEach(function (o) { var p = o.userData.p; o.visible = !(onNow && p[0] < m.xl + 1.5 && p[0] > m.xl - 64 && p[1] > -66 && p[1] < 36); });      // planting that would stand where the suite and its drive go
    if (!onNow) return;
    var s = side, sopt = { g: 'f', lk: '0', st: opt.st, b: 'u', su: '1' }, hide = sideCut() ? s.cutHide : [];
    s.root.scale.set(-1, 1, 1);                         // mirrored, so its garage end meets the house's garage
    s.root.position.set(X0, m.zg - s.meta.zg, 0);       // front walls in line; its slab sits at the house's grade
    Object.keys(s.layers).forEach(function (k) {
      var at = k.indexOf('@'), base = at < 0 ? k : k.slice(0, at), on = hide.indexOf(base) < 0 && base !== 'GS' && base !== 'CS';
      if (on && at >= 0) on = NAV.holds(k.slice(at + 1), sopt);
      s.layers[k].visible = on;
    });
    s.plants.forEach(function (o) { o.visible = o.userData.p[0] > -22.5; });       // its own planting at the garage end gives way to the house
    s.streets.forEach(function (o) { o.visible = false; });                       // one sidewalk along the street, the house's
    applyStyle(s);
  }
  function setSuite(on, move) {
    su = !!on; $('t-suite').setAttribute('aria-pressed', su ? 'true' : 'false');
    $('g-side').disabled = su && curName !== 'suite';                     // built against the garage's end wall, so the garage doors face the street
    if (su && curName !== 'suite' && garage === 'side' && cur) setGarage('front', false);
    function fin() { aimSun(); refresh(); setLabels(); setHash(); if (move && mode === 'orbit') go(su && level !== 'exterior' ? 'above' : homeView()); }
    if (su && !side) {
      loadModel('suitea', function () {
        if (!MODELS.suitea) return;
        side = build('suitea');
        var L = side.meta.levels.filter(function (l) { return l.id === 'main'; })[0] || { hide: [], labels: '' };
        side.cutHide = L.hide; side.cutLabels = L.labels;
        if (cur) { fin(); if (!move && mode === 'orbit') go(homeView(), true); }      // loaded after the house was framed: frame the pair
      });
    } else if (cur) fin();
  }
  function applyStyle(M) {                              // exterior style: recolor the exterior materials
    M = M || cur;
    var S = (M.meta.styles || {})[opt.st] || {};
    Object.keys(M.sty).forEach(function (k) {
      var v = S[k];
      M.sty[k].forEach(function (e) {
        if (v) {
          e.m.color.setRGB(v.color[0], v.color[1], v.color[2]); e.m.roughness = Math.max(v.rough, 0.22); e.m.metalness = Math.min(v.metal, 0.55); var wantEnv = ENV && v.metal > 0.5 ? ENV : null; if (e.m.envMap !== wantEnv) { e.m.envMap = wantEnv; e.m.envMapIntensity = 0.7; e.m.needsUpdate = true; }
          if (e.m.userData.c2) { setPat(e.m, PATN[v.pat] || 0); if (v.c2) e.m.userData.c2.value.setRGB(v.c2[0], v.c2[1], v.c2[2]); else e.m.userData.c2.value.copy(e.m.color).multiplyScalar(0.5); }
        } else { e.m.color.copy(e.c); e.m.roughness = e.r; e.m.metalness = e.k; if (e.m.userData.c2) setPat(e.m, e.p); if (e.m.envMap !== e.env) { e.m.envMap = e.env; e.m.needsUpdate = true; } }
      });
    });
    dirty = true;
  }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  var QS = { big: { sqft: 3928, lookout: 224, bsmt: { fin: 1220 } }, small: { sqft: 2792, lookout: 224, bsmt: { fin: 730 } }, half: { sqft: 3560, lookout: 224, bsmt: { fin: 850 } }, ranch: { sqft: 2544, lookout: 224, bsmt: { fin: 2000 } },
    big2: { sqft: 3928, lookout: 224, bsmt: { fin: 1220 } }, small2: { sqft: 2792, lookout: 224, bsmt: { fin: 730 } }, half2: { sqft: 3760, lookout: 224, bsmt: { fin: 850 } }, ranch2: { sqft: 2796, lookout: 224, bsmt: { fin: 2260 } },
    p18: { sqft: 1856, lookout: 224, bsmt: { fin: 590 } }, p14: { sqft: 1420, lookout: 140, bsmt: { fin: 410 } }, suite: { sqft: 768, lookout: 0, bsmt: { fin: 0 } } };      // each plan's numbers, so every plan and version button can show its own; a loaded model's own numbers replace its entry
  function sqOf(s, lk) { return s.sqft - (lk ? 0 : s.lookout) + (opt.b === 'f' ? s.bsmt.fin : 0); }
  function planNums() {                                 // square footage on every plan and version button, as configured (another plan or version opens with the lookout on)
    FAMS.forEach(function (f) {
      var s = QS[f + (ver === 2 && HAS2[f] ? '2' : '')];
      if (s) $('q-' + f).textContent = fmt(sqOf(s, f !== family || opt.lk === '1')) + ' sq ft';
    });
    [1, 2].forEach(function (v) {
      var s = QS[family + (v === 2 ? '2' : '')];
      if (s) $('q-ver' + v).textContent = fmt(sqOf(s, v !== ver || opt.lk === '1')) + ' sq ft';
    });
  }
  function showPlate() {                                // plan name and its numbers as configured
    if (cur) { QS[curName] = cur.meta.stats; planNums(); }
    if (!cur || mode === 'walk') return;
    var s = cur.meta.stats, fin = opt.b === 'f';
    var sq = s.sqft - (opt.lk === '1' ? 0 : s.lookout) + (fin ? s.bsmt.fin : 0), ba = s.baths + (fin ? s.bsmt.baths : 0);
    titleEl.textContent = PLAN[curName];
    statsEl.hidden = false; statsEl.textContent = fmt(sq) + ' sq ft \u00b7 ' + s.beds + ' bed \u00b7 ' + ba + ' bath';
    if (suiteOn()) titleEl.textContent += ' + In-Law Suite';
    subEl.textContent = (suiteOn() ? 'Plus the in-law suite, attached at the garage: 768 sq ft, 1 bed, 1 bath, second two-car garage. ' : '') + (!cur.meta.bsmt ? 'One level on a slab, no steps anywhere. Attached two-car garage' : fin ? 'Includes ' + fmt(s.bsmt.fin) + ' sq ft of finished basement' : 'Plus ' + fmt(s.bsmt.total) + ' sq ft of unfinished basement') + '. Concept model, not for construction.';
  }
  function refresh() { cur.nav.setState(opt); applyVis(); showPlate(); }
  function setLabels() {
    labelsEl.textContent = ''; tags = [];
    var key = lv().labels;
    if (key === 'b') key = 'b' + opt.b;                 // the basement has one set of names for each fit-out
    if (!showLabels || !key || !cur) return;
    (cur.meta.labels[key] || []).forEach(function (l) {
      if (l.w && !NAV.holds(l.w, opt)) return;          // a room that changes name with an option
      var d = document.createElement('div'); d.className = 'tag'; d.textContent = l.t;
      labelsEl.appendChild(d); tags.push({ el: d, v: new THREE.Vector3(l.x, l.z + 1.5, -l.y), w: 0 });
    });
    if (suiteOn() && sideCut()) (side.meta.labels[side.cutLabels] || []).forEach(function (l) {
      var d = document.createElement('div'); d.className = 'tag'; d.textContent = l.t;
      labelsEl.appendChild(d); tags.push({ el: d, v: new THREE.Vector3(side.root.position.x - l.x, l.z + 1.5 + side.root.position.y, -l.y), w: 0 });
    });
    tags.forEach(function (t) { t.w = t.el.offsetWidth || 60; });
  }
  function setLevel(id, move) {
    level = id; level = lv().id; press('l-', level);
    applyVis(); hint.textContent = lv().hint; setLabels();
    if (move) go(homeView());
  }
  function buildLevels() {
    levelsEl.textContent = '';
    levelsOn().forEach(function (L) {
      var b = document.createElement('button'); b.type = 'button'; b.id = 'l-' + L.id; b.textContent = L.name; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { setLevel(L.id, true); });
      levelsEl.appendChild(b);
    });
  }
  function setPool(k, move) {
    pool = k; press('p-', String(k)); applyVis();
    if (move && mode === 'orbit' && k) { if (level !== 'exterior') setLevel('exterior', false); go('pool'); }
  }
  function setGarage(g, move) {
    if (g === 'side' && su && curName !== 'suite') g = 'front';
    garage = g; opt.g = g === 'side' ? 's' : 'f'; press('g-', g); refresh();
    if (move && mode === 'orbit') { if (level !== 'exterior') setLevel('exterior', false); go(g === 'side' ? 'garage' : 'front'); }
  }
  function setStyle(st, move) {
    opt.st = st; press('st-', st); applyStyle(); refresh();
    if (move && mode === 'orbit' && level !== 'exterior') setLevel('exterior', true);
  }
  function setLookout(on, move) {                       // add-on: with it off the roof closes over, the lookout level and its stair go away, and the numbers drop
    var was = level;
    opt.lk = on ? '1' : '0'; $('t-lookout').setAttribute('aria-pressed', on ? 'true' : 'false');
    cur.nav.setState(opt); buildLevels(); setLevel(was === 'lookout' && !on ? 'exterior' : was, false); showPlate();
    if (move && mode === 'orbit' && was === 'lookout' && !on) go(homeView());
  }
  function setBasement(b, move) {
    opt.b = b; press('b-', b); refresh();
    if (move && mode === 'orbit') { if (level !== 'basement') setLevel('basement', true); else setLabels(); }
  }
  function setOpts(open) {                              // the options panel takes the place of the view buttons while it is open
    optsOpen = open; $('opts').hidden = !open; $('views').hidden = open; hint.hidden = open; app.classList.toggle('choosing', open);      // the plan buttons step aside too, so the house stays in view
    $('b-opts').setAttribute('aria-expanded', open ? 'true' : 'false'); $('b-opts').textContent = open ? 'Done' : 'Options';
    resize();
  }
  function setHash() {
    if (booting) return;
    try {
      var h = (mode === 'walk' ? 'walk-' : 'plan-') + CODE[curName] + (su && curName !== 'suite' && !backTo ? '-with-suite' : '');
      if (location.hash !== '#' + h) location.hash = h;
    } catch (e) { /* the address is optional */ }
  }
  function loadModel(name, done) {                      // each plan's model is a separate file, fetched the first time it is chosen
    if (MODELS[name]) { done(); return; }
    if (loading[name]) { loading[name].push(done); return; }
    loading[name] = [done]; loadingEl.hidden = false;
    var s = document.createElement('script'); s.src = 'model-' + name + '.js';
    s.onload = function () { var q = loading[name]; delete loading[name]; loadingEl.hidden = Object.keys(loading).length === 0; q.forEach(function (f) { f(); }); };
    s.onerror = function () { delete loading[name]; loadingEl.hidden = true; fail('That model did not load. Check your connection, then reopen this page.'); };
    document.head.appendChild(s);
  }
  function setModel(name, first) {
    if (name === curName) return;
    if (name !== 'suite') backTo = '';
    press('m-', name.replace(/2$/, '')); press('ver-', /2$/.test(name) ? '2' : '1');
    loadModel(name, function () {
      if (!MODELS[name]) return;
      if (cur) scene.remove(cur.root);
      if (!built[name]) built[name] = build(name);
      cur = built[name]; curName = name; scene.add(cur.root);
      family = name.replace(/2$/, ''); ver = /2$/.test(name) ? 2 : 1; press('m-', family); press('ver-', String(ver));
      $('garage-grp').hidden = !cur.meta.garage; press('g-', garage); press('st-', opt.st); press('b-', opt.b);
      $('vers').hidden = !HAS2[family]; $('t-lookout').textContent = cur.meta.top || 'Lookout';
      try { $('m-' + family).scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { /* older browsers: the row still scrolls by hand */ }
      var hasPools = !!(cur.meta.pools && cur.meta.pools.length);                        // a building with no lookout, basement or pool hides those choices
      $('lk-grp').hidden = !!cur.meta.notower; $('bs-grp').hidden = !cur.meta.bsmt; $('pool-grp').hidden = !hasPools;
      if (!hasPools && pool) { pool = 0; press('p-', '0'); }
      opt.lk = cur.meta.notower ? '0' : '1'; $('t-lookout').setAttribute('aria-pressed', 'true');      // the lookout add-on is switched on again every time a plan loads
      cur.nav.setState(opt); applyStyle(); ground.visible = !cur.gnd; ground.position.y = cur.meta.zg - 0.02;
      $('su-grp').hidden = name === 'suite'; $('t-suite').setAttribute('aria-pressed', su ? 'true' : 'false');
      aimSun();
      buildLevels();
      if (mode === 'walk' || pendingWalk) { pendingWalk = false; enterWalk(); }
      else { setLevel(level, false); go(homeView(), true); showPlate(); }
      setHash();
      if (su && !side && name !== 'suite') setSuite(true, false);       // the add-on stays on from plan to plan; its model loads the first time
    });
  }

  function resize() {
    var w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    var off = (mode === 'orbit' && optsOpen) ? Math.round(Math.min(dockEl.offsetHeight * 0.4, h * 0.28)) : 0;       // options open: slide the picture up so the house stays clear of the panel
    if (off) camera.setViewOffset(w, h, 0, off, w, h); else camera.clearViewOffset();
    if (mode === 'walk') setFov(); else camera.updateProjectionMatrix();
    dirty = true;
  }
  var v3 = new THREE.Vector3();
  function placeTags() {
    var w = stage.clientWidth, h = stage.clientHeight, placed = [];
    for (var i = 0; i < tags.length; i++) {
      v3.copy(tags[i].v).project(camera);
      var ok = v3.z < 1 && v3.x > -1.05 && v3.x < 1.05 && v3.y > -1.05 && v3.y < 1.05, x = (v3.x * 0.5 + 0.5) * w, y = (-v3.y * 0.5 + 0.5) * h, hw = tags[i].w / 2 + 2;
      for (var j = 0; ok && j < placed.length; j++) if (Math.abs(placed[j][0] - x) < placed[j][2] + hw && Math.abs(placed[j][1] - y) < 22) ok = false;   // when zoomed out, a name that would cover another one waits until there is room
      tags[i].el.style.display = ok ? '' : 'none';
      if (ok) { placed.push([x, y, hw]); tags[i].el.style.transform = 'translate(-50%,-50%) translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)'; }
    }
  }

  /* ---------------------------------------------------------------- walkthrough
     Positions are in plan feet: x across the front of the house, y from the front wall toward the back. The 3D scene uses (x, height, -y).
     walk.f is the area the viewer is in (main floor, upstairs, office loft, lookout); stairs link areas. */
  var ORDER = ['Foyer', 'Office', 'Pocket office', 'Living room', 'Dining room', 'Kitchen', 'Pantry', 'Mudroom', 'Laundry', 'Powder room',
    'Primary bedroom', 'Primary bath', 'Primary closet', 'Dressing room', 'Stair nook', 'Loft', 'Gallery', 'Hall', 'Bedroom 2', 'Bath 2', 'Bedroom 3', 'Bath 3', 'Bedroom 4',
    'Garage', 'Covered porch', 'Covered deck', 'Office loft', 'Lookout',
    'Open basement', 'Bath rough-in', 'Wet bar rough-in', 'Bar', 'Lounge', 'Theater', 'Game room', 'Gallery', 'Wine nook', 'Gym', 'Sauna', 'Bath', 'Safe room', 'Storage', 'Mechanical'];
  var walk = { f: 0, x: 0, y: 0, h: 0, yaw: Math.PI / 2, pitch: -0.05, route: null, settle: null, userLook: false, at: null };
  var tab = 0, lastRoom = null, lastF = -1, flashT = 0, keys = {}, ptr = null;
  var KEY = { ArrowUp: 'f', w: 'f', W: 'f', ArrowDown: 'b', s: 'b', S: 'b', ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r' };
  var ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tmp = { i: 0 }, ahead = { i: 0 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(dt, tau) { return 1 - Math.exp(-dt / tau); }
  function turn(a, b, dt, tau) { return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * ease(dt, tau); }
  function flash(msg) {
    hint.textContent = msg; clearTimeout(flashT);
    flashT = setTimeout(function () { hint.textContent = mode === 'walk' ? WALKHINT : lv().hint; }, 1800);
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
    return { pts: pts, cum: cum, total: cum[cum.length - 1], s: 0, i: 0, ramp: false, endYaw: null, endPitch: null, at: null, v: 7, t0: 0, ex: 0, ey: 0 };
  }
  function posAt(R, s, out) {
    var pts = R.pts, cum = R.cum, i = out.i || 0;
    if (i > pts.length - 2) i = pts.length - 2;
    while (i < pts.length - 2 && cum[i + 1] <= s) i++;
    while (i > 0 && cum[i] > s) i--;
    var a = pts[i], b = pts[i + 1], L = cum[i + 1] - cum[i], t = L > 1e-6 ? clamp((s - cum[i]) / L, 0, 1) : 1;
    out.i = i; out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t;
    out.ramp = !!a.r; out.z = a.r ? a.z + (b.z - a.z) * t : a.z; out.f = a.r ? (t < 0.5 ? a.f : b.f) : a.f;
    out.up = b.z > a.z + 0.01; out.down = b.z < a.z - 0.01; out.k = a.r ? (a.k || 1) : 1;
    return out;
  }
  function startRoute(dest, spot) {
    var w = walk, n = cur.nav, R0 = w.route, pre = null, from;
    if (R0 && R0.ramp) {                                                     // already on a stair: finish it, then carry on
      var j = R0.i + 1;
      while (j < R0.pts.length - 1 && R0.pts[j].r) j++;
      pre = [{ x: w.x, y: w.y, z: w.h, f: w.f, r: true, k: R0.pts[R0.i].k }].concat(R0.pts.slice(R0.i + 1, j + 1));
      var e = R0.pts[j]; from = { f: e.f, x: e.x, y: e.y };
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
      var lk = spot.look || [spot.x, spot.y], dx = lk[0] - end.x, dy = lk[1] - end.y;                 // a spot outside its room (the sauna) says where to look
      if (dx * dx + dy * dy > 2.2) R.endYaw = Math.atan2(dy, dx);
      if (spot.pitch !== undefined) R.endPitch = spot.pitch;                                           // look down at something on the floor
      if (spot.look) R.at = spot.n;                                                                    // standing outside the place itself: keep its name on screen
    }
    if (R.total < 0.3) {
      if (R.endYaw !== null) w.settle = { yaw: R.endYaw, t: 1.0, pitch: R.endPitch };
      return true;
    }
    R.v = clamp(R.total / 6.5, 7, 14); R.t0 = performance.now();
    w.route = R; w.settle = null;
    ring.position.set(end.x, n.floorZ(end.f, end.x, end.y) + 0.08, -end.y); ring.visible = true;
    dirty = true;
    return true;
  }
  function stairKeys() {                                                     // walking into a stair with the keyboard climbs or descends it
    var w = walk, L = cur.nav.links, fx = Math.cos(w.yaw), fy = Math.sin(w.yaw), d = null;
    function near(p) { var dx = w.x - p[0], dy = w.y - p[1]; return dx * dx + dy * dy < 0.72; }
    function toward(p, q) { var dx = q[0] - p[0], dy = q[1] - p[1], n = Math.sqrt(dx * dx + dy * dy) || 1; return (fx * dx + fy * dy) / n > 0.5; }
    for (var i = 0; i < L.length && !d; i++) {
      var k = L[i], P = k.pts, n = P.length;
      if (w.f === k.a && near(k.pa) && toward(k.pa, P[Math.min(2, n - 1)])) d = { f: k.b, x: k.pb[0], y: k.pb[1] };
      else if (w.f === k.b && near(k.pb) && toward(k.pb, P[Math.max(0, n - 3)])) d = { f: k.a, x: k.pa[0], y: k.pa[1] };
    }
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
      tmp.i = R.i; posAt(R, R.s, tmp);
      R.s = reduce ? R.total : Math.min(R.total, R.s + R.v * k * tmp.k * dt);
      tmp.i = R.i; posAt(R, R.s, tmp); R.i = tmp.i; R.ramp = tmp.ramp;
      w.x = tmp.x; w.y = tmp.y; w.f = tmp.f;
      if (tmp.ramp) w.h = tmp.z;
      if (!w.userLook && !reduce) {
        ahead.i = R.i; posAt(R, Math.min(R.total, R.s + (tmp.k < 1 ? 1.4 : 2.6)), ahead);
        var dx = ahead.x - w.x, dy = ahead.y - w.y;
        if (dx * dx + dy * dy > 0.04) w.yaw = turn(w.yaw, Math.atan2(dy, dx), dt, 0.2);
        w.pitch += ((tmp.ramp ? (tmp.up ? 0.14 : tmp.down ? -0.42 : -0.05) : -0.05) - w.pitch) * ease(dt, 0.3);
      }
      if (R.s >= R.total - 1e-4) {
        w.route = null; R.ramp = false; ring.visible = false; w.at = R.at ? { n: R.at, x: w.x, y: w.y, f: w.f } : null;
        if (reduce && !w.userLook) {
          ahead.i = 0; posAt(R, Math.max(0, R.total - 1.2), ahead);
          var ex = w.x - ahead.x, ey = w.y - ahead.y;
          w.yaw = R.endYaw !== null ? R.endYaw : (ex * ex + ey * ey > 0.01 ? Math.atan2(ey, ex) : w.yaw); w.pitch = R.endPitch !== null ? R.endPitch : -0.05;
        } else if (R.endYaw !== null && !w.userLook) w.settle = { yaw: R.endYaw, t: 1.0, pitch: R.endPitch };
        if (tab !== w.f) { tab = w.f; buildChips(); }
      }
      moving = true;
    } else if (w.settle) {
      w.yaw = turn(w.yaw, w.settle.yaw, dt, 0.22); w.pitch += ((w.settle.pitch != null ? w.settle.pitch : -0.05) - w.pitch) * ease(dt, 0.3);
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
    var hits = ray.intersectObjects(cur.solidOn, false), d = ray.ray.direction, o = ray.ray.origin;
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
  function stairTap(x, y, h) {                                               // a tap on a stair means "take the stairs"
    var w = walk, L = cur.nav.links;
    for (var i = 0; i < L.length; i++) {
      var k = L[i], b = k.box;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3] || h < b[4] || h > b[5]) continue;
      if (w.f === k.a) return { f: k.b, x: k.pb[0], y: k.pb[1] };
      return { f: k.a, x: k.pa[0], y: k.pa[1] };
    }
    return null;
  }

  function rank(nm) { var i = ORDER.indexOf(nm); return i < 0 ? 99 : i; }
  function buildFloors() {
    floorsEl.textContent = '';
    cur.nav.floors.forEach(function (F, f) {
      if (!F.on) return;                                                     // the lookout without the add-on, the other basement fit-out
      var b = document.createElement('button'); b.type = 'button'; b.id = 'f-' + f; b.textContent = F.name === 'Main floor' ? 'Main' : F.name; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {                              // lists that area's rooms and, from somewhere else, walks there
        tab = f; buildChips();
        if (walk.f !== f || (walk.route && walk.route.ramp)) { walk.userLook = false; startRoute({ f: f, x: F.seed[0], y: F.seed[1] }, null); }
      });
      floorsEl.appendChild(b);
    });
    if (suiteOn() || (curName === 'suite' && backTo)) {                     // with the add-on, the walk continues in the suite, and comes back
      var b2 = document.createElement('button'); b2.type = 'button'; b2.textContent = curName === 'suite' ? 'Back to the house' : 'In-law suite'; b2.setAttribute('aria-pressed', 'false');
      b2.addEventListener('click', function () { if (curName === 'suite') { var nm = backTo; backTo = ''; setModel(nm); } else { backTo = curName; setModel('suite'); } });
      floorsEl.appendChild(b2);
    }
  }
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
    if (w.at && !w.route && w.at.f === w.f && Math.abs(w.at.x - w.x) + Math.abs(w.at.y - w.y) < 1.5) name = w.at.n; else if (!w.route) w.at = null;
    if (name !== lastRoom || w.f !== lastF) {
      lastRoom = name; lastF = w.f;
      titleEl.textContent = name; subEl.textContent = cur.nav.floors[w.f].name + ' · ' + PLAN[curName];
      markChips();
    }
    drawMap();
  }
  function drawMap() {
    var w = walk, n = cur.nav, e = cur.ext, H = 128, k0 = H / (e[3] - e[1]), Wd = Math.round((e[2] - e[0]) * k0), k = k0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (Wd > 168) { k = 168 / (e[2] - e[0]); Wd = 168; H = Math.round((e[3] - e[1]) * k); }       // wide houses: cap the map's width instead
    if (mapEl.width !== Math.round(Wd * dpr) || mapEl.height !== Math.round(H * dpr)) {
      mapEl.width = Math.round(Wd * dpr); mapEl.height = Math.round(H * dpr); mapEl.style.width = Wd + 'px'; mapEl.style.height = H + 'px';
      app.style.setProperty('--mapw', (Wd + 28) + 'px');
    }
    var c = mapEl.getContext('2d'), i, r, a0 = n.floors[0].rooms, rooms = n.floors[w.f].rooms;
    function X(x) { return (x - e[0]) * k; }
    function Y(y) { return (e[3] - y) * k; }
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, Wd, H);
    c.fillStyle = '#e4e9ef';                                                 // footprint of the main floor, for orientation on the upper levels
    for (i = 0; i < a0.length; i++) { r = a0[i]; if (r[0].indexOf('Covered') !== 0) c.fillRect(X(r[1]), Y(r[4]), (r[3] - r[1]) * k, (r[4] - r[2]) * k); }
    c.lineWidth = 1;
    for (i = 0; i < rooms.length; i++) {
      r = rooms[i];
      c.fillStyle = r[0] === lastRoom ? '#bcd3f7' : '#ffffff'; c.fillRect(X(r[1]), Y(r[4]), (r[3] - r[1]) * k, (r[4] - r[2]) * k);
      c.strokeStyle = '#7f8c99'; c.strokeRect(X(r[1]) + 0.5, Y(r[4]) + 0.5, (r[3] - r[1]) * k - 1, (r[4] - r[2]) * k - 1);
    }
    var R = w.route;
    if (R) {                                                                 // the way ahead in this area
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
  function mapScale() { var e = cur.ext, rc = mapEl.getBoundingClientRect(); return rc.width / (e[2] - e[0]); }

  function enterWalk() {
    if (!cur) { pendingWalk = true; return; }
    var n = cur.nav, s = n.floors[0].seed, w = walk;
    if (optsOpen) setOpts(false);
    mode = 'walk'; controls.enabled = false; tween = null; ptr = null; keys = {}; camera.clearViewOffset(); statsEl.hidden = true;
    app.classList.add('walking'); orbitUI.hidden = true; walkUI.hidden = false; mapEl.hidden = false;
    applyVis();
    if (cur.wallColor) cur.caps.forEach(function (c) { c.m.color.copy(cur.wallColor); });       // wall tops match the walls when seen from inside
    cur.glasses.forEach(function (g) { g.opacity = GLASS[1]; });                                  // from inside, the glass is clear
    renderer.toneMappingExposure = 0.8;
    hemi.groundColor.setHex(0xd2ccc0); hemi.intensity = 0.56; fillA.intensity = 0.24; fillB.intensity = 0.14; fillC.intensity = 0.26; lamp.intensity = 0.42;
    camera.near = 0.25; camera.far = 3000; setFov();
    w.f = 0; w.x = s[0]; w.y = s[1]; w.h = n.floorZ(0, s[0], s[1]); w.yaw = Math.PI / 2; w.pitch = -0.05; w.route = null; w.settle = null; w.userLook = false; w.at = null;
    ring.visible = false; tab = 0; lastRoom = null; lastF = -1;
    clearTimeout(flashT); hint.textContent = WALKHINT;
    buildFloors(); buildChips(); placeCamera(); syncHud(); setHash(); dirty = true;
  }
  function exitWalk() {
    mode = 'orbit'; controls.enabled = true; walk.route = null; walk.settle = null; ring.visible = false; ptr = null; keys = {};
    app.classList.remove('walking'); orbitUI.hidden = false; walkUI.hidden = true; mapEl.hidden = true;
    Object.keys(built).forEach(function (k) { built[k].caps.forEach(function (c) { c.m.color.copy(c.c); }); });
    Object.keys(built).forEach(function (k) { built[k].glasses.forEach(function (g) { g.opacity = GLASS[0]; }); });
    renderer.toneMappingExposure = 0.95;
    hemi.groundColor.setHex(0x8b8f7c); hemi.intensity = 0.72; fillA.intensity = 0; fillB.intensity = 0; fillC.intensity = 0; lamp.intensity = 0;
    camera.near = 1; camera.far = 5000; camera.fov = 36; camera.up.set(0, 1, 0); camera.updateProjectionMatrix();
    clearTimeout(flashT);
    if (backTo) { var nm0 = backTo; backTo = ''; setModel(nm0); return; }       // a suite walk that started from a house ends back at that house
    setLevel(level, false); go(homeView(), true); showPlate(); setHash();
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
    var rc = mapEl.getBoundingClientRect(), ext = cur.ext, k = mapScale();
    var c = cur.nav.nearest(walk.f, ext[0] + (e.clientX - rc.left) / k, ext[3] - (e.clientY - rc.top) / k, 12);
    if (c) { walk.userLook = false; startRoute({ f: walk.f, x: c[0], y: c[1] }, null); }
    else flash('That spot can’t be reached on foot');
  });

  /* ---------------------------------------------------------------- frame loop and controls */
  var last = 0;
  function frame(now) {
    var dt = clamp((now - last) / 1000, 0, 0.05); last = now;
    if (cur) {
      if (mode === 'walk') stepWalk(dt);
      else if (tween) {
        var u = Math.min((now - tween.s) / tween.d, 1), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.t0, tween.t1, e); controls.update();
        if (u >= 1) tween = null;
        dirty = true;
      }
      if (dirty) { dirty = false; renderer.render(scene, camera); if (mode !== 'walk') placeTags(); }
    }
    requestAnimationFrame(frame);
  }
  controls.addEventListener('change', function () { dirty = true; });
  controls.addEventListener('start', function () { tween = null; });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  function on(id, fn) { $(id).addEventListener('click', fn); }
  FAMS.forEach(function (nm) { on('m-' + nm, function () { setModel(nm + (ver === 2 && HAS2[nm] ? '2' : '')); }); });
  on('ver-1', function () { setModel(family); });
  on('ver-2', function () { setModel(family + '2'); });
  on('g-front', function () { if (cur) setGarage('front', true); });
  on('g-side', function () { if (cur) setGarage('side', true); });
  ['farm', 'craft', 'trans', 'brick', 'country'].forEach(function (st) { on('st-' + st, function () { if (cur) setStyle(st, true); }); });
  on('t-lookout', function () { if (cur) setLookout(opt.lk !== '1', true); });
  on('t-suite', function () { if (cur) setSuite(!su, true); });
  on('b-u', function () { if (cur) setBasement('u', true); });
  on('b-f', function () { if (cur) setBasement('f', true); });
  on('b-opts', function () { setOpts(!optsOpen); });
  on('v-front', function () { if (cur) go('front'); });
  on('v-back', function () { if (cur) go('back'); });
  on('v-above', function () { if (cur) go('above'); });
  on('t-labels', function () {
    showLabels = !showLabels; this.setAttribute('aria-pressed', showLabels ? 'true' : 'false'); if (cur) setLabels(); dirty = true;
  });
  [0, 1, 2, 3].forEach(function (k) { on('p-' + k, function () { if (cur) setPool(k, true); }); });
  on('b-walk', function () { if (cur) enterWalk(); });
  on('b-exit', exitWalk);
  function parseHash() {
    var m = /^#(plan|walk)-(3928v2|2792v2|3560v2|ranchv2|3928|2792|3560|ranch|1856|1420|suite)(-with-suite)?$/.exec(location.hash || '');
    return m ? { walk: m[1] === 'walk', name: NAME[m[2]], su: !!m[3] && m[2] !== 'suite' } : null;
  }
  window.addEventListener('hashchange', function () {
    var h = parseHash();
    if (!h) return;
    if (h.name !== 'suite' && h.su !== su) { if (h.name !== curName) su = h.su; else setSuite(h.su, true); }
    if (h.name !== curName) { pendingWalk = h.walk && mode !== 'walk'; setModel(h.name); return; }
    if (h.walk && mode !== 'walk') enterWalk(); else if (!h.walk && mode === 'walk') exitWalk();
  });

  var h0 = parseHash();
  resize();
  pendingWalk = !!(h0 && h0.walk); su = !!(h0 && h0.su);
  setModel(h0 ? h0.name : 'big', true);
  booting = false;
  requestAnimationFrame(frame);
})();
