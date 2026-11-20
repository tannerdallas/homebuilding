/* The St. James in 3D: the whole home on its lot as a model that takes every choice of the design studio. The light is baked into pages (one for the outside, one for each level);
   colours, finishes and the parts that come and go with a choice are applied here, so any combination shows at once. Two ways to look: the model from outside, opened level by
   level, and a walk through the rooms (drag to look, tap the floor to go there). Coordinates: x to the garage side, y up, -z toward the rear; feet. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  var stage = $('stage'), loadingEl = $('loading');
  function fail(msg) { $('fallback').hidden = false; $('fallback-msg').textContent = msg; loadingEl.hidden = true; }
  if (!window.THREE || !THREE.OrbitControls) { fail('The 3D library did not load. Check your connection, then reopen this page.'); return; }
  var renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); } catch (e) { fail('This browser could not start 3D graphics. Try Chrome or Safari.'); return; }
  var SKY = 0xdfe7ee, ENV = null, ENVIN = null, SUNDIR = new THREE.Vector3(0.3, 0.9, 0.3).normalize(), dirty = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  stage.appendChild(renderer.domElement); var cvs = renderer.domElement;
  var scene = new THREE.Scene(); scene.background = new THREE.Color(SKY); scene.fog = new THREE.Fog(SKY, 900, 2800);
  var camera = new THREE.PerspectiveCamera(36, 1, 1, 6000), controls = new THREE.OrbitControls(camera, cvs);
  controls.enableDamping = false; controls.maxPolarAngle = Math.PI / 2 - 0.03; controls.minDistance = 14; controls.maxDistance = 520; controls.addEventListener('change', function () { dirty = true; });
  var hemi = new THREE.HemisphereLight(0xe6eef7, 0x8b8f7c, 0.78), sun = new THREE.DirectionalLight(0xfff3df, 1.3); scene.add(hemi); scene.add(sun); scene.add(sun.target);
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
  function makeEnv() {                                  // the reflection maps: the sky for outdoors, a stand-in room for indoors
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
  }

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
    '#elif PAT == 15',                                                                                 // standing-seam metal: ribs 16 in. apart running down the slope
    '  float sn = sqrt(max(1.0 - fn.y * fn.y, 0.0));',
    '  if (sn > 0.05) { vec3 ev = normalize(vec3(fn.z, 0.0, -fn.x)); float u0 = dot(vWp, ev) / 1.333, wu = max(fwidth(u0), 1e-4); diffuseColor.rgb = mix(diffuseColor.rgb, uC2, jl(fract(u0), wu, 0.07) * 0.9); }',
    '#elif PAT == 16',                                                                                 // concrete pavers, 4 x 8 in., running bond
    '  if (!up) { vec2 q = vec2(vWp.x / 0.67, vWp.z / 0.335); q.x += 0.5 * mod(floor(q.y), 2.0); vec2 w = max(fwidth(q), vec2(1e-4));',
    '    float vis = 1.0 - smoothstep(0.3, 0.8, max(w.x, w.y)), tid = h21(floor(q)), jt = max(jl(fract(q.y), w.y, 0.07), jl(fract(q.x), w.x, 0.035));',
    '    diffuseColor.rgb = mix(diffuseColor.rgb * mix(1.0, 0.86 + 0.28 * tid, vis), uC2, jt * 0.8); }',
    '#elif PAT == 17',                                                                                 // exposed aggregate: pebbles in a warm matrix
    '  { float pb = vn(sq * 30.0) * (1.0 - smoothstep(0.004, 0.03, px)); diffuseColor.rgb = mix(diffuseColor.rgb, uC2, smoothstep(0.55, 0.8, pb) * 0.7) * (0.9 + 0.12 * vn(sq * 0.4)); }',
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
  /* ---------- the model ---------- */
  var BASEPAT = { lap: 2, st1: 3, st2: 3, st3: 3, st4: 3, st5: 3, ws1: 3, ws2: 3, ws3: 3, ws4: 3, ws5: 3, brickr: 1, brickw: 1, shingle: 4, shingle90: 4, proof: 4, floor1: 5, lvp: 5, deckw: 9, deckf: 9, tile: 6, tiled: 6, fptile: 6,
    marbt: 11, quartz: 11, tgrass: 7, tmulch: 8, tsoil: 8, drive: 8, walk: 8, conc: 8, found: 8, road: 8, gslab: 8, bslab: 8, coping: 8, wcap: 0, scap: 8, mortar: 8, wmortar: 8, oakf: 9, sttread: 9, strail: 9, runner: 12, runnerb: 12, clwood: 9, timber: 9, cedar: 9, fcedar: 9,
    lumber: 9, stud: 9, osb: 9, walnut: 9, linen: 12, linen2: 12, slate: 12, sage: 12, rust: 12, bedding: 12, towel: 12, drape: 12, carpet: 12, rugc: 13, rugb: 13, jute: 13, bsplash: 14 };
  var C2 = { ws1: [0.66, 0.63, 0.57], ws2: [0.7, 0.67, 0.6], ws3: [0.62, 0.6, 0.54], ws4: [0.7, 0.68, 0.62], ws5: [0.6, 0.57, 0.5], brickr: [0.48, 0.45, 0.4], brickw: [0.62, 0.6, 0.56], marbt: [0.36, 0.35, 0.33], fptile: [0.42, 0.41, 0.39], tiled: [0.47, 0.46, 0.43], lvp: [0.1, 0.08, 0.06], tgrass: [0.1, 0.2, 0.05] };
  var EMIT = { bulb: [1.6, 1.5, 1.3], lshade: [1.25, 1.18, 1.05], ember: [1.6, 0.7, 0.2], screen: [0.02, 0.02, 0.025] };
  var LEVEL = { ROOF: 'r', WROOF: 'r', L2: '2', F2: '2', L1: '1', F1: '1', C1: '1', DECK: '1', B0: 'b', BU: 'b', BF: 'b', SITE: 's' };
  var M = null, layers = {}, mats = {}, lmTex = {}, state = {}, D = {}, BK = {}, OWN = {}, cut = 'all', mode = 'model', solid = [], groundM = [], root = new THREE.Group(); scene.add(root);
  function condOk(layer, st) { var cs = layer.split('@'), i, j; for (i = 1; i < cs.length; i++) { var ts = cs[i].split('&'); for (j = 0; j < ts.length; j++) { var kv = ts[j].split('='); if (kv[1].split('|').indexOf(String(st[kv[0]])) < 0) return false; } } return true; }
  function bathVal(sc, k) { var v = state[sc + ':' + k]; if (v == null) v = state['ba:' + k]; return v == null ? D[k] : v; }
  function eff(sc) { if (!sc) return state; var e = {}; Object.keys(D).forEach(function (k) { e[k] = BK[k] ? bathVal(sc, k) : state[k]; }); return e; }
  function readHash(h) {
    Object.keys(state).forEach(function (k) { delete state[k]; }); Object.keys(D).forEach(function (k) { state[k] = D[k]; });
    (h || '').split(',').forEach(function (kv) {
      var p = kv.split('.'); if (p.length !== 2) return; var q = p[0].split(':'), k = q[q.length - 1], sc = q.length === 2 ? q[0] : '';
      if (D[k] == null || !M.meta.opts[k] || !M.meta.opts[k].ch.some(function (c) { return c[0] === p[1]; })) return;
      if (!sc) state[k] = p[1]; else if (BK[k] && (sc === 'ba' || M.meta.baths[sc])) state[sc + ':' + k] = p[1];
    });
  }
  function hashOf() { var h = Object.keys(D).filter(function (k) { return state[k] !== D[k]; }).map(function (k) { return k + '.' + state[k]; }); Object.keys(state).forEach(function (k) { if (k.indexOf(':') > 0) h.push(k + '.' + state[k]); }); return h.join(','); }
  function layer(k) { if (!layers[k]) { layers[k] = new THREE.Group(); layers[k].userData.lv = LEVEL[k.split('@')[0]] || '1'; root.add(layers[k]); } return layers[k]; }
  function material(p) {
    var key = [p.mat, p.sc || '', p.lm, p.sm ? 1 : 0].join('|'); if (mats[key]) return mats[key].m;
    var water = p.mat === 'water', glass = p.alpha < 1 && !water, em = EMIT[p.mat], mat;
    if (em) mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(em[0], em[1], em[2]), side: THREE.DoubleSide });
    else mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.color[0], p.color[1], p.color[2]), roughness: Math.max(p.rough, 0.22), metalness: Math.min(p.metal || 0, 0.2), flatShading: !p.sm, side: THREE.DoubleSide });
    if (water) { mat.transparent = true; mat.opacity = 0.84; mat.roughness = 0.1; mat.color.setRGB(0.08, 0.42, 0.56); mat.envMap = ENV; mat.envMapIntensity = 1.2; }
    else if (p.mat === 'mirror') { mat.color.setRGB(0.93, 0.95, 0.96); mat.metalness = 1; mat.roughness = 0.03; mat.envMap = ENVIN || ENV; mat.envMapIntensity = 1.1; }
    else if (glass && (p.mat === 'glassc' || p.mat === 'glassi')) mat = new THREE.MeshStandardMaterial({ color: 0xdfe9ea, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, flatShading: !p.sm, envMap: ENVIN || ENV, envMapIntensity: 1.3 });
    else if (glass) { mat.transparent = true; mat.depthWrite = false; mat.color.setRGB(0.045, 0.06, 0.07); mat.roughness = 0.04; mat.opacity = p.mat === 'gfrost' ? 0.7 : 0.34; mat.envMap = ENV; mat.envMapIntensity = 2.0; }
    else if (!em) { patch(mat, BASEPAT[p.mat] || 0, C2[p.mat] ? new THREE.Color(C2[p.mat][0], C2[p.mat][1], C2[p.mat][2]) : null, null); if (p.mat === 'tmulch') mat.color.multiplyScalar(1.8); if (p.mat === 'tgrass') mat.color.setRGB(0.07, 0.15, 0.04); }
    mats[key] = { m: mat, mat: p.mat, sc: p.sc || '', lm: p.lm, plain: !!(em || water || glass || p.mat === 'mirror'), metal: p.metal || 0, c: mat.color.clone(), ro: mat.roughness, p: BASEPAT[p.mat] || 0, c2: mat.userData.c2 ? mat.userData.c2.value.clone() : null };
    return mat;
  }
  function build(meta, parts, buf) {
    parts.forEach(function (p) {
      var g = new THREE.BufferGeometry(), n = p.pn / 3, q = new Uint16Array(buf, p.po, p.pn), pos = new Float32Array(p.pn), o = p.q, stp = o[3], i;
      for (i = 0; i < n; i++) { pos[3 * i] = o[0] + q[3 * i] * stp; pos[3 * i + 1] = o[1] + q[3 * i + 1] * stp; pos[3 * i + 2] = o[2] + q[3 * i + 2] * stp; }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(p.ix === 4 ? new Uint32Array(buf, p.io, p.inn) : new Uint16Array(buf, p.io, p.inn), 1));
      if (p.uo !== undefined) g.setAttribute('uv2', new THREE.BufferAttribute(new Uint16Array(buf, p.uo, n * 2), 2, true));
      if (p.sm) smoothNormals(g);
      var mat = material(p), mesh = new THREE.Mesh(g, mat), e = mats[[p.mat, p.sc || '', p.lm, p.sm ? 1 : 0].join('|')];
      if (mat.transparent) mesh.renderOrder = 2;
      layer(p.layer).add(mesh);
      if (!mat.transparent && !EMIT[p.mat]) solid.push(mesh);                             // what a tap can land on
      var lb = p.layer.split('@')[0]; if ((lb === 'SITE' || lb === 'DECK') && !mat.transparent) groundM.push(mesh);      // what feet stand on outside
    });
  }
  function lmApply(g, t) {
    Object.keys(mats).forEach(function (k) {
      var e = mats[k]; if (e.lm !== g || e.plain) return; var mt = e.m;
      mt.lightMap = t; mt.lightMapIntensity = (M.meta.lmax || 4) * (g === 0 ? OUTG * OUTK : ING); mt.defines.BAKED = '';
      if (g > 0 && ENVIN) { mt.envMap = ENVIN; mt.envMapIntensity = e.metal > 0.5 ? 1.0 : 0.55; } else if (ENV) { mt.envMap = ENV; mt.envMapIntensity = 0.3; }
      e.env = true; mt.needsUpdate = true;
    });
    applyStyles(); dirty = true;
  }
  /* the finish each material wears: from the table of choices; a bathroom's own parts follow that bathroom's choices */
  function styleOf(e) {
    var T = M.meta.table, st = eff(e.sc);
    if (e.mat === 'carpet') return st.uf !== 'c' ? T.uf[st.uf].carpet : T.cpt[st.cpt].carpet;
    if (e.mat === 'proof') return st.prf === 'match' ? T.rof[st.rof].shingle : T.prf[st.prf].proof;
    var k = OWN[e.mat]; return k && T[k][st[k]] ? T[k][st[k]][e.mat] : null;
  }
  function applyStyles() {
    Object.keys(mats).forEach(function (key) {
      var e = mats[key]; if (e.plain) return; var s = styleOf(e), mt = e.m;
      if (!s) return;
      mt.color.setRGB(s.c[0], s.c[1], s.c[2]); mt.roughness = Math.max(s.ro == null ? e.ro : s.ro, 0.22); var me = s.me == null ? e.metal : s.me; mt.metalness = Math.min(me, e.env && me > 0.5 ? 0.9 : 0.2);
      if (e.env) mt.envMapIntensity = me > 0.5 ? 1.0 : (e.lm > 0 ? 0.55 : 0.3);
      setPat(mt, s.p || 0); if (mt.userData.c2) { if (s.c2) mt.userData.c2.value.setRGB(s.c2[0], s.c2[1], s.c2[2]); else mt.userData.c2.value.copy(mt.color).multiplyScalar(0.5); }
    });
    dirty = true;
  }
  var OUTK = 1, OUTG = 1.45, ING = 0.8;                    /* how the baked light is shown: the outside a little brighter than baked (open shade reads as daylight), the rooms a little calmer */
  function outdoor(k) {                                    /* from indoors the outside reads brighter, as it does to a camera set for the room */
    if (k === OUTK) return; OUTK = k; dome.material.uniforms.uGain.value = k; sun.intensity = 1.3 * k; hemi.intensity = 0.78 * k;
    Object.keys(mats).forEach(function (key) { var e = mats[key]; if (e.lm === 0 && e.m.lightMap) e.m.lightMapIntensity = (M.meta.lmax || 4) * OUTG * k; }); dirty = true;
  }
  var HIDE = { all: '', r: 'r', '1': 'r2', b: 'r21' };
  function applyVis() {
    var hide = mode === 'walk' ? '' : HIDE[cut];
    Object.keys(layers).forEach(function (k) { layers[k].visible = condOk(k, state) && hide.indexOf(layers[k].userData.lv) < 0; });
    if (plantG) plantG.visible = true;
    dirty = true;
  }
  /* trees and planting: simple shapes drawn here from the list the model carries */
  var plantG = null;
  function plants(list) {
    plantG = new THREE.Group(); root.add(plantG);
    var leaf = new THREE.MeshLambertMaterial({ color: 0xffffff }), bark = new THREE.MeshLambertMaterial({ color: new THREE.Color(0.07, 0.05, 0.035) }); patch(leaf, 10);
    var ico = new THREE.IcosahedronGeometry(1, 1), cone = new THREE.ConeGeometry(1, 1, 9), cyl = new THREE.CylinderGeometry(0.7, 1, 1, 7); cone.translate(0, 0.5, 0); cyl.translate(0, 0.5, 0);
    var nb = 0, nc = 0, nt = 0; list.forEach(function (p) { if (p.k === 'tree') { nb += 9; nt++; } else if (p.k === 'far') { nb += 5; } else if (p.k === 'arb' || p.k === 'grass') nc++; else nb += p.k === 'hyd' ? 7 : 1; });
    var blobs = new THREE.InstancedMesh(ico, leaf, nb), cones = new THREE.InstancedMesh(cone, leaf, nc), trunks = new THREE.InstancedMesh(cyl, bark, nt), ib = 0, ic = 0, it = 0;
    var mm = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color(), sd = 7, r = function () { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    function blob(x, y, z, rx, ry, c) { P.set(x, z, -y); S.set(rx, ry, rx); Q.setFromEuler(E.set(r() * 3, r() * 6.3, r() * 3)); mm.compose(P, Q, S); blobs.setMatrixAt(ib, mm); blobs.setColorAt(ib++, C.setRGB(c[0], c[1], c[2])); }
    list.forEach(function (p) {
      sd = 7 + (p.s || 1) * 131 + Math.round(p.x * 3 + p.y * 7);
      var g = [0.055 + r() * 0.02, 0.105 + r() * 0.035, 0.03 + r() * 0.012];
      if (p.k === 'tree') {
        P.set(p.x, p.z - 0.5, -p.y); S.set(p.h * 0.03 + 0.12, p.h * 0.5, p.h * 0.03 + 0.12); Q.identity(); mm.compose(P, Q, S); trunks.setMatrixAt(it++, mm);
        blob(p.x, p.y, p.z + p.h * 0.66, p.r, p.h * 0.3, g);
        for (var j = 0; j < 8; j++) { var a = r() * 6.283, t = 0.35 + r() * 0.65, v = 0.82 + r() * 0.34; blob(p.x + Math.cos(a) * p.r * 0.75 * t, p.y + Math.sin(a) * p.r * 0.75 * t, p.z + p.h * (0.5 + 0.38 * r()), p.r * (0.42 + r() * 0.25), p.r * (0.36 + r() * 0.2), [g[0] * v, g[1] * v, g[2] * v]); }
      } else if (p.k === 'far') {
        blob(p.x, p.y, p.z + p.h * 0.5, p.r * 1.1, p.h * 0.5, g);
        for (var j2 = 0; j2 < 4; j2++) { var a2 = r() * 6.283, v2 = 0.8 + r() * 0.3; blob(p.x + Math.cos(a2) * p.r * 0.7, p.y + Math.sin(a2) * p.r * 0.7, p.z + p.h * (0.45 + 0.35 * r()), p.r * 0.6, p.r * 0.55, [g[0] * v2, g[1] * v2, g[2] * v2]); }
      } else if (p.k === 'arb' || p.k === 'grass') {
        P.set(p.x, p.z, -p.y); S.set(p.r, p.h, p.r); Q.identity(); mm.compose(P, Q, S); cones.setMatrixAt(ic, mm); cones.setColorAt(ic++, p.k === 'arb' ? C.setRGB(0.04, 0.085, 0.03) : C.setRGB(0.14, 0.2, 0.06));
      } else {
        blob(p.x, p.y, p.z + p.h * 0.42, p.r, p.h * 0.55, p.k === 'hyd' ? [0.05, 0.115, 0.035] : [0.04, 0.09, 0.03]);
        if (p.k === 'hyd') for (var j3 = 0; j3 < 6; j3++) { var a3 = r() * 6.283, t3 = 0.3 + r() * 0.6; blob(p.x + Math.cos(a3) * p.r * t3, p.y + Math.sin(a3) * p.r * t3, p.z + p.h * (0.62 + 0.22 * r()), 0.34, 0.3, [0.8, 0.8, 0.72]); }
      }
    });
    blobs.count = ib; cones.count = ic; trunks.count = it; [blobs, cones, trunks].forEach(function (m) { m.frustumCulled = false; plantG.add(m); });
  }
  /* ---------- looking at it: the model from outside ---------- */
  var VIEW = { x: 28, y: 24, z: 6 };
  function homeView() {
    camera.fov = 36; camera.near = 2; camera.updateProjectionMatrix(); controls.enabled = true;
    var top = cut === 'all' ? 0 : 1; controls.target.set(VIEW.x, cut === 'b' ? -6 : cut === '1' ? 2 : cut === 'r' ? 12 : VIEW.z, -VIEW.y);
    if (top) camera.position.set(VIEW.x - 16, 86, -VIEW.y + 58); else camera.position.set(-44, 36, 74);
    controls.update(); dirty = true;
  }
  /* ---------- walking through it ---------- */
  var W = { x: 14.3, y: 19.7, z: 0, yaw: 0, pitch: -0.05, tgt: null, path: null, lv: '1' }, EYE = 5.2, RAD = 0.75, keys = {}, ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  function inPoly(poly, x, y) { var c = false, n = poly.length; for (var i = 0; i < n; i++) { var a = poly[i], b = poly[(i + 1) % n]; if ((a[1] > y) !== (b[1] > y) && x < a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])) c = !c; } return c; }
  function levelOf(z) { var Z = M.meta.z; return z < Z.b + 4.5 ? 'b' : z > Z.f2 - 4.5 ? '2' : '1'; }
  function floorAt(x, y, z) {                              /* the height feet stand at: a level's floor indoors, the garage slab, or the ground (lawn, paving, deck) outside */
    var Z = M.meta.z, F = M.meta.foot;
    if (inPoly(F.house, x, y)) { var lv = levelOf(z); return lv === 'b' ? Z.b : lv === '2' ? Z.f2 : 0; }
    if (inPoly(F.garage, x, y) && z > -4) return Z.g;
    ray.set(new THREE.Vector3(x, z + 3.5, -y), down); ray.far = 60; var hit = ray.intersectObjects(groundM.filter(function (m) { return m.parent.visible; }), false);
    for (var i = 0; i < hit.length; i++) if (hit[i].face && hit[i].face.normal.y > 0.5) return hit[i].point.y;
    return z;
  }
  var STAIRBLOCK = { '1': [[9.9, 30.77, 10.43, 34.29], [10.55, 26.96, 11.15, 30.48]], '2': [[9.9, 26.96, 10.43, 30.48], [10.43, 30.6, 10.7, 34.29]], b: [[1.5, 26.96, 11.6, 30.48]] };      /* feet do not wander onto the stairs: a tap on them takes the stairs */
  function blocked(x, y, z) {
    var set = M.meta.walls[inPoly(M.meta.foot.house, x, y) || z > -4 ? levelOf(z) : 'b'] || [], i, w;
    if (!inPoly(M.meta.foot.house, x, y) && !inPoly(M.meta.foot.garage, x, y)) set = M.meta.walls[z < -4 ? 'b' : '1'];
    if (inPoly(M.meta.foot.house, x, y)) set = set.concat(STAIRBLOCK[levelOf(z)] || []);
    for (i = 0; i < set.length; i++) { w = set[i]; if (w[4] && !condOk('@' + w[4], state)) continue; var dx = Math.max(w[0] - x, 0, x - w[2]), dy = Math.max(w[1] - y, 0, y - w[3]); if (dx * dx + dy * dy < RAD * RAD) return true; }
    return false;
  }
  function tryMove(nx, ny) {
    if (!blocked(nx, ny, W.z)) { W.x = nx; W.y = ny; } else if (!blocked(nx, W.y, W.z)) W.x = nx; else if (!blocked(W.x, ny, W.z)) W.y = ny; else return false;
    return true;
  }
  function route(tx, ty) {                                 /* a way round the walls to a tapped spot: breadth-first over a half-foot grid, then pulled straight where nothing is in the way */
    var c = 0.5, x0 = Math.min(W.x, tx) - 14, y0 = Math.min(W.y, ty) - 14, nx = Math.ceil((Math.abs(W.x - tx) + 28) / c), ny = Math.ceil((Math.abs(W.y - ty) + 28) / c); if (nx * ny > 90000) return null;
    var bl = new Uint8Array(nx * ny), i, j; for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) bl[j * nx + i] = blocked(x0 + (i + 0.5) * c, y0 + (j + 0.5) * c, W.z) ? 1 : 0;
    var si = Math.floor((W.x - x0) / c), sj = Math.floor((W.y - y0) / c), ti = Math.floor((tx - x0) / c), tj = Math.floor((ty - y0) / c), s = sj * nx + si, t = tj * nx + ti; bl[s] = 0;
    if (bl[t]) { var best = -1, bd = 1e9; for (j = Math.max(0, tj - 5); j < Math.min(ny, tj + 6); j++) for (i = Math.max(0, ti - 5); i < Math.min(nx, ti + 6); i++) if (!bl[j * nx + i]) { var d0 = (i - ti) * (i - ti) + (j - tj) * (j - tj); if (d0 < bd) { bd = d0; best = j * nx + i; } } if (best < 0) return null; t = best; }
    var prev = new Int32Array(nx * ny).fill(-1), q = [s], h = 0, N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]; prev[s] = s;
    while (h < q.length && prev[t] < 0) { var u = q[h++], ui = u % nx, uj = (u - ui) / nx; for (var k = 0; k < 8; k++) { var vi = ui + N[k][0], vj = uj + N[k][1]; if (vi < 0 || vj < 0 || vi >= nx || vj >= ny) continue; var v = vj * nx + vi; if (bl[v] || prev[v] >= 0) continue; if (k > 3 && (bl[uj * nx + vi] || bl[vj * nx + ui])) continue; prev[v] = u; q.push(v); } }
    if (prev[t] < 0) return null;
    var pts = [], n = t; while (n !== s) { pts.push([x0 + (n % nx + 0.5) * c, y0 + (Math.floor(n / nx) + 0.5) * c]); n = prev[n]; } pts.reverse(); if (!bl[tj * nx + ti] && pts.length) pts[pts.length - 1] = [tx, ty];
    function clear(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], m = Math.ceil(Math.sqrt(dx * dx + dy * dy) / 0.3); for (var e = 1; e < m; e++) if (blocked(a[0] + dx * e / m, a[1] + dy * e / m, W.z)) return false; return true; }
    var out = [], cur = [W.x, W.y], a = 0; while (a < pts.length) { var b2 = pts.length - 1; while (b2 > a && !clear(cur, pts[b2])) b2--; out.push(pts[b2]); cur = pts[b2]; a = b2 + 1; }
    return out;
  }
  function place() {
    camera.position.set(W.x, W.z + EYE, -W.y); var cp = Math.cos(W.pitch);
    camera.lookAt(W.x + Math.sin(W.yaw) * cp, W.z + EYE + Math.sin(W.pitch), -W.y - Math.cos(W.yaw) * cp); dirty = true;
  }
  function goStop(s) { W.x = s.x; W.y = s.y; W.z = s.z; W.yaw = (s.look || 0) * Math.PI / 180; W.pitch = -0.06; W.tgt = null; W.path = null; place(); syncWalkUI(); outdoor(s.out ? 1 : 1.7); }
  function enterWalk(stop) {
    mode = 'walk'; controls.enabled = false; camera.fov = 68; camera.near = 0.25; camera.updateProjectionMatrix(); applyVis();
    goStop(stop || M.meta.stops.filter(function (s) { return s.id === 'foyer'; })[0] || M.meta.stops[0]); ui();
  }
  function exitWalk() { mode = 'model'; applyVis(); homeView(); ui(); }
  function goTo(x, y) { var r = route(x, y); if (r && r.length) { W.way = r; W.tgt = W.way.shift(); } else { W.way = null; W.tgt = [x, y]; } dirty = true; }
  function stairPath(from, to) {                           /* the way between two levels, by the stairs: a line of points the eye glides along */
    var Z = M.meta.z, up = [[13.2, 32.5, 0], [10.6, 32.5, 0], [4.3, 32.5, 5.04], [2.4, 30.6, 5.04], [4.3, 28.7, 5.04], [10.4, 28.7, Z.f2], [13.4, 28.3, Z.f2]], dn = [[13.6, 28.7, 0], [11.6, 28.7, 0], [1.0, 28.7, Z.b], [2.4, 25.6, Z.b]];
    if (from === '1' && to === '2') return up; if (from === '2' && to === '1') return up.slice().reverse();
    if (from === '1' && to === 'b') return dn; if (from === 'b' && to === '1') return dn.slice().reverse();
    if (from === '2' && to === 'b') return up.slice().reverse().concat(dn); if (from === 'b' && to === '2') return dn.slice().reverse().concat(up);
    return null;
  }
  function goLevel(lv) {
    var cur = inPoly(M.meta.foot.house, W.x, W.y) ? levelOf(W.z) : 'out';
    if (lv === 'out') { goStop(M.meta.stops.filter(function (s) { return s.id === 'street'; })[0]); return; }
    var p = cur !== 'out' && cur !== lv ? stairPath(cur, lv) : null;
    if (p) { W.path = [[W.x, W.y, W.z]].concat(p); W.pi = 1; W.tgt = null; dirty = true; }
    else goStop(M.meta.stops.filter(function (s) { return s.l === lv; })[0]);
  }
  var last = 0;
  function step(now) {
    var dt = Math.min(0.1, (now - last) / 1000 || 0.016); last = now; advance(dt);
    if (dirty) { dirty = false; dome.position.copy(camera.position); renderer.render(scene, camera); }
    requestAnimationFrame(step);
  }
  function advance(dt) {
    if (mode === 'walk') {
      var sp = 9.5 * dt, moved = false, f = (keys.ArrowUp || keys.w ? 1 : 0) - (keys.ArrowDown || keys.s ? 1 : 0), sd = (keys.d ? 1 : 0) - (keys.a ? 1 : 0), tr = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
      if (tr) { W.yaw += tr * 1.9 * dt; moved = true; }
      if (W.path) {                                          /* on the stairs: along the path, looking where it leads */
        var q = W.path[W.pi], dx = q[0] - W.x, dy = q[1] - W.y, dz = q[2] - W.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz), s2 = 7.5 * dt;
        if (d <= s2) { W.x = q[0]; W.y = q[1]; W.z = q[2]; W.pi++; if (W.pi >= W.path.length) { W.path = null; syncWalkUI(); } }
        else { W.x += dx / d * s2; W.y += dy / d * s2; W.z += dz / d * s2; var want = Math.atan2(dx, dy), dy2 = ((want - W.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; W.yaw += dy2 * Math.min(1, 5 * dt); W.pitch += ((dz > 0.01 ? 0.12 : dz < -0.01 ? -0.3 : -0.06) - W.pitch) * Math.min(1, 4 * dt); }
        moved = true;
      } else {
        if (f || sd) { W.tgt = null; W.way = null; var c = Math.cos(W.yaw), s = Math.sin(W.yaw); moved = tryMove(W.x + (s * f + c * sd) * sp, W.y + (c * f - s * sd) * sp) || moved; }
        else if (W.tgt) {
          var ex = W.tgt[0] - W.x, ey = W.tgt[1] - W.y, ed = Math.sqrt(ex * ex + ey * ey);
          if (ed < 0.25 || !tryMove(W.x + ex / ed * Math.min(sp, ed), W.y + ey / ed * Math.min(sp, ed))) W.tgt = W.way && W.way.length ? W.way.shift() : null;
          moved = true;
        }
        if (moved) { var fz = floorAt(W.x, W.y, W.z); W.z += (fz - W.z) * Math.min(1, 12 * dt); if (Math.abs(fz - W.z) > 0.01) dirty = true; }
      }
      if (moved) { place(); if (!W.path && !W.tgt) syncWalkUI(); outdoor(inPoly(M.meta.foot.house, W.x, W.y) || inPoly(M.meta.foot.garage, W.x, W.y) ? 1.7 : 1); }
    } else outdoor(1);
  }
  /* pointer: drag to look, tap to go */
  (function () {
    var pd = null;
    cvs.addEventListener('pointerdown', function (e) { if (mode !== 'walk') return; pd = { x: e.clientX, y: e.clientY, yaw: W.yaw, pitch: W.pitch, moved: false, t: performance.now() }; try { cvs.setPointerCapture(e.pointerId); } catch (x) { } });
    cvs.addEventListener('pointermove', function (e) {
      if (!pd || mode !== 'walk') return; var dx = e.clientX - pd.x, dy = e.clientY - pd.y; if (Math.abs(dx) + Math.abs(dy) > 6) pd.moved = true;
      if (pd.moved) { var k = 0.0042 * (camera.fov / 68); W.yaw = pd.yaw - dx * k; W.pitch = Math.max(-1.25, Math.min(1.25, pd.pitch + dy * k)); place(); }
    });
    cvs.addEventListener('pointerup', function (e) {
      if (!pd || mode !== 'walk') { pd = null; return; } var tap = !pd.moved && performance.now() - pd.t < 600; pd = null; if (!tap || W.path) return;
      var r = cvs.getBoundingClientRect(), v = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(v, camera); ray.far = 90;
      var hit = ray.intersectObjects(solid.filter(function (m) { return m.parent.visible; }), false)[0]; if (!hit) return;
      var hx = hit.point.x, hy = -hit.point.z, n = hit.face ? hit.face.normal : null, cur = levelOf(W.z), ORD = ['b', '1', '2'];
      if (inPoly(M.meta.foot.house, W.x, W.y) && hx > 0.3 && hx < 11.6 && hy > 26.9 && hy < 34.35 && Math.abs(hit.point.y - W.z) > 0.5 && Math.abs(hit.point.y - W.z) < 11) {      /* a tap on the stairs: up or down them */
        var to = ORD[ORD.indexOf(cur) + (hit.point.y > W.z ? 1 : -1)]; if (to) { goLevel(to); return; }
      }
      if (!(n && n.y > 0.6)) { var dx = hx - W.x, dy = hy - W.y, d = Math.sqrt(dx * dx + dy * dy) || 1; hx -= dx / d * 1.6; hy -= dy / d * 1.6; }      /* a wall or a piece of furniture: walk up to it */
      goTo(hx, hy);
    });
    window.addEventListener('keydown', function (e) { keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = true; dirty = true; });
    window.addEventListener('keyup', function (e) { keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; });
  })();
  /* ---------- controls on the page ---------- */
  var LVN = { out: 'Outside', '1': 'Main level', '2': 'Upstairs', b: 'Lower level' };
  function ui() {
    Array.prototype.forEach.call($('modes').children, function (b) { b.classList.toggle('on', b.dataset.m === mode); });
    var L = $('levels'); L.innerHTML = '';
    if (mode === 'model') [['all', 'Whole house'], ['r', 'Roof off'], ['1', 'Main level'], ['b', 'Lower level']].forEach(function (t) { var b = el('button', cut === t[0] ? 'on' : '', t[1]); b.onclick = function () { cut = t[0]; applyVis(); homeView(); ui(); }; L.appendChild(b); });
    $('rooms').hidden = mode !== 'walk'; if (mode !== 'walk') $('where').textContent = 'Your design in 3D'; $('hint').textContent = mode === 'walk' ? 'Drag to look around. Tap the floor to walk there.' : 'Drag to turn the model, pinch or scroll to zoom.';
    if (mode === 'walk') syncWalkUI();
    $('hint').classList.remove('off'); clearTimeout(ui.t); ui.t = setTimeout(function () { $('hint').classList.add('off'); }, 7000);      /* the hint steps aside after a few seconds */
  }
  var RN = { 'Closet': 'Primary closet', 'Closet West': 'Primary closet', 'Rear Hall': 'Hall', 'Coat': 'Coat closet', 'Powder': 'Powder room', 'Mud Closet': 'Mud closet', 'Garage Bay': 'Garage', 'Bed 4 Entry': 'Bedroom 4', 'Bed 4 Closet': 'Bedroom 4 closet',
    'Linen': 'Linen closet', 'Bed 3 Closet': 'Bedroom 3 closet', 'Bed 2 Closet': 'Bedroom 2 closet', 'Stair Hall': 'Stair hall', 'Upper Hall': 'Upstairs hall', 'Basement': 'Lower level', 'Basement Front': 'Lower level', 'Basement Bay': 'Lower level',
    'Great Room': 'Great room', 'Dining Room': 'Dining room', 'Primary Bedroom': 'Primary bedroom', 'Primary Bath': 'Primary bath', 'Hall Bath': 'Hall bath' };
  function roomAt() {
    var inH = inPoly(M.meta.foot.house, W.x, W.y), inG = inPoly(M.meta.foot.garage, W.x, W.y); if (!inH && !inG) return 'Outside'; var lv = inH ? levelOf(W.z) : '1', R = M.meta.rooms, i;
    for (i = 0; i < R.length; i++) if (R[i].l === lv && W.x >= R[i].r[0] - 0.3 && W.x <= R[i].r[2] + 0.3 && W.y >= R[i].r[1] - 0.3 && W.y <= R[i].r[3] + 0.3) return RN[R[i].n] || R[i].n;
    return LVN[lv];
  }
  function syncWalkUI() {
    if (mode === 'walk') $('where').textContent = roomAt();
    if (mode !== 'walk') return; var inside = inPoly(M.meta.foot.house, W.x, W.y) || inPoly(M.meta.foot.garage, W.x, W.y), cur = inside ? levelOf(W.z) : 'out', L = $('levels'), R = $('rooms'); L.innerHTML = ''; R.innerHTML = '';
    ['out', '1', '2', 'b'].forEach(function (lv) { var b = el('button', cur === lv ? 'on' : '', LVN[lv]); b.onclick = function () { goLevel(lv); }; L.appendChild(b); });
    M.meta.stops.filter(function (s) { return s.l === cur; }).forEach(function (s) { var b = el('button', '', s.n); b.onclick = function () { goStop(s); }; R.appendChild(b); });
  }
  Array.prototype.forEach.call($('modes').children, function (b) { b.onclick = function () { if (b.dataset.m === mode) return; if (b.dataset.m === 'walk') enterWalk(); else exitWalk(); }; });
  /* the choices, in a drawer: every group as a list; the bathrooms as a group of their own, all together or one at a time */
  var BED = ['uf', 'cpt', 'wal', 'cr2', 'win', 'wg', 'idc', 'clb'], ROOMKEYS = { 'Great room': ['fp', 'bi', 'sf', 'cr1', 'flr', 'wal', 'win', 'wg', 'hwc'], 'Kitchen': ['cab', 'isl', 'ctr', 'bsp', 'ch', 'cr1', 'flr', 'wal', 'hwc'], 'Breakfast': ['flr', 'wal', 'cr1', 'win', 'wg'],
    'Dining room': ['flr', 'wal', 'cr1', 'win', 'wg'], 'Foyer': ['od', 'flr', 'wal', 'cr1', 'fd', 'fdc', 'idc'], 'Office': ['od', 'flr', 'wal', 'cr1', 'win', 'wg'], 'Hall': ['sf', 'flr', 'wal', 'cr1', 'idc', 'hwc'], 'Laundry': ['flr', 'wal', 'idc', 'hwc'], 'Pantry': ['flr', 'wal', 'idc'],
    'Powder room': ['flr', 'cr1', 'idc'], 'Garage': ['gs', 'gdc'], 'Stairs': ['sf', 'sr', 'flr', 'wal'], 'Stair hall': ['sf', 'sr', 'uf', 'cpt', 'wal', 'cr2'], 'Upstairs hall': ['sf', 'sr', 'uf', 'cpt', 'wal', 'cr2', 'idc'], 'Primary bedroom': ['uf', 'cpt', 'wal', 'cr2', 'win', 'wg', 'idc', 'clp'],
    'Primary bath': ['cr2', 'win', 'wg', 'idc'], 'Primary closet': ['clp', 'uf', 'cpt', 'wal', 'cr2'], 'Hall bath': ['cr2', 'idc'], 'Bedroom 2': BED, 'Bedroom 3': BED, 'Bedroom 4': BED, 'Bedroom 2 closet': ['clb', 'uf', 'cpt', 'wal'], 'Bedroom 3 closet': ['clb', 'uf', 'cpt'],
    'Bedroom 4 closet': ['clb', 'uf', 'cpt'], 'Lower level': ['bf', 'wal', 'idc', 'cab', 'ctr', 'hwc'] }, BATHOF = { 'Primary bath': 'pb', 'Hall bath': 'hb', 'Powder room': 'pw' };
  /* the choices, in a drawer: first those of the room the walker stands in, then every group as a list; the bathrooms as a group of their own, all together or one at a time */
  function drawer() {
    var B = $('choices'), rm = mode === 'walk' ? roomAt() : null, sc = $('bscope') ? $('bscope').value : 'ba'; B.innerHTML = '';
    function row(name, k, cur, on) { var r = el('label', 'row', '<span>' + name + '</span>'), s = el('select'); M.meta.opts[k].ch.forEach(function (c) { var o = el('option', '', c[1]); o.value = c[0]; if (c[0] === cur) o.selected = true; s.appendChild(o); }); s.onchange = function () { on(s.value); changed(); drawer(); }; r.appendChild(s); return r; }
    function house(k) { return row(M.meta.opts[k].name, k, state[k], function (v) { state[k] = v; }); }
    function baths() {
      B.appendChild(el('h4', '', 'Bathrooms'));
      var r0 = el('label', 'row', '<span>Choices go to</span>'), s0 = el('select'); s0.id = 'bscope'; [['ba', 'All bathrooms']].concat(Object.keys(M.meta.baths).map(function (b) { return [b, M.meta.baths[b] + ' only']; })).forEach(function (t) { var o = el('option', '', t[1]); o.value = t[0]; if (t[0] === sc) o.selected = true; s0.appendChild(o); }); s0.onchange = drawer; r0.appendChild(s0); B.appendChild(r0);
      M.meta.bathkeys.forEach(function (k) {
        var cur = sc === 'ba' ? (state['ba:' + k] == null ? D[k] : state['ba:' + k]) : bathVal(sc, k);
        B.appendChild(row(M.meta.bathnames[k] || M.meta.opts[k].name, k, cur, function (v) {
          if (sc === 'ba') { Object.keys(M.meta.baths).forEach(function (b) { delete state[b + ':' + k]; }); if (v === D[k]) delete state['ba:' + k]; else state['ba:' + k] = v; }
          else { var inh = state['ba:' + k] == null ? D[k] : state['ba:' + k]; if (v === inh) delete state[sc + ':' + k]; else state[sc + ':' + k] = v; }
        }));
      });
    }
    var here = rm === 'Outside' ? M.meta.ext : ROOMKEYS[rm], bathHere = !!BATHOF[rm];
    if (bathHere) baths();
    if (here) { B.appendChild(el('h4', '', rm === 'Outside' ? 'Outside' : 'In this room: ' + rm.toLowerCase())); here.forEach(function (k) { if (M.meta.opts[k]) B.appendChild(house(k)); }); }
    var groups = [['Outside', []], ['Inside', []]];
    (M.meta.order || Object.keys(M.meta.opts)).forEach(function (k) { if (!M.meta.opts[k] || M.meta.bathonly.indexOf(k) >= 0) return; groups[M.meta.ext.indexOf(k) >= 0 ? 0 : 1][1].push(k); });
    if (here) B.appendChild(el('h4', 'all', 'Everything else'));
    groups.forEach(function (g) { var ks = g[1].filter(function (k) { return !here || here.indexOf(k) < 0; }); if (!ks.length) return; B.appendChild(el('h4', '', g[0])); ks.forEach(function (k) { B.appendChild(house(k)); }); });
    if (!bathHere) baths();
  }
  function changed() { applyVis(); applyStyles(); var h = hashOf(); try { history.replaceState(null, '', location.pathname + location.search + (h ? '#d=' + h : '')); localStorage.setItem('sj-design', h); } catch (e) { } if (window.parent !== window) window.parent.postMessage({ sj3d: h, known: Object.keys(D) }, '*'); }
  $('bChoices').onclick = function () { var d = $('drawer'); d.hidden = !d.hidden; if (!d.hidden) drawer(); };
  $('bClose').onclick = function () { $('drawer').hidden = true; };
  if (window.parent === window) { $('back').hidden = false; $('back').onclick = function () { $('back').href = '../#d=' + hashOf(); }; }      /* on its own page: a way back to the design studio, choices and all */
  window.addEventListener('message', function (e) { if (e.data && typeof e.data.sj === 'string' && M) { readHash(e.data.sj); applyVis(); applyStyles(); if (!$('drawer').hidden) drawer(); } });
  function resize() { var w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; }
  window.addEventListener('resize', resize);
  /* ---------- load ---------- */
  var GZ = typeof DecompressionStream !== 'undefined' && typeof Response !== 'undefined' && !!(window.Blob && Blob.prototype.stream);
  function prog(f) { $('bar').style.width = Math.round(f * 100) + '%'; }
  fetch('model.json').then(function (r) { if (!r.ok) throw new Error('model'); return r.json(); }).then(function (m) {
    M = m; D = m.meta.defaults; (m.meta.bathkeys || []).forEach(function (k) { BK[k] = 1; }); SUNDIR.set(m.meta.sun[0], m.meta.sun[2], -m.meta.sun[1]).normalize(); dome.material.uniforms.uSun.value = SUNDIR;
    sun.position.copy(SUNDIR).multiplyScalar(300); makeEnv();
    Object.keys(m.meta.table).forEach(function (k) { Object.keys(m.meta.table[k]).forEach(function (c) { Object.keys(m.meta.table[k][c]).forEach(function (mt) { if (mt !== 'carpet' && mt !== 'proof') OWN[mt] = k; }); }); });
    var h = (location.hash.match(/d=([^&]+)/) || [])[1]; if (h == null) { try { h = localStorage.getItem('sj-design') || ''; } catch (e) { h = ''; } } readHash(h);
    prog(0.08); return fetch(GZ ? 'model.bin.gz' : 'model.bin');
  }).then(function (r) {
    if (!r.ok) throw new Error('model'); var total = +r.headers.get('Content-Length') || 2.4e6, rd = r.body && r.body.getReader ? r.body.getReader() : null; if (!rd) return r.arrayBuffer();
    var chunks = [], got = 0; return (function pump() { return rd.read().then(function (x) { if (x.done) { var u = new Uint8Array(got), o = 0; chunks.forEach(function (c) { u.set(c, o); o += c.length; }); return u.buffer; } chunks.push(x.value); got += x.value.length; prog(0.08 + 0.8 * Math.min(1, got / total)); return pump(); }); })();
  }).then(function (buf) {                                 /* the geometry travels packed (gzip); a host that unpacks it on the way is fine too */
    var u = new Uint8Array(buf); if (!(GZ && u[0] === 0x1f && u[1] === 0x8b)) return buf;
    return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }).then(function (buf) {
    build(M.meta, M.parts, buf); plants(M.meta.plants || []);
    var far = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshLambertMaterial({ color: new THREE.Color(0.075, 0.13, 0.045) })); far.rotation.x = -Math.PI / 2; far.position.y = -24.5; scene.add(far);
    applyVis(); applyStyles(); resize(); homeView(); ui(); loadingEl.hidden = true; requestAnimationFrame(step);
    (M.meta.lm || []).forEach(function (pg) { new THREE.TextureLoader().load(pg.f, function (t) { t.encoding = THREE.sRGBEncoding; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; lmTex[pg.g] = t; lmApply(pg.g, t); }); });
    if (/[?&]walk=([\w-]+)/.test(location.search)) { var id = RegExp.$1; enterWalk(M.meta.stops.filter(function (s) { return s.id === id; })[0]); }
    var qc = (location.search.match(/[?&]cut=(\w+)/) || [])[1]; if (qc && HIDE[qc] != null) { cut = qc; applyVis(); homeView(); ui(); }
    var qm = (location.search.match(/[?&]cam=([-\d.,]+)/) || [])[1]; if (qm) { var c6 = qm.split(',').map(Number); camera.position.set(c6[0], c6[2], -c6[1]); controls.target.set(c6[3], c6[5], -c6[4]); controls.update(); }
    window.SJ3D = { sim: function (n) { for (var i = 0; i < n; i++) advance(0.05); }, level: goLevel, tap: goTo, state: state, walk: W, go: goStop, enter: enterWalk, cut: function (c) { cut = c; applyVis(); homeView(); ui(); }, cam: camera, redraw: function () { dirty = true; } };
  }).catch(function (e) { console.error(e); fail('The model could not be loaded. Check your connection and reopen this page.'); });
})();
