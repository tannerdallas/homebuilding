/* Farmhouse 3D viewer: loads a plan's model on demand (Standard or Upgraded version), opens the house level by level down to the basement, and lets the viewer walk through room by room.
   Options change the model in place: exterior style, garage entry, lookout add-on, basement finish, backyard pool. Parts of a model that belong to one option carry it in their layer name
   (for example "L1@g=s"), and the plan's square footage, bedrooms and baths are recomputed whenever an option changes. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var stage = $('stage'), app = $('app'), labelsEl = $('labels'), hint = $('hint'), titleEl = $('title'), subEl = $('sub'), statsEl = $('stats'), dockEl = $('dock');
  var orbitUI = $('orbit-ui'), walkUI = $('walk-ui'), chipsEl = $('chips'), mapEl = $('map'), levelsEl = $('levels'), floorsEl = $('floors'), loadingEl = $('loading');
  var MODELS = window.MODELS = window.MODELS || {}; var MODELS_IN = window.MODELS_IN = window.MODELS_IN || {};
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
  var SUNDIR = new THREE.Vector3(80, 150, 70).normalize(), GLASS = [0.62, 0.16], ENV = null, ENVIN = null;       // glass opacity seen from outside and from inside; the reflection map (glass and metal only, to keep phones quick)
  function skyMat(zen) {                                   // colours are worked in linear light and encoded like every other material, so the reflection map reads them correctly
    return new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
      uniforms: { uSun: { value: SUNDIR }, uHor: { value: new THREE.Color(SKY).convertSRGBToLinear() }, uZen: { value: zen }, uGain: { value: 1 } },
      vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: ['varying vec3 vD; uniform vec3 uSun; uniform vec3 uHor; uniform vec3 uZen; uniform float uGain;',
        'float h2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
        'float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }',
        'float fb(vec2 p) { return n2(p) * 0.5 + n2(p * 2.02 + 9.1) * 0.25 + n2(p * 4.1 + 3.3) * 0.15 + n2(p * 8.3 + 1.7) * 0.1; }',
        'void main() {', '  vec3 d = normalize(vD); float h = clamp(d.y, -1.0, 1.0);',
        '  vec3 zen = uZen, gnd = vec3(0.075, 0.105, 0.06);',
        '  vec3 c = h > 0.0 ? mix(uHor, zen, pow(max(h, 0.0), 0.55)) : mix(uHor, gnd, smoothstep(0.0, 0.12, -h));',
        '  float s = max(dot(d, uSun), 0.0); c += vec3(1.0, 0.9, 0.72) * (0.12 * pow(s, 8.0) + 1.6 * pow(s, 260.0));',
        '  if (h > 0.015) {',                               // fair-weather clouds: a flat layer seen in perspective, thinning into the haze at the horizon
        '    vec2 cp = d.xz / (h + 0.12) * 0.9; float cv = fb(cp + vec2(2.0, 5.0)), cw = fb(cp * 2.6 + 11.0);',
        '    float cov = smoothstep(0.53, 0.76, cv * 0.75 + cw * 0.25) * smoothstep(0.015, 0.16, h);',
        '    c = mix(c, mix(vec3(0.60, 0.65, 0.74), vec3(1.0, 0.99, 0.96), smoothstep(0.3, 0.9, cw * 0.5 + cv * 0.5 + 0.25 * s)), cov * 0.82);',
        '  }',
        '  gl_FragColor = vec4(c * uGain, 1.0);', '  #include <tonemapping_fragment>', '  #include <encodings_fragment>', '}'].join('\n') });
  }
  var dome = new THREE.Mesh(new THREE.SphereGeometry(4200, 32, 16), skyMat(new THREE.Vector3(0.04, 0.135, 0.43))); dome.renderOrder = -1; dome.frustumCulled = false; scene.add(dome);
  try {
    var pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene(); es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), skyMat(new THREE.Vector3(0.16, 0.24, 0.40))));
    ENV = pm.fromScene(es, 0.03).texture;
    var es2 = new THREE.Scene(); es2.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
      vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: ['varying vec3 vD;', 'void main() {', '  vec3 d = normalize(vD); float h = d.y, az = atan(d.z, d.x);',           // a room: pale ceiling, darker floor, a band of window light round the walls
        '  vec3 c = mix(vec3(0.50, 0.48, 0.45), vec3(0.24, 0.21, 0.18), smoothstep(0.0, -0.7, h)); c = mix(c, vec3(0.62, 0.61, 0.58), smoothstep(0.15, 0.9, h));',
        '  c += vec3(1.0, 0.97, 0.92) * 2.2 * pow(max(0.0, 1.0 - abs(h - 0.1) * 2.6), 3.0) * (0.35 + 0.65 * pow(0.5 + 0.5 * sin(az * 3.0), 2.0));',
        '  gl_FragColor = vec4(c, 1.0);', '  #include <tonemapping_fragment>', '  #include <encodings_fragment>', '}'].join('\n') })));
    ENVIN = pm.fromScene(es2, 0.05).texture; pm.dispose();
  } catch (e) { /* no reflection map: the plain sky light stays as it was */ }
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshLambertMaterial({ color: new THREE.Color(0.095, 0.175, 0.06) }));       // linear colour: a full green under the sun, not a pale one
  patch(ground.material, 7);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -2.02; ground.receiveShadow = true;
  scene.add(ground);
  (function () {                                            // a far line of woods all round, so windows and the horizon show more than lawn: each tree a crown with smaller lumps on its upper half
    var n = 300, mt = new THREE.MeshLambertMaterial({ color: 0xffffff }), sd = 5, r = function () { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    var M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color(), kb = 0, kl = 0;
    var g0 = new THREE.IcosahedronGeometry(1, 0); g0.setAttribute('normal', g0.attributes.position.clone());       // round shading on the low-detail lumps
    patch(mt, 10); var body = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mt, n), lump = new THREE.InstancedMesh(g0, mt, n * 6);
    for (var i = 0; i < n; i++) {
      var a = r() * 6.283, d = 760 + r() * 520, R = 15 + r() * 15, x = Math.cos(a) * d + 30, z = Math.sin(a) * d - 20, tall = 0.9 + r() * 0.55, cy = -2 + R * tall * 0.78;
      var c0 = 0.07 + r() * 0.03, c1 = 0.118 + r() * 0.045, c2 = 0.078 + r() * 0.025;
      P.set(x, cy, z); S.set(R, R * tall, R); Q.setFromEuler(E.set(0, r() * 6.283, 0)); M.compose(P, Q, S); body.setMatrixAt(kb, M); body.setColorAt(kb++, C.setRGB(c0, c1, c2));
      for (var j = 0; j < 6; j++) {
        var an = r() * 6.283, el = 0.1 + r() * 1.25, rr = R * (0.36 + r() * 0.3), f = 0.78 + r() * 0.2, v = 0.86 + r() * 0.3;
        P.set(x + Math.cos(an) * Math.cos(el) * R * f, cy + Math.sin(el) * R * tall * f, z + Math.sin(an) * Math.cos(el) * R * f); S.set(rr, rr * (0.72 + r() * 0.3), rr);
        Q.setFromEuler(E.set(r() * 3, r() * 6.283, r() * 3)); M.compose(P, Q, S); lump.setMatrixAt(kl, M); lump.setColorAt(kl++, C.setRGB(c0 * v, c1 * v, c2 * v));
      }
    }
    body.frustumCulled = false; lump.frustumCulled = false; scene.add(body); scene.add(lump);
  })();
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
  var leafTex = (function () {                           // a spray of leaves on each card, so a crown reads as foliage instead of paper squares
    var c = document.createElement('canvas'); c.width = 128; c.height = 80; var x = c.getContext('2d'), sd = 11, r = function () { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    for (var i = 0; i < 13; i++) {
      var cx = 14 + r() * 100, cy = 12 + r() * 56, an = r() * 6.283, L = 15 + r() * 9, W = L * (0.36 + r() * 0.16), g = Math.round(196 + r() * 59);
      x.save(); x.translate(cx, cy); x.rotate(an);
      x.fillStyle = 'rgb(' + g + ',' + g + ',' + Math.round(g * 0.94) + ')'; x.beginPath(); x.moveTo(-L, 0); x.quadraticCurveTo(0, -W, L, 0); x.quadraticCurveTo(0, W, -L, 0); x.fill();
      x.strokeStyle = 'rgba(110,110,100,0.5)'; x.lineWidth = 1; x.beginPath(); x.moveTo(-L, 0); x.lineTo(L, 0); x.stroke(); x.restore();
    }
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
  })();
  var CARD = new THREE.PlaneGeometry(1, 0.62), cardMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, map: leafTex, alphaTest: 0.4 }), cardDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.4 }), cM = new THREE.Matrix4(), cQ = new THREE.Quaternion(), cE = new THREE.Euler(), cP = new THREE.Vector3(), cS = new THREE.Vector3(), cC = new THREE.Color();
  /* Surface patterns, drawn in the shader from world position so no textures are needed: brick, lap siding, stone, shingles, floor planks, tile, lawn, concrete, wood grain.
     Each material has its own pattern number and second colour; a look can change both. Lines fade to their average where they would be smaller than a pixel, so nothing shimmers. */
  var PATN = { brick: 1, lap: 2, shiplap: 2, stone: 3, shingle: 4, shingle90: 4, plank: 5, tile: 6, lawn: 7, conc: 8, woodv: 9, woodh: 9, woodf: 9 };
  var BASEPAT = { stone: 3, bsplash: 14, walnut: 9, shingle: 4, shingle90: 4, oak: 5, lvp: 5, tile: 6, tiled: 6, grass: 7, drive: 8, conc: 8, found: 8, bwall: 8, wood: 9, woodv: 9, deck: 9, oakf: 9, gdoor: 9, edoor: 9, post: 9, shiplap: 2, lumber: 9,
    quartz: 11, linen: 12, linen2: 12, slate: 12, rust: 12, sage: 12, bedding: 12, towel: 12, carpet: 12, rugc: 13, rugb: 13, jute: 13 };
  var PATHEAD = [
    'varying vec3 vWp;', 'uniform vec3 uC2;', 'uniform float uLv[4];',
    'float pH = 0.0;', 'float pRo = 0.0;', 'vec3 pNo = vec3(0.0);',                                                            // height (for the relief the highlights follow) and roughness change of the pattern at this point
    'float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
    'float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }',
    'float jl(float f, float w, float j) { return mix(min(clamp((j - f) / w + 0.5, 0.0, 1.0) + clamp((f - 1.0) / w + 0.5, 0.0, 1.0), 1.0), j, smoothstep(0.35, 0.9, w)); }'].join('\n');      // a joint of width j at the start of each unit, filtered to the pixel
  /* The pattern is chosen when the material is compiled (PAT), so a plain painted surface costs nothing extra and each patterned one runs only its own few lines.
     Fine detail (grain, weave, veins) fades out where it would be smaller than a pixel. */
  var PATBODY = [
    '#if PAT > 0',
    '{',
    '  vec3 fn = normalize(cross(dFdx(vWp), dFdy(vWp)));',
    '  bool up = abs(fn.y) < 0.5;',
    '  float hu = abs(fn.x) > abs(fn.z) ? vWp.z : vWp.x;',
    '  vec2 sq = up ? vec2(hu, vWp.y) : vWp.xz;',
    '  float px = max(max(fwidth(sq.x), fwidth(sq.y)), 1e-5);',                                        // feet per pixel here
    '#if PAT == 1',                                                                                    // brick, running bond: every brick its own tone, a few burnt ones, sandy face, recessed mortar
    '  if (up) {',
    '    float u0 = hu / 0.67, bv = vWp.y / 0.25, row = floor(bv), bu = u0 + 0.5 * mod(row, 2.0);',
    '    float wu = max(fwidth(u0), 1e-4), wv = max(fwidth(bv), 1e-4), vis = 1.0 - smoothstep(0.3, 0.8, max(wu, wv));',
    '    float id = h21(vec2(row, floor(bu))), tone = 0.80 + 0.36 * id, sp = vn(sq * 46.0) * (1.0 - smoothstep(0.004, 0.02, px));',
    '    float jt = 1.0 - (1.0 - jl(fract(bv), wv, 0.14)) * (1.0 - jl(fract(bu), max(wu, wv), 0.055));',
    '    vec3 bc = diffuseColor.rgb * mix(1.0, tone * (0.93 + 0.14 * sp), vis); bc = mix(bc, bc * vec3(0.78, 0.86, 1.0), step(0.84, id) * vis * 0.6);',
    '    diffuseColor.rgb = mix(bc, uC2, jt * 0.8); pH = -jt * 0.008 * vis; pRo = jt * 0.1;',
    '  }',
    '#elif PAT == 2',                                                                                  // lap siding: 6 in. courses, a shadow line under each lap
    '  if (up) {',
    '    float bv = vWp.y / 0.5, wv = max(fwidth(bv), 1e-4), fv = fract(bv), vis = 1.0 - smoothstep(0.3, 0.8, wv);',
    '    float gr = vn(vec2(hu * 1.3, vWp.y * 34.0)) * (1.0 - smoothstep(0.006, 0.03, px));',
    '    diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 + 0.05 * (0.5 - fv) * vis) * (0.975 + 0.05 * gr), uC2, jl(1.0 - fv, wv, 0.11) * 0.85);',
    '  }',
    '#elif PAT == 3',                                                                                  // stacked stone: thin courses of mixed length, each stone its own tone and rough face
    '  if (up) {',
    '    float bv = vWp.y / 0.36, row = floor(bv), rs = h21(vec2(row, 3.0)), u0 = hu / (0.95 + 0.9 * rs) + rs * 5.0, wu = max(fwidth(u0), 1e-4), wv = max(fwidth(bv), 1e-4);',
    '    float id = floor(u0), vis = 1.0 - smoothstep(0.3, 0.8, max(wu, wv)), tone = h21(vec2(row * 7.0 + 1.0, id));',
    '    float sp = (vn(sq * 9.0) * 0.6 + vn(sq * 31.0) * 0.4) * (1.0 - smoothstep(0.01, 0.05, px));',
    '    vec3 st = mix(diffuseColor.rgb, uC2, tone * 0.7 * vis + 0.3 * (1.0 - vis)) * (0.88 + 0.26 * sp);',
    '    float jt = 1.0 - (1.0 - jl(fract(bv), wv, 0.075)) * (1.0 - jl(fract(u0), max(wu, wv), 0.03));',
    '    diffuseColor.rgb = mix(st, uC2 * 0.45, jt * 0.85); pH = (tone * 0.012 - jt * 0.016) * vis; pRo = 0.06;',
    '  }',
    '#elif PAT == 4',                                                                                  // roof shingles: rows down the slope, staggered tabs, granules
    '  float sn = sqrt(max(1.0 - fn.y * fn.y, 0.0));',
    '  if (sn > 0.08 && abs(fn.y) > 0.2) {',
    '    vec3 ev = normalize(vec3(fn.z, 0.0, -fn.x));',
    '    float bv = vWp.y / (sn * 0.46), row = floor(bv), u0 = dot(vWp, ev) + 0.5 * mod(row, 2.0), wv = max(fwidth(bv), 1e-4), wu = max(fwidth(u0), 1e-4);',
    '    float vis = 1.0 - smoothstep(0.3, 0.8, max(wu, wv)), tone = 0.82 + 0.34 * h21(vec2(row, floor(u0))), gr = vn(vWp.xz * 40.0) * (1.0 - smoothstep(0.005, 0.03, px));',
    '    diffuseColor.rgb = mix(diffuseColor.rgb * mix(1.0, tone * (0.93 + 0.14 * gr), vis), uC2, max(jl(fract(bv), wv, 0.13), jl(fract(u0), max(wu, wv), 0.05) * 0.6) * 0.75);',
    '  }',
    '#elif PAT == 5',                                                                                  // wide-plank floor: 7 in. boards of mixed length, each with its own tone and grain; fine bevels between them
    '  if (!up) {',
    '    float bv = vWp.z / 0.58, row = floor(bv), rs = h21(vec2(row, 9.0)), u0 = vWp.x / 6.5 + rs * 7.0, id = floor(u0), wv = max(fwidth(bv), 1e-4), wu = max(fwidth(u0), 1e-4);',
    '    float vis = 1.0 - smoothstep(0.3, 0.8, wv), b1 = h21(vec2(row, id)), b2 = h21(vec2(id + 3.0, row * 1.7)), fine = 1.0 - smoothstep(0.008, 0.04, px);',
    '    vec2 gp = vec2(vWp.x * 0.5 + b1 * 37.0, vWp.z * 24.0 + b2 * 11.0);',
    '    float g1 = vn(gp), g2 = vn(vec2(gp.x * 0.4 + 5.0, gp.y * 0.2 + g1 * 1.6)), g3 = vn(vec2(gp.x * 2.3, gp.y * 3.1)), grain = g1 * 0.45 + g2 * 0.4 + g3 * 0.15;',
    '    vec3 wood = diffuseColor.rgb * (0.87 + 0.24 * b1) * mix(1.0, 0.86 + 0.28 * grain, fine); wood = mix(wood, wood * vec3(1.05, 0.985, 0.9), b2 * 0.6);',
    '    float jt = max(jl(fract(bv), wv, 0.022), jl(fract(u0), wu, 0.0032));',
    '    diffuseColor.rgb = mix(mix(diffuseColor.rgb, wood, vis), uC2, jt * 0.62); pH = (-jt * 0.0025 + grain * 0.0016 * fine) * vis; pRo = (grain - 0.5) * 0.14 * fine * vis;',
    '  }',
    '#elif PAT == 6',                                                                                  // tile, 12 x 24: soft clouding in each tile, grout a little lower and duller
    '  vec2 q = up ? vec2(hu / 2.0, vWp.y) : vec2(vWp.x / 2.0, vWp.z); q.x += 0.5 * mod(floor(q.y), 2.0);',
    '  vec2 w = max(fwidth(q), vec2(1e-4));',
    '  float vis = 1.0 - smoothstep(0.3, 0.8, max(w.x, w.y)), tid = h21(floor(q)), cl = vn(q * vec2(5.0, 2.5) + tid * 9.0) * 0.6 + vn(q * vec2(13.0, 6.5) + tid * 5.0) * 0.4;',
    '  float jt = max(jl(fract(q.y), w.y, 0.02), jl(fract(q.x), w.x, 0.01));',
    '  diffuseColor.rgb = mix(diffuseColor.rgb * mix(1.0, (0.95 + 0.08 * tid) * (0.94 + 0.12 * cl), vis), uC2, jt * 0.8); pH = -jt * 0.004 * vis; pRo = jt * 0.3 - 0.05 * cl * vis;',
    '#elif PAT == 7',                                                                                  // lawn: mottled, sun-dried patches, faint mowing stripes, blades up close
    '  float n = vn(vWp.xz * 0.07) * 0.45 + vn(vWp.xz * 0.6) * 0.3 + vn(vWp.xz * 5.0) * 0.25;',
    '  float bl = (vn(vWp.xz * vec2(41.0, 33.0)) * 0.6 + vn(vWp.xz * vec2(17.0, 23.0)) * 0.4) * (1.0 - smoothstep(0.01, 0.07, px));',
    '  vec3 dry = diffuseColor.rgb * vec3(1.38, 1.14, 0.6);',
    '  diffuseColor.rgb = mix(diffuseColor.rgb, dry, smoothstep(0.5, 0.9, vn(vWp.xz * 0.021 + 5.0)) * 0.3) * (0.76 + 0.46 * n) * (1.0 + 0.05 * sin(vWp.x * 0.52)) * (0.86 + 0.28 * bl);',
    '#elif PAT == 8',                                                                                  // concrete: soft blotches and a fine broom finish
    '  diffuseColor.rgb *= 0.92 + 0.13 * vn(sq * 0.4) + 0.05 * vn(sq * vec2(3.0, 42.0)) * (1.0 - smoothstep(0.01, 0.05, px));',
    '#elif PAT == 9',                                                                                  // wood grain along the piece
    '  vec2 q = up ? vec2(hu * 11.0, vWp.y * 0.8) : vec2(vWp.x * 0.8, vWp.z * 11.0);',
    '  float g1 = vn(q), g2 = vn(q * vec2(0.37, 2.3) + 4.0), g3 = vn(q * 3.0) * (1.0 - smoothstep(0.004, 0.02, px));',
    '  diffuseColor.rgb *= 0.82 + 0.34 * g1 * g2 + 0.07 * g3; pRo = (g1 - 0.5) * 0.1;',
    '#elif PAT == 10',                                                                                 // foliage: leafy mottling over the canopy shapes
    '  float n = vn(vec2(vWp.x + vWp.z, vWp.y) * 0.8) * 0.45 + vn(vec2(vWp.x - vWp.z, vWp.y * 1.3) * 2.4) * 0.35 + vn(vWp.xz * 6.0 + vWp.y * 3.0) * 0.2;',
    '  diffuseColor.rgb *= 0.5 + 0.85 * n;',
    '#elif PAT == 11',                                                                                 // veined stone tops: a few soft grey veins wandering across a pale slab
    '  float w1 = vn(sq * 0.9 + 3.0), w2 = vn(sq * 2.3 + 11.0), fade = 1.0 - smoothstep(0.012, 0.07, px);',
    '  float va = abs(vn(sq * 0.55 + vec2(w1 * 1.6, w2 * 1.2)) - 0.5) * 2.0, vb = abs(vn(sq * 1.7 + vec2(w2 * 1.1, w1 * 2.0) + 7.0) - 0.5) * 2.0;',      // (short names like v1 or r1 are taken by the reflection code)
    '  float vein = smoothstep(0.11, 0.0, va) * (0.35 + 0.65 * w2) * 0.55 + smoothstep(0.06, 0.0, vb) * w1 * 0.22;',
    '  diffuseColor.rgb = mix(diffuseColor.rgb * (0.965 + 0.06 * w1), uC2 * 1.25, clamp(vein, 0.0, 0.7) * fade); pRo = -0.06;',
    '#elif PAT == 12',                                                                                 // cloth: a soft heather and, up close, the weave
    '  float wv2 = (vn(sq * vec2(160.0, 64.0)) * 0.5 + vn(sq * vec2(64.0, 160.0)) * 0.5) * (1.0 - smoothstep(0.0025, 0.012, px));',
    '  diffuseColor.rgb *= 0.93 + 0.09 * vn(sq * 3.7) + 0.16 * (wv2 - 0.5); pRo = 0.12;',
    '#elif PAT == 13',                                                                                 // rug: a worn trellis of diamonds in the second tone over a soft pile
    '  if (!up) {',
    '    float fade = 1.0 - smoothstep(0.03, 0.2, px); vec2 d = abs(fract(vWp.xz * 0.55 + 0.25) - 0.5);',
    '    float tre = 1.0 - smoothstep(0.03, 0.07, abs(d.x + d.y - 0.5)), wear = 0.5 + 0.5 * vn(vWp.xz * 1.3), pile = vn(vWp.xz * 70.0) * (1.0 - smoothstep(0.004, 0.02, px));',
    '    diffuseColor.rgb = mix(diffuseColor.rgb, uC2, tre * 0.5 * wear * fade) * (0.9 + 0.1 * vn(vWp.xz * 0.9)) * (0.93 + 0.14 * pile); pRo = 0.2;',
    '  }',
    '#elif PAT == 14',                                                                                 // backsplash: small glazed tiles in a running bond
    '  if (up) {',
    '    vec2 q = vec2(hu / 0.83, vWp.y / 0.25); q.x += 0.5 * mod(floor(q.y), 2.0); vec2 w = max(fwidth(q), vec2(1e-4));',
    '    float vis = 1.0 - smoothstep(0.3, 0.8, max(w.x, w.y)), tid = h21(floor(q)), jt = max(jl(fract(q.y), w.y, 0.05), jl(fract(q.x), w.x, 0.015));',
    '    diffuseColor.rgb = mix(diffuseColor.rgb * mix(1.0, 0.94 + 0.1 * tid, vis), uC2 * 1.5, jt * 0.6); pH = -jt * 0.004 * vis; pRo = jt * 0.4 - 0.08;',
    '  }',
    '#endif',
    '#if PAT == 1 || PAT == 3 || PAT == 5 || PAT == 6 || PAT == 14',                                 // the pattern's relief tilts the surface a little (worked out here in world space), so highlights and reflections break at joints and follow the grain
    '  { float hx = dFdx(pH), hy = dFdy(pH); vec3 dpx = dFdx(vWp), dpy = dFdy(vWp), ta = cross(dpy, fn), tb = cross(fn, dpx); float det = dot(dpx, ta);',
    '    if (abs(det) > 1e-10) pNo = normalize(abs(det) * fn - sign(det) * (hx * ta + hy * tb)) - fn; }',
    '#endif',
    '}',
    '#endif',
    '#ifdef LVAO',                                                                                     // indoors: walls, cabinets and furniture darken a little where they meet the floor
    '{ vec3 f2 = normalize(cross(dFdx(vWp), dFdy(vWp)));',
    '  if (abs(f2.y) < 0.5) { float d = 9.0; for (int i = 0; i < 4; i++) { float e = vWp.y - uLv[i]; if (e > -0.05) d = min(d, e); }',
    '    diffuseColor.rgb *= mix(0.74, 1.0, smoothstep(0.0, 1.3, d)); } }',
    '#endif'].join('\n');
  var PATROUGH = '#if PAT > 0\n  roughnessFactor = clamp(roughnessFactor + pRo, 0.06, 1.0);\n#endif';
  var PATBUMP = '#if PAT == 1 || PAT == 3 || PAT == 5 || PAT == 6 || PAT == 14\n  normal = normalize(normal + (viewMatrix * vec4(pNo, 0.0)).xyz);\n#endif';
  function setPat(mat, code) { if (mat.defines.PAT !== code) { mat.defines.PAT = code; mat.needsUpdate = true; } }
  var INSIDE = { wall: 1, trim: 1, cabw: 1, cabd: 1, oakf: 1, shiplap: 1, tile: 1, bwall: 1, linen: 1, linen2: 1 }, NOLV = { value: [-99, -99, -99, -99] };
  function patch(mat, code, c2, lv) {                   // give a material its pattern and second colour (a look can change both); lv: floor levels for the indoor base shading
    mat.defines = mat.defines || {}; mat.defines.PAT = code || 0; if (lv) mat.defines.LVAO = ''; mat.userData.lv = lv || NOLV;
    mat.userData.c2 = { value: c2 || mat.color.clone().multiplyScalar(0.5) };
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uC2 = mat.userData.c2; sh.uniforms.uLv = mat.userData.lv;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nvWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#else\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + PATHEAD).replace('#include <color_fragment>', '#include <color_fragment>\n' + PATBODY)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + PATROUGH).replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + PATBUMP)
        .replace('#include <lights_fragment_begin>', '#include <lights_fragment_begin>\n#ifdef BAKED\n  reflectedLight.directDiffuse = vec3(0.0); reflectedLight.directSpecular = vec3(0.0); irradiance = vec3(0.0);\n#endif')
        .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n#ifdef BAKED\n  iblIrradiance = vec3(0.0);\n#endif');
    };
  }
  var OUTK = 1;                                           // how much brighter the outdoors is shown (1 in the model view, more from inside)
  function outdoor(k) {
    OUTK = k; dome.material.uniforms.uGain.value = k; sun.intensity = 1.2 * k;
    Object.keys(built).map(function (n) { return built[n]; }).concat(side ? [side] : []).forEach(function (B) { (B.lm0 || []).forEach(function (mt) { mt.lightMapIntensity = B.lmax * k; }); });
  }
  var IVORY = new THREE.Color(0.74, 0.71, 0.65);
  function rugTone(mt) { var acc = mt.color.clone(); mt.color.copy(IVORY).lerp(acc, 0.22); mt.userData.c2.value.copy(IVORY).lerp(acc, 0.72); }      // the accent colour becomes the pattern of a pale rug
  var lmPending = 0;                                      // lightmap pages still on their way
  function smoothNormals(g) {                             // rounded shapes: one normal per place, shared across the seams of the lightmap patches
    var p = g.attributes.position.array, ix = g.index.array, n = p.length / 3, acc = {}, nr = new Float32Array(p.length), key = new Array(n), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), i, k;
    for (i = 0; i < n; i++) key[i] = Math.round(p[3 * i] * 200) + '_' + Math.round(p[3 * i + 1] * 200) + '_' + Math.round(p[3 * i + 2] * 200);
    for (i = 0; i < ix.length; i += 3) {
      a.fromArray(p, 3 * ix[i]); b.fromArray(p, 3 * ix[i + 1]); c.fromArray(p, 3 * ix[i + 2]); b.sub(a); c.sub(a); b.cross(c);
      for (k = 0; k < 3; k++) { var e = acc[key[ix[i + k]]] || (acc[key[ix[i + k]]] = [0, 0, 0]); e[0] += b.x; e[1] += b.y; e[2] += b.z; }
    }
    for (i = 0; i < n; i++) { var v = acc[key[i]] || [0, 1, 0], l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; nr[3 * i] = v[0] / l; nr[3 * i + 1] = v[1] / l; nr[3 * i + 2] = v[2] / l; }
    g.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
  }
  var DEC4 = (function () { var T = new Uint8Array(128), k = 0; for (var c = 0x20; c < 0x7f; c++) if (c !== 0x22 && c !== 0x5c && c !== 0x7d && c !== 0x7e) T[c] = k++; return T; })();
  function decode4(s) {                                  // one character a byte; the larger values take two (a marker, then the rest)
    var n = s.length, out = new Uint8Array(n), k = 0, i = 0, c;
    while (i < n) { c = s.charCodeAt(i++); if (c === 0x7e) out[k++] = 91 + DEC4[s.charCodeAt(i++)]; else if (c === 0x7d) out[k++] = 182 + DEC4[s.charCodeAt(i++)]; else out[k++] = DEC4[c]; }
    return out.buffer;
  }
  var MORE = {}, moreWait = {}, morePending = 0;         // second files on their way, and the built models waiting for each
  function build(name) {
    var m = MODELS[name], root = new THREE.Group(), layers = {}, solid = [], caps = [], wallColor = null, sty = {}, styled = {}, glasses = [], plants = [], streets = [], walks = [], concMat = null, lvs = { value: [m.meta.bsmt ? m.meta.bsmt.zb : -99, 0, m.meta.zf2 || -99, m.meta.zf3 || -99] };
    Object.keys(m.meta.styles || {}).forEach(function (st) { Object.keys(m.meta.styles[st]).forEach(function (k) { styled[k] = true; }); });      // materials an exterior style recolors
    function layer(k) { if (!layers[k]) { layers[k] = new THREE.Group(); root.add(layers[k]); } return layers[k]; }
    var fires = [];
    var lmw = {}, lm0 = [], lmt = {};                                                               // materials waiting for each lightmap page; the pages that have arrived
    function unz(a, off, cnt, wide) {                                           // running sums of zigzag deltas: back to the stored values, in place
      for (var v = 0, k = off; k < off + cnt; k++) { var z = a[k]; v = v + ((z >>> 1) ^ -(z & 1)); v = wide ? v >>> 0 : v & 0xffff; a[k] = v; }
    }
    function lmApply(pg, list) {                                                // a light page on the parts that wait for it
      var t = lmt[pg.g];
      list.forEach(function (e) {
        var mt = e.mat; mt.lightMap = t; mt.lightMapIntensity = (m.meta.lmax || 4) * (pg.g === 0 ? OUTK : 1); mt.defines.BAKED = ''; delete mt.defines.LVAO; e.mesh.receiveShadow = false; if (pg.g === 0) lm0.push(mt);
        if (pg.g > 0 && ENVIN) { mt.envMap = ENVIN; mt.envMapIntensity = e.metal > 0.5 ? 1.0 : 0.6; } else if (ENV && !mt.envMap) { mt.envMap = ENV; mt.envMapIntensity = 0.3; }
        if (e.metal > 0.5) mt.metalness = Math.min(e.metal, 0.9);
        if (e.sty) { e.sty.env = mt.envMap; e.sty.k = mt.metalness; }
        mt.needsUpdate = true;
      });
    }
    function addParts(mm) {                                                     // the parts of one file: geometry, material, and their place in the model
    var buf = mm.enc === 4 ? decode4(mm.bin) : decode(mm.bin), planar = mm.enc === 2 || mm.enc === 4, uq = mm.uq || 0, fresh = {};
    mm.bin = null;                                                              // (the text is no longer needed once its bytes are out)
    mm.parts.forEach(function (p) {
      var g = new THREE.BufferGeometry(), n = p.pn / 3, q = new Uint16Array(buf, p.po, p.pn), pos = new Float32Array(p.pn), o = p.q, stp = o[3], i;
      if (planar) { unz(q, 0, n); unz(q, n, n); unz(q, 2 * n, n); for (i = 0; i < n; i++) { pos[3 * i] = o[0] + q[i] * stp; pos[3 * i + 1] = o[1] + q[n + i] * stp; pos[3 * i + 2] = o[2] + q[2 * n + i] * stp; } }
      else for (i = 0; i < n; i++) { pos[3 * i] = o[0] + q[3 * i] * stp; pos[3 * i + 1] = o[1] + q[3 * i + 1] * stp; pos[3 * i + 2] = o[2] + q[3 * i + 2] * stp; }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var ia = p.ix === 4 ? new Uint32Array(buf, p.io, p.inn) : new Uint16Array(buf, p.io, p.inn);
      if (planar) unz(ia, 0, p.inn, p.ix === 4);
      g.setIndex(new THREE.BufferAttribute(ia, 1));
      if (p.uo !== undefined) {
        var ua = new Uint16Array(buf, p.uo, n * 2);
        if (planar) { unz(ua, 0, n); unz(ua, n, n); var uw = new Uint16Array(n * 2); for (i = 0; i < n; i++) { uw[2 * i] = ua[i] << uq; uw[2 * i + 1] = ua[n + i] << uq; } ua = uw; }
        g.setAttribute('uv2', new THREE.BufferAttribute(ua, 2, true));
      }
      if (p.sm) smoothNormals(g);
      var water = p.mat === 'water', glass = p.alpha < 1 && !water, mat;
      if (p.emit) mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color[0], p.color[1], p.color[2]).multiplyScalar(1.0 + 1.6 * p.emit), side: THREE.DoubleSide });
      else mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.color[0], p.color[1], p.color[2]), roughness: Math.max(p.rough, 0.22), metalness: Math.min(p.metal, 0.2), flatShading: !p.sm, side: THREE.DoubleSide });
      if (glass) { mat.transparent = true; mat.depthWrite = false; }
      if (water) { mat.transparent = true; mat.opacity = 0.86; mat.roughness = 0.12; mat.color.setRGB(0.1, 0.5, 0.62); }
      if (!glass && !water && !p.emit) { patch(mat, BASEPAT[p.mat] || 0, null, INSIDE[p.mat] ? lvs : null); if (ENV && p.metal > 0.5) { mat.envMap = ENV; mat.envMapIntensity = 0.7; mat.metalness = Math.min(p.metal, 0.55); } }
      if (p.mat === 'mirror') { mat.color.setRGB(0.93, 0.95, 0.96); mat.metalness = 1; mat.roughness = 0.03; mat.envMap = ENVIN || ENV; mat.envMapIntensity = 1.1; }      // a mirror shows the (stand-in) room
      if (glass && p.mat === 'glassc') { mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transmission: 0.95, transparent: true, depthWrite: false, side: THREE.DoubleSide, flatShading: !p.sm, envMap: ENVIN || ENV, envMapIntensity: 1.5 }); }      // clear glass indoors: lamp globes, shower screens
      else if (glass) { mat.color.setRGB(0.045, 0.06, 0.07); mat.roughness = 0.04; mat.opacity = GLASS[0]; mat.envMap = ENV; mat.envMapIntensity = 2.2; glasses.push(mat); }
      var srec = null;
      if (p.mat === 'rugb' && mat.userData.c2) rugTone(mat);
      if (p.mat === 'mulch') mat.color.multiplyScalar(2.1);                                // bark mulch in the shade of the house reads as brown, not as a black strip
      if (styled[p.mat] && !p.emit) (sty[p.mat] = sty[p.mat] || []).push(srec = { m: mat, c: mat.color.clone(), r: mat.roughness, k: mat.metalness, p: mat.defines.PAT || 0, env: mat.envMap || null, rug: p.mat === 'rugb' });
      var mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = !glass && !water && !p.emit; mesh.receiveShadow = !glass && !p.emit;
      if (p.lm >= 0 && p.uo !== undefined && !glass && !water && !p.emit) { var le = { mat: mat, mesh: mesh, metal: p.metal, sty: srec }; (lmw[p.lm] = lmw[p.lm] || []).push(le); (fresh[p.lm] = fresh[p.lm] || []).push(le); }
      if (glass || water) mesh.renderOrder = 2;
      layer(p.layer).add(mesh);
      var lb = p.layer.split('@')[0];
      if (lb === 'SITE' || lb === 'GF' || lb === 'GS') {                                  // the sidewalk along the street, and the front walks (the suite add-on links to them)
        g.computeBoundingBox(); var bb = g.boundingBox;
        if (bb.max.x - bb.min.x > 300) streets.push(mesh); else if (p.mat === 'conc') { walks.push({ lay: lb, b: bb }); if (!concMat) concMat = mat; }
      }
      if (!glass && !water && lb !== 'SITE' && lb !== 'DOOR' && lb !== 'BJ' && lb !== 'BC' && lb.indexOf('POOL') !== 0) solid.push(mesh);     // what a tap can land on in the walkthrough
      if (p.mat === 'cap') caps.push({ m: mat, c: mat.color.clone() });                   // dark wall tops for the cutaway views
      if (p.mat === 'ember') { g.computeBoundingBox(); var eb = g.boundingBox; if (Math.max(eb.max.x - eb.min.x, eb.max.z - eb.min.z) < 9) fires.push({ x: (eb.min.x + eb.max.x) / 2, y: -(eb.min.z + eb.max.z) / 2, z: eb.min.y }); }      // a fireplace: what its room is viewed toward
      if (p.mat === 'wall' && !wallColor) wallColor = mat.color.clone();
    });
    (m.meta.lm || []).forEach(function (pg) { if (lmt[pg.g] && fresh[pg.g]) lmApply(pg, fresh[pg.g]); });      // pages already here light the new parts at once
    }
    addParts(m);
    var waiting = false;
    if (m.more) { if (MODELS_IN[name]) addParts(MODELS_IN[name]); else waiting = true; }
    var pages = (m.meta.lm || []).slice(), lmOn = false, lmGen = 0;
    function fetchPage(pg, then) {
      var gen = lmGen; lmPending++;
      new THREE.TextureLoader().load(pg.f, function (t) {
        lmPending--;
        if (gen !== lmGen) { t.dispose(); return; }                             // the plan was put away while this page was on its way
        t.encoding = THREE.sRGBEncoding; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
        t.onUpdate = function () { t.image = null; t.onUpdate = null; };        // once it is on the graphics card the picture itself is let go (phones are short of memory)
        lmt[pg.g] = t; lmApply(pg, lmw[pg.g] || []);
        dirty = true; if (then) then();
      }, undefined, function () { lmPending--; if (then && gen === lmGen) then(); });          // a page that does not arrive leaves its parts lit the plain way
    }
    function loadPages() {
      if (lmOn) return;
      lmOn = true;
      if (mode === 'walk' || pendingWalk || !pages.length || pages[0].g !== 0) pages.forEach(function (pg) { fetchPage(pg); });      // going straight indoors: every page at once
      else fetchPage(pages[0], function () { pages.slice(1).forEach(function (pg) { fetchPage(pg); }); });   // seen from outside first: the outside page, then the rooms
    }
    function dropPages() {                                                      // give the light pages back; the parts are lit the plain way until they return
      if (!lmOn) return;
      lmOn = false; lmGen++;
      Object.keys(lmt).forEach(function (g) { lmt[g].dispose(); delete lmt[g]; });
      Object.keys(lmw).forEach(function (g) { lmw[g].forEach(function (e) { if (e.mat.lightMap) { e.mat.lightMap = null; delete e.mat.defines.BAKED; e.mesh.receiveShadow = true; e.mat.needsUpdate = true; } }); });
      lm0.length = 0;
    }
    loadPages();
    var site = layer('SITE'), ico = new THREE.IcosahedronGeometry(1, 1), mats = {};
    var seed = 7, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    (m.meta.blobs || []).forEach(function (b) {
      var key = b[4];
      if (!mats[key]) { mats[key] = new THREE.MeshLambertMaterial({ color: new THREE.Color(GREEN[key] || 0x4a7a44).multiplyScalar(0.6) }); patch(mats[key], 10); }
      var s = new THREE.Mesh(ico, mats[key]);
      s.position.set(b[0], b[2], -b[1]); s.scale.set(b[3] * 0.84, b[3] * b[5] * 0.84, b[3] * 0.84); s.castShadow = true; s.receiveShadow = true;
      var nC = key === 'shrub' ? 70 : 170, im = new THREE.InstancedMesh(CARD, cardMat, nC), base = new THREE.Color(GREEN[key] || 0x4a7a44);
      for (var ci = 0; ci < nC; ci++) {
        var u = rnd() * 2 - 1, an = rnd() * 6.283, q = Math.sqrt(1 - u * u), d = (0.86 + rnd() * 0.34) / 0.84, sz = (key === 'shrub' ? 0.6 : 0.44) * (0.7 + rnd() * 0.6);
        cP.set(d * q * Math.cos(an), d * u, d * q * Math.sin(an)); cE.set(rnd() * 3.14, rnd() * 3.14, rnd() * 3.14); cQ.setFromEuler(cE); cS.set(sz, sz / (b[5] || 1), sz); cM.compose(cP, cQ, cS); im.setMatrixAt(ci, cM);
        cC.copy(base).multiplyScalar(0.6 + rnd() * 0.75); im.setColorAt(ci, cC);
      }
      im.castShadow = true; im.customDepthMaterial = cardDepth; s.add(im);
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
    var B = { root: root, layers: layers, meta: m.meta, nav: nav, solid: solid, solidOn: solid, ext: ext, caps: caps, wallColor: wallColor, pools: pools, sty: sty, gnd: gnd, glasses: glasses, plants: plants, streets: streets, walks: walks, concMat: concMat, lm0: lm0, lmax: m.meta.lmax || 4, loadPages: loadPages, dropPages: dropPages, fires: fires };
    if (waiting) {
      (moreWait[name] = moreWait[name] || []).push(function () { addParts(MODELS_IN[name]); if (!B.wallColor) B.wallColor = wallColor; moreIn(B); });
      loadMore(name);
    }
    return B;
  }
  function loadMore(name) {                             // the second file of a model: what is indoors
    if (MODELS_IN[name] || MORE[name]) return;
    MORE[name] = 1; morePending++;
    var tries = 0;
    (function get() {
      var sc = document.createElement('script'); sc.src = 'model-' + name + '-in.js';
      sc.onload = function () { morePending--; delete MORE[name]; var q = moreWait[name] || []; delete moreWait[name]; if (MODELS_IN[name]) q.forEach(function (f) { f(); }); };
      sc.onerror = function () { if (++tries < 3) setTimeout(get, 1500 * tries); else { morePending--; delete MORE[name]; } };      // without it the house stands unfurnished
      document.head.appendChild(sc);
    })();
  }
  function moreIn(B) {                                  // the indoor parts have joined a model: show them as the model is shown now
    if (B === cur) {
      applyVis(); applyStyle();
      if (mode === 'walk') { if (cur.wallColor) cur.caps.forEach(function (c) { c.m.color.copy(cur.wallColor); }); cur.glasses.forEach(function (g) { g.opacity = GLASS[1]; }); }
    } else if (B === side && cur) applyVis();
    dirty = true;
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
  var opt = { g: 'f', lk: '1', st: 'farm', b: 'u', su: '0' }, optsOpen = false;
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
    var m = cur.meta, sg = suiteOn() ? sideGeo() : null, xl = sg ? Math.min(m.xl, sg.cx) : m.xl, xr = m.xr, cx = (xl + xr) / 2, D = sg ? Math.max(m.D, sg.yb + 58) : m.D, k = Math.max(1, (xr - xl) / 60), z = lv().lift || 0, t = m.tower, low = m.stories === 1;
    if (kind === 'front' && sg) { var wd = xr - xl, ds = Math.max(150, (wd + 48) / 0.86); return { p: [cx - wd * 0.36, 58, ds * 0.84], t: [cx - wd * 0.04, 4, -(sg.yb + 30) / 2] }; }      // with the suite: from above the street on the court side, so the court, both garages and the suite show
    if (kind === 'front') return { p: [xr + 34 * k, 11, 98 * k], t: [cx + 0.5, low ? 10 : 14, -10] };
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
    if (kind === 'front' && suiteOn()) k = Math.min(k, 2.3);                             // the pair is framed from above already
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
    var m = cur.meta, cx = ((suiteOn() ? Math.min(m.xl, sideGeo().cx) : m.xl) + m.xr) / 2;
    sun.position.set(cx + 80, 150, 70 - m.D / 2); sun.target.position.set(cx, 0, -m.D / 2 - 12); sun.target.updateMatrixWorld();
  }
  function sideGeo() {                                  // where the add-on stands: at the back of the house's side-entry garage court
    var m = cur.meta, c = m.court || [m.xl - 32, -5, m.xl, 29], wing = m.gkind === 'wing';
    return { x0: c[2] + (wing ? 3 : 0), yb: c[3] - (wing ? 5 : 2), cx: c[0] };      // x0: its wall on the house side; yb: its front wall, set back behind the court; cx: the court's outer edge
  }
  function applySide() {                                // the in-law suite add-on: the house garage is entered from the side, off a court; the second garage stands at the back of that court, the suite behind it
    var onNow = suiteOn(), m = cur.meta, g = sideGeo();
    if (side) { if (onNow) { if (side.root.parent !== scene) scene.add(side.root); } else if (side.root.parent === scene) scene.remove(side.root); }
    cur.plants.forEach(function (o) { var p = o.userData.p; o.visible = !(onNow && p[0] < g.x0 + 9 && p[0] > g.x0 - 27 && p[1] > g.yb - 2 && p[1] < g.yb + 60); });      // planting that would stand where the second garage and the suite go
    if (!onNow) return;
    var s = side, sopt = { g: 's', lk: '0', st: opt.st, b: 'u', su: '1' }, hide = sideCut() ? s.cutHide : [];
    s.root.rotation.y = Math.PI / 2;                    // its garage door faces the street, across the court; the suite runs back from it
    s.root.position.set(g.x0, m.zg - s.meta.zg, -(24 + g.yb));      // its slab sits at the house's grade
    Object.keys(s.layers).forEach(function (k) {
      var at = k.indexOf('@'), base = at < 0 ? k : k.slice(0, at), on = hide.indexOf(base) < 0 && base !== 'GS' && base !== 'GF' && base !== 'CF';
      if (on && at >= 0) on = NAV.holds(k.slice(at + 1), sopt);
      s.layers[k].visible = on;
    });
    s.plants.forEach(function (o) { var p = o.userData.p; o.visible = !(p[0] < 0.5 && p[1] < 30); });      // its planting on the court and house sides gives way
    s.streets.forEach(function (o) { o.visible = false; });                       // one sidewalk along the street, the house's
    applyStyle(s);
  }
  function setSuite(on, move) {
    su = !!on; $('t-suite').setAttribute('aria-pressed', su ? 'true' : 'false');
    $('g-front').disabled = su && curName !== 'suite';                    // with the suite the garage is entered from the side, off the court it shares with the second garage
    if (su && curName !== 'suite' && garage !== 'side' && cur) setGarage('side', false);
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
          e.m.color.setRGB(v.color[0], v.color[1], v.color[2]); e.m.roughness = Math.max(v.rough, 0.22); e.m.metalness = Math.min(v.metal, 0.55); var wantEnv = e.m.lightMap ? e.m.envMap : (ENV && v.metal > 0.5 ? ENV : null); if (e.m.envMap !== wantEnv) { e.m.envMap = wantEnv; e.m.envMapIntensity = 0.7; e.m.needsUpdate = true; }
          if (e.m.userData.c2) { setPat(e.m, PATN[v.pat] || (e.p >= 11 ? e.p : 0)); if (v.c2) e.m.userData.c2.value.setRGB(v.c2[0], v.c2[1], v.c2[2]); else e.m.userData.c2.value.copy(e.m.color).multiplyScalar(0.5); if (e.rug) rugTone(e.m); }
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
    subEl.textContent = (suiteOn() ? 'Plus the in-law suite: the garage turns to a side-entry court, a second two-car garage stands at the back of it, and the suite sits behind that. 768 sq ft, 1 bed, 1 bath. ' : '') + (!cur.meta.bsmt ? 'One level on a slab, no steps anywhere. Attached two-car garage' : fin ? 'Includes ' + fmt(s.bsmt.fin) + ' sq ft of finished basement' : 'Plus ' + fmt(s.bsmt.total) + ' sq ft of unfinished basement') + '. Concept model, not for construction.';
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
      labelsEl.appendChild(d); tags.push({ el: d, v: new THREE.Vector3(side.root.position.x - l.y, l.z + 1.5 + side.root.position.y, side.root.position.z - l.x), w: 0 });
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
    if (g !== 'side' && su && curName !== 'suite' && cur && cur.meta.garage) g = 'side';
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
    if (booting || embed) return;                       // embedded in the design page: the page sets the address, not the model
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
    s.onload = function () {
      var fin = function () { var q = loading[name]; if (!q) return; delete loading[name]; loadingEl.hidden = Object.keys(loading).length === 0; q.forEach(function (f) { f(); }); };
      var mm = MODELS[name];
      if (mm && mm.more && !MODELS_IN[name] && (mode === 'walk' || pendingWalk)) { (moreWait[name] = moreWait[name] || []).push(fin); loadMore(name); setTimeout(function () { if (loading[name]) fin(); }, 12000); }      // straight indoors: wait for the furniture (not for ever)
      else fin();
    };
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
      var was = cur;
      cur = built[name]; curName = name; scene.add(cur.root);
      Object.keys(built).forEach(function (k) { if (built[k] !== cur && built[k] !== was) built[k].dropPages(); });      // light pages: this plan's and the last one's stay
      cur.loadPages();
      family = name.replace(/2$/, ''); ver = /2$/.test(name) ? 2 : 1; press('m-', family); press('ver-', String(ver));
      $('garage-grp').hidden = !cur.meta.garage; press('g-', garage); press('st-', opt.st); press('b-', opt.b);
      $('g-front').disabled = su && name !== 'suite';
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
      if (pendingQ) applyOpts(pendingQ);                                 // the options an address asks for go on before anyone walks in
      if (mode === 'walk' || pendingWalk) { pendingWalk = false; enterWalk(); }
      else { setLevel(level, false); go(homeView(), true); showPlate(); }
      setHash();
      if (su && !side && name !== 'suite') setSuite(true, false);       // the add-on stays on from plan to plan; its model loads the first time
      if (pendingQ) { var pq = pendingQ; pendingQ = null; applyQ(pq); }
    });
  }

  function resize() {
    var w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    var off = (mode === 'orbit' && optsOpen) ? Math.round(Math.min(dockEl.offsetHeight * 0.4, h * 0.28)) : 0;       // options open: slide the picture up so the house stays clear of the panel
    if (!off && embed && mode === 'orbit' && w > h) off = Math.round(Math.min(orbitUI.offsetHeight * 0.42, h * 0.16));      // embedded in a wide frame: lift the house clear of the buttons
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
    if (spot && !spot.look && !jumpNext && R.endYaw === null) {              // walked to by its button: arrive facing the room
      var rv0 = roomView(n, end.f, spot, [end.x, end.y]);
      if (rv0) { R.endYaw = rv0.yaw; if (rv0.pitch && R.endPitch === null) R.endPitch = rv0.pitch; }
    }
    if (jumpNext) {                                                          // asked for by address: stand there now, where the room shows best
      var rv = spot && !spot.look ? roomView(n, end.f, spot) : null;
      if (rv) { end = { f: end.f, x: rv.x, y: rv.y }; R.endYaw = rv.yaw; if (rv.pitch) R.endPitch = rv.pitch; }
      w.f = end.f; w.x = end.x; w.y = end.y; w.h = n.floorZ(end.f, end.x, end.y); w.route = null; w.settle = null; w.userLook = false;
      if (R.endYaw !== null) w.yaw = R.endYaw; w.pitch = R.endPitch != null ? R.endPitch : -0.05; ring.visible = false; placeCamera(); syncHud(); dirty = true;
      return true;
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
  function roomView(n, f, sp, at) {                                           // where to stand and which way to face to take in the most of a room and of what stands in it (at: stand here, choose the direction only)
    var r = sp.r; if (!r || r.length < 4) return null;
    var inR = function (x, y) { return x > r[0] + 0.7 && x < r[2] - 0.7 && y > r[1] + 0.7 && y < r[3] - 0.7 && n.isFree(f, x, y); };
    var area = (r[2] - r[0]) * (r[3] - r[1]), stuff = [], x, y, q, sx = 0, sy = 0, best = null;
    var others = (n.floors[f].spots || []).filter(function (o) { return o !== sp && o.r && o.r.length >= 4 && (o.r[2] - o.r[0]) * (o.r[3] - o.r[1]) < area; });
    for (x = r[0] + 1.1; x < r[2] - 1.1; x += 0.5) for (y = r[1] + 1.1; y < r[3] - 1.1; y += 0.5) {      // fixtures and furniture: floor nobody can stand on, clear of the walls and of the smaller rooms set into this one
      if (n.isFree(f, x, y)) continue;
      for (q = 0; q < others.length; q++) { var o = others[q].r; if (x > o[0] - 1.3 && x < o[2] + 1.3 && y > o[1] - 1.3 && y < o[3] + 1.3) break; }
      if (q === others.length) { stuff.push([x, y]); sx += x; sy += y; }
    }
    var fire = null, fz = n.floors[f].z;
    ((cur && cur.fires) || []).forEach(function (F) { if (F.x > r[0] - 1.5 && F.x < r[2] + 1.5 && F.y > r[1] - 1.5 && F.y < r[3] + 1.5 && F.z > fz - 1 && F.z < fz + 6) fire = F; });
    if (fire) {                                                                 // a room with a fireplace: stand well back from it, square to its wall, with nothing right at the eye
      var e4 = [fire.x - r[0], r[2] - fire.x, fire.y - r[1], r[3] - fire.y], wi = e4.indexOf(Math.min.apply(null, e4)), wn = [[-1, 0], [1, 0], [0, -1], [0, 1]][wi], cand = [];
      var pts = at ? [[at[0], at[1]]] : [];
      if (!at) for (x = r[0] + 0.8; x < r[2] - 0.75; x += 0.5) for (y = r[1] + 0.8; y < r[3] - 0.75; y += 0.5) if (inR(x, y)) pts.push([x, y]);
      pts.forEach(function (P) {
        var dx = fire.x - P[0], dy = fire.y - P[1], d = Math.sqrt(dx * dx + dy * dy); if (d < (at ? 4 : 8) || d > 24) return;
        var a = Math.atan2(dy, dx), sq = (dx * wn[0] + dy * wn[1]) / d, tight = 0, open = 0;
        for (var j = -2; j <= 2; j++) { var b = a + j * 0.22, vx = Math.cos(b), vy = Math.sin(b), fr = 0; while (fr < 6 && inR(P[0] + vx * (fr + 0.5), P[1] + vy * (fr + 0.5))) fr += 0.5; if (fr < 2) tight += 2 - fr; open += fr; }
        cand.push({ s: Math.min(d, 15) + 7 * sq - 5 * tight + 0.15 * open, x: P[0], y: P[1], yaw: a });
      });
      cand.sort(function (p1, p2) { return p2.s - p1.s; });
      if (!at && cur && cur.solidOn) {                                          // of the best few, the one with no lamp or plant standing in the way at eye height
        var rc = new THREE.Raycaster(), o3 = new THREE.Vector3(), d3 = new THREE.Vector3(), top = cand.slice(0, 14);
        rc.far = 8;
        top.forEach(function (c0) {
          var ez = n.floorZ(f, c0.x, c0.y) + (n.eye || 5.2);
          [-0.2, 0, 0.2].forEach(function (off) {
            o3.set(c0.x, ez, -c0.y); d3.set(Math.cos(c0.yaw + off), -0.04, -Math.sin(c0.yaw + off)).normalize(); rc.set(o3, d3);
            var h = rc.intersectObjects(cur.solidOn, false)[0];
            if (h) c0.s -= (8 - h.distance) * (off ? 1.2 : 2.2);
          });
        });
        top.sort(function (p1, p2) { return p2.s - p1.s; }); cand = top;
      }
      if (cand.length && (at || cand[0].s > 10)) return { x: cand[0].x, y: cand[0].y, yaw: cand[0].yaw };
    }
    if ((area < 215 || Math.min(r[2] - r[0], r[3] - r[1]) < 7.5) && area >= 24 && stuff.length >= 5) {      // a small or middling room: face what stands in it from as far back as the floor allows, looking down a little
      var tx = sx / stuff.length, ty = sy / stuff.length, bp = null, sh = Math.min(r[2] - r[0], r[3] - r[1]), m2 = Math.max(0.8, Math.min(1.8, sh * 0.16));
      if (/closet|dressing/i.test(sp.n || '') && sh >= 6.5) m2 = Math.min(2.6, sh / 2 - 0.6);      // rails of clothes hang two feet deep along a closet's walls (and nobody is stopped by them)
      if (at) bp = { x: at[0], y: at[1], s: Math.sqrt((at[0] - tx) * (at[0] - tx) + (at[1] - ty) * (at[1] - ty)) };
      else for (x = r[0] + m2; x < r[2] - m2 + 0.05; x += 0.4) for (y = r[1] + m2; y < r[3] - m2 + 0.05; y += 0.4) {      // (a step clear of the walls: a television or a mirror may hang there)
        if (!inR(x, y)) continue;
        var d2 = Math.min(Math.sqrt((x - tx) * (x - tx) + (y - ty) * (y - ty)), 7), nr = 9;
        for (q = 0; q < stuff.length; q++) { var ex = stuff[q][0] - x, ey = stuff[q][1] - y; nr = Math.min(nr, ex * ex + ey * ey); }      // not with a fixture or a rail of clothes right at the shoulder
        d2 += 1.2 * Math.min(Math.sqrt(nr), 2.2);
        if (!bp || d2 > bp.s) bp = { s: d2, x: x, y: y };
      }
      if (bp && (tx - bp.x) * (tx - bp.x) + (ty - bp.y) * (ty - bp.y) > 2.2) return { x: bp.x, y: bp.y, yaw: Math.atan2(ty - bp.y, tx - bp.x), pitch: area < 120 ? -0.2 : -0.1 };
    }
    var mb = Math.min(2.4, Math.max(0.7, Math.min(r[2] - r[0], r[3] - r[1]) * 0.2));
    var inB = function (x, y) { return x > r[0] + mb && x < r[2] - mb && y > r[1] + mb && y < r[3] - mb && n.isFree(f, x, y); };
    var c = at || n.nearest(f, (r[0] + r[2]) / 2, (r[1] + r[3]) / 2, 14) || [sp.x, sp.y];
    if (!at && !inR(c[0], c[1])) c = [sp.x, sp.y];
    if (!at && !inR(c[0], c[1])) return null;
    for (var k = 0; k < 32; k++) {
      var a = k * Math.PI / 16, ux = Math.cos(a), uy = Math.sin(a), bk = 0, cov = 0, tight = 0, seen = 0;
      if (!at) while (bk < 60 && inB(c[0] - ux * (bk + 0.4), c[1] - uy * (bk + 0.4))) bk += 0.4;        // back along the line toward the wall behind (not right against it: rails of clothes and shelves hang there)
      var px = c[0] - ux * bk, py = c[1] - uy * bk;
      for (var j = -3; j <= 3; j++) {                                           // how much open floor of the room lies in view from there
        var b = a + j * 0.19, vx = Math.cos(b), vy = Math.sin(b), d = 0;
        while (d < 60 && inR(px + vx * (d + 0.5), py + vy * (d + 0.5))) d += 0.5;
        cov += d * (j === 0 ? 1.6 : 1);
        if (j >= -2 && j <= 2 && d < 2) tight += 2 - d;                         // something stands right against the eye on that side
      }
      for (q = 0; q < stuff.length; q++) {                                      // and how much of what stands in the room
        var dx = stuff[q][0] - px, dy = stuff[q][1] - py, dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < 2.2 || dd > 18) continue;
        var da = Math.abs(Math.atan2(dy, dx) - a); if (da > Math.PI) da = 2 * Math.PI - da;
        if (da < 0.5) seen += (da < 0.28 ? 1 : 0.55) * Math.min(1, 6 / dd);
      }
      var sc = cov + Math.min(seen * 1.1, cov * 0.9) - tight * 5;              // what stands in the room counts, but only with open floor in front of the eye (not the roof of the car one stands behind)
      if (!best || sc > best.s) best = { s: sc, c: cov, a: a, x: px, y: py };
    }
    return best && best.c > (at ? 4 : 9) ? { x: best.x, y: best.y, yaw: best.a } : null;
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
    outdoor(1.55); hemi.groundColor.setHex(0xd2ccc0); hemi.intensity = 0.8; fillA.intensity = 0.24; fillB.intensity = 0.14; fillC.intensity = 0.26; lamp.intensity = 0.42;
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
    outdoor(1); hemi.groundColor.setHex(0x8b8f7c); hemi.intensity = 0.72; fillA.intensity = 0; fillB.intensity = 0; fillC.intensity = 0; lamp.intensity = 0;
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
  var lastDraw = 0, streak = 0, slowN = 0, pxr = renderer.getPixelRatio();
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
      if (dirty) {
        dirty = false; renderer.render(scene, camera); if (mode !== 'walk') placeTags();
        var gap = now - lastDraw; lastDraw = now;
        if (gap < 250 && !window.__keepSharp) {                             // drawn back to back: someone is moving through the house
          streak++; if (gap > 42) slowN++;
          if (streak >= 24) { if (slowN >= 18 && pxr > 1) { pxr = Math.max(1, pxr - 0.34); renderer.setPixelRatio(pxr); resize(); dirty = true; } streak = 0; slowN = 0; }
        } else { streak = 0; slowN = 0; }
      }
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
  var embed = false, pendingQ = null, jumpNext = false;
  function parseHash() {                                // #plan-3560-with-suite/st=farm,lv=main,lk=0,g=s,b=f,v=front,room=Kitchen,e=1 : everything after the slash is optional
    var m = /^#(plan|walk)-(3928v2|2792v2|3560v2|ranchv2|3928|2792|3560|ranch|1856|1420|suite)(-with-suite)?(?:\/(.*))?$/.exec(location.hash || ''), q = null;
    if (m && m[4]) { q = {}; m[4].split(',').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) { try { q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* a broken value is skipped */ } } }); }
    return m ? { walk: m[1] === 'walk', name: NAME[m[2]], su: !!m[3] && m[2] !== 'suite', q: q } : null;
  }
  function optsDiffer(q) {
    return !!q && !!cur && !!((q.st && q.st !== opt.st && $('st-' + q.st)) || (q.g && cur.meta.garage && (q.g === 's' ? 'side' : 'front') !== garage) ||
      (q.b && cur.meta.bsmt && q.b !== opt.b) || (q.lk && !cur.meta.notower && q.lk !== opt.lk));
  }
  function applyOpts(q) {                               // look, garage, basement and lookout: set while the model is seen from outside
    if (!q || !cur) return;
    if (q.st && q.st !== opt.st && $('st-' + q.st)) setStyle(q.st, false);
    if (q.g && cur.meta.garage) { var gg = q.g === 's' ? 'side' : 'front'; if (gg !== garage) setGarage(gg, false); }
    if (q.b && cur.meta.bsmt && q.b !== opt.b) setBasement(q.b, false);
    if (q.lk && !cur.meta.notower && q.lk !== opt.lk) setLookout(q.lk === '1', false);
  }
  function applyQ(q) {                                  // put the model in the state the address asks for
    if (!q || !cur) return;
    if (q.e === '1' && !embed) { embed = true; document.body.classList.add('embed'); }
    if (embed) resize();
    if (optsDiffer(q)) { var wk = mode === 'walk'; if (wk) { backTo = ''; exitWalk(); } applyOpts(q); if (wk) enterWalk(); }
    if (mode === 'walk') {
      if (q.room) q.room.split('|').some(function (nm) {
        return cur.nav.floors.some(function (F, f) {
          if (!F.on) return false;
          return F.spots.some(function (sp) { if (sp.n !== nm) return false; tab = f; buildChips(); jumpNext = true; try { startRoute({ f: f, x: sp.x, y: sp.y }, sp); } finally { jumpNext = false; } return true; });
        });
      });
      return;
    }
    var lvId = q.lv && levelsOn().some(function (L) { return L.id === q.lv; }) ? q.lv : null;
    if (lvId) setLevel(lvId, false);
    go(q.v === 'back' || q.v === 'above' || q.v === 'garage' || q.v === 'front' ? q.v : homeView());
  }
  window.addEventListener('hashchange', function () {
    var h = parseHash();
    if (!h) return;
    if (h.name !== 'suite' && h.su !== su) { if (h.name !== curName) su = h.su; else setSuite(h.su, true); }
    if (h.name !== curName) { if (!h.walk && mode === 'walk') { backTo = ''; exitWalk(); } pendingWalk = h.walk && mode !== 'walk'; pendingQ = h.q; setModel(h.name); return; }
    if (h.walk && mode !== 'walk') enterWalk(); else if (!h.walk && mode === 'walk') exitWalk();
    applyQ(h.q);
  });

  var h0 = parseHash();
  resize();
  pendingWalk = !!(h0 && h0.walk); su = !!(h0 && h0.su); pendingQ = h0 && h0.q;
  if (pendingQ && pendingQ.e === '1') { embed = true; document.body.classList.add('embed'); }
  setModel(h0 ? h0.name : 'big', true);
  booting = false;
  requestAnimationFrame(frame);
})();
