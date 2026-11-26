// STARRY LIVE · 浏览器互动演唱会
// 结构：渲染器/场景 → 场地 → 角色 → 灯海 → 灯光 → 音频特征 → 相机 → UI → 主循环 → 采集接口
import * as THREE from './vendor/three.module.js';
import { SONGS, LYRICS, MEMBERS, MONOLOGUE, DEFAULT_SONG } from './data.js';

const q = new URLSearchParams(location.search);
const CAPTURE = q.has('capture');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches && !CAPTURE;
const MOBILE = matchMedia('(pointer: coarse)').matches && innerWidth < 900;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);
const TAU = Math.PI * 2;
// 固定种子随机，保证每次打开的灯海布局一致
function mulberry32(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------------ 渲染器
const canvas = $('#stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04050a);
scene.fog = new THREE.FogExp2(0x04050a, 0.028);
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 90);
let W = 1080, H = 1920, PORTRAIT = true;
function resize() {
  W = CAPTURE ? +(q.get('w') || 1080) : innerWidth;
  H = CAPTURE ? +(q.get('h') || 1920) : innerHeight;
  PORTRAIT = H > W;
  renderer.setPixelRatio(CAPTURE ? +(q.get('dpr') || 1) : Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2));
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.fov = PORTRAIT ? 60 : 46;
  camera.updateProjectionMatrix();
}
resize();
if (!CAPTURE) addEventListener('resize', resize);

// ------------------------------------------------------------------ 场地
const STAGE_TOP = 0.9;
const dark = (c, r = 0.5, m = 0.5) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), dark(0x0a0b10, 0.32, 0.78));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const stage = new THREE.Mesh(new THREE.BoxGeometry(14, STAGE_TOP, 7.5), dark(0x0e0f16, 0.28, 0.65));
  stage.position.set(0, STAGE_TOP / 2, -3.0); scene.add(stage);
  // 台沿灯带
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.06), new THREE.MeshBasicMaterial({ color: 0xf384a5, toneMapped: false }));
  edge.position.set(0, STAGE_TOP - 0.03, 0.755); scene.add(edge);
  // 后墙 + 侧墙
  const wallMat = dark(0x0b0c13, 0.92, 0.1);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), wallMat); back.position.set(0, 6, -6.9); scene.add(back);
  const sideL = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), wallMat); sideL.rotation.y = Math.PI / 2; sideL.position.set(-12, 6, 2); scene.add(sideL);
  const sideR = sideL.clone(); sideR.rotation.y = -Math.PI / 2; sideR.position.x = 12; scene.add(sideR);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), dark(0x07080d, 1, 0)); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 9.5, 2); scene.add(ceil);
  // 桁架
  const trussMat = dark(0x8a8d98, 0.35, 0.9);
  for (const [x, y, z, len, ry] of [[0, 7.4, -2.6, 17, 0], [0, 7.4, -0.6, 17, 0], [-8.5, 4.2, -1.6, 6.4, 0], [8.5, 4.2, -1.6, 6.4, 0]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 8), trussMat);
    if (ry === 0 && len > 10) t.rotation.z = Math.PI / 2; else t.rotation.x = Math.PI / 2;
    t.position.set(x, y, z); scene.add(t);
  }
  for (const x of [-8.5, 8.5]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7.4, 8), trussMat); p.position.set(x, 3.7, -2.6); scene.add(p); }
  // 音箱堆
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.0, 1.0), dark(0x12131a, 0.6, 0.3));
    sp.position.set(sx * 7.0, STAGE_TOP + 0.5 + k * 1.02, -4.9 + k * 0.08); sp.rotation.y = -sx * 0.22; scene.add(sp);
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.8), new THREE.MeshStandardMaterial({ color: 0x2a2c35, roughness: 0.9, metalness: 0.2 }));
    grille.position.set(0, 0, 0.505); sp.add(grille);
  }
  // 音箱头 / 放大器
  for (const [x, z] of [[-3.4, -5.6], [1.3, -5.6]]) {
    const amp = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.95, 0.65), dark(0x15161d, 0.55, 0.35)); amp.position.set(x, STAGE_TOP + 0.48, z); scene.add(amp);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6), new THREE.MeshStandardMaterial({ color: 0x6d6f7a, roughness: 0.8, metalness: 0.6 })); g.position.set(0, -0.1, 0.33); amp.add(g);
  }
  // 鼓台
  const riser = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.42, 2.3), dark(0x10111a, 0.4, 0.5)); riser.position.set(0.1, STAGE_TOP + 0.21, -5.0); scene.add(riser);
}

// 鼓组（虹夏）
{
  const g = new THREE.Group(); g.position.set(0.1, STAGE_TOP + 0.42, -5.05);
  const shell = new THREE.MeshStandardMaterial({ color: 0x8e2030, roughness: 0.3, metalness: 0.45, emissive: 0x2a070d, emissiveIntensity: 0.7 });
  const head = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.6, metalness: 0.05, emissive: 0x333030, emissiveIntensity: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb9bcc6, roughness: 0.3, metalness: 0.95 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4b36a, metalness: 0.8, roughness: 0.3, emissive: 0x6b5a22, emissiveIntensity: 0.5, side: THREE.DoubleSide });
  const mk = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  mk(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 28), shell, 0, 0.52, 0.2, Math.PI / 2);
  mk(new THREE.CircleGeometry(0.48, 28), head, 0, 0.52, 0.455);
  // 印在底鼓皮上的场馆字标和偏心拾音孔。
  const skin = document.createElement('canvas');
  skin.width = skin.height = 256;
  const ink = skin.getContext('2d');
  ink.fillStyle = '#372f38';
  ink.fillRect(0, 0, 256, 256);
  ink.textAlign = 'center';
  ink.fillStyle = '#ece1ce';
  ink.font = 'bold 48px Georgia';
  ink.fillText('STARRY', 128, 124);
  ink.fillStyle = '#100f13';
  ink.beginPath(); ink.arc(173, 173, 18, 0, Math.PI * 2); ink.fill();
  const skinMap = new THREE.CanvasTexture(skin);
  skinMap.colorSpace = THREE.SRGBColorSpace;
  mk(new THREE.CircleGeometry(0.46, 48), new THREE.MeshBasicMaterial({map: skinMap}), 0, 0.52, 0.46);

  mk(new THREE.CylinderGeometry(0.24, 0.24, 0.2, 24), shell, -0.5, 0.78, 0.0, 0.35);
  mk(new THREE.CylinderGeometry(0.27, 0.27, 0.22, 24), shell, 0.5, 0.78, 0.0, 0.35);
  mk(new THREE.CylinderGeometry(0.26, 0.26, 0.16, 24), shell, -0.78, 0.68, 0.5);
  for (const [x, y, z, r] of [[-1.15, 1.15, 0.3, 0.4], [1.15, 1.15, 0.3, 0.4], [0.85, 1.45, -0.35, 0.34], [-0.85, 1.4, -0.3, 0.3]]) {
    mk(new THREE.CylinderGeometry(r, r, 0.02, 32), gold, x, y, z, 0, 0, 0.06);
    mk(new THREE.CylinderGeometry(0.015, 0.015, y, 6), metal, x, y / 2, z);
  }
  mk(new THREE.CylinderGeometry(0.015, 0.015, 0.95, 6), metal, 0, 0.5, 0.45);
  scene.add(g);
}
// 话筒架（喜多）
{
  const metal = new THREE.MeshStandardMaterial({ color: 0xb9bcc6, roughness: 0.3, metalness: 0.95 });
  const g = new THREE.Group(); g.position.set(1.55, STAGE_TOP, -2.75);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.35, 6), metal); pole.position.y = 0.675; g.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.03, 20), metal); base.position.y = 0.015; g.add(base);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), metal); arm.position.set(0.0, 1.42, -0.18); arm.rotation.x = -1.0; g.add(arm);
  const mic = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.1, 4, 10), new THREE.MeshStandardMaterial({ color: 0x22232b, roughness: 0.5, metalness: 0.7 })); mic.position.set(0, 1.55, -0.4); mic.rotation.x = -1.0; g.add(mic);
  scene.add(g);
}
// 吉他/贝斯（简化造型，分别贴在波奇、喜多、凉身前）
// ------------------------------------------------------------------ 官方型号乐器（billboard）
// 波奇 Gibson Les Paul Custom（黑）/ 喜多 Gibson Les Paul Jr.（Pelham Blue）/ 凉 Fender P-Bass（白）
// 依据官方联动产品图重绘为动画画风，透明底
const insts = {};
async function loadInstruments() {
  const defs = [
    { key: 'guitarB', file: 'assets/inst/bocchi.png', len: 1.08, pos: [-2.02, STAGE_TOP + 0.54, -3.66], rot: -0.1, phase: 1.3 },
    { key: 'guitarK', file: 'assets/inst/kita.png', len: 0.95, pos: [2.28, STAGE_TOP + 0.48, -3.62], rot: -0.14, phase: 3.9 },
    { key: 'bassR', file: 'assets/inst/ryo.png', len: 1.1, pos: [-2.68, STAGE_TOP + 0.55, -3.24], rot: -0.08, phase: 2.2 }
  ];
  await Promise.all(defs.map(async d => {
    const tex = await loader.loadAsync(d.file); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const h = d.len, w = h * tex.image.width / tex.image.height;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, toneMapped: false, depthWrite: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(...d.pos); mesh.rotation.z = d.rot; mesh.renderOrder = 6; mesh.userData.noWire = true; scene.add(mesh);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(w * 0.42, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(d.pos[0], STAGE_TOP + 0.015, d.pos[2] + 0.05); shadow.userData.noWire = true; scene.add(shadow);
    insts[d.key] = { mesh, mat, baseY: d.pos[1], rot: d.rot, phase: d.phase };
  }));
}

// ------------------------------------------------------------------ 背景屏
const screenCanvas = document.createElement('canvas'); screenCanvas.width = 1024; screenCanvas.height = 460;
const sctx = screenCanvas.getContext('2d');
const screenTex = new THREE.CanvasTexture(screenCanvas); screenTex.colorSpace = THREE.SRGBColorSpace;
const screen = new THREE.Mesh(new THREE.PlaneGeometry(8.8, 3.95), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
screen.position.set(0, 4.0, -6.85); screen.userData.noWire = true; scene.add(screen);
let screenKey = '';
function drawScreen(song, lyric, t, pulse, energy, flare) {
  const key = `${song?.id}|${lyric}|${pulse > 0.5 ? 1 : 0}|${flare ? 1 : 0}`;
  if (key === screenKey) return; screenKey = key;
  const c = sctx, w = 1024, h = 460;
  const grad = c.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, flare ? '#3a0f2a' : '#0c0a16'); grad.addColorStop(0.5, flare ? '#5a1233' : '#14101f'); grad.addColorStop(1, flare ? '#1a1038' : '#0c0a16');
  c.fillStyle = grad; c.fillRect(0, 0, w, h);
  // 节拍光环
  c.strokeStyle = flare ? `rgba(243,132,165,${0.25 + pulse * 0.5})` : `rgba(243,132,165,${0.12 + pulse * 0.35})`;
  c.lineWidth = 6; c.beginPath(); c.arc(w / 2, h * 0.42, 150 + pulse * 60 + energy * 40, 0, TAU); c.stroke();
  c.fillStyle = '#f384a5'; c.font = '72px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.shadowColor = 'rgba(243,132,165,.9)'; c.shadowBlur = 24;
  c.fillText('STARRY', w / 2, h * 0.36); c.shadowBlur = 0;
  c.fillStyle = 'rgba(242,239,233,.7)'; c.font = '26px Xiaolai, "PingFang SC", sans-serif';
  c.fillText(song ? `${song.title}  ·  ${song.zh}` : '結束バンド', w / 2, h * 0.63);
  if (lyric) { c.fillStyle = '#f2efe9'; c.font = '34px Xiaolai, "PingFang SC", sans-serif'; c.fillText(lyric, w / 2, h * 0.84); }
  screenTex.needsUpdate = true;
}

// ------------------------------------------------------------------ 角色
const MEM = Object.fromEntries(MEMBERS.map(m => [m.key, m]));
// [x, z, 高度]：波奇蹲在台前、喜多跳起、虹夏在鼓组后、凉躺在台侧（官方展览立绘姿势）
const CHAR_POS = { ryo: [-3.7, -3.3, 1.15], bocchi: [-1.25, -3.5, 1.78], kita: [1.35, -3.5, 2.12], nijika: [0.1, -5.0, 2.3] };
const chars = {};
const glowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'); const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(cv); return t; })();
const loader = new THREE.TextureLoader();
async function loadChars() {
  await Promise.all(MEMBERS.map(async (m, idx) => {
    const tex = await loader.loadAsync(`assets/char/${m.key}.png`); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const [x, z, h] = CHAR_POS[m.key];
    const baseY = STAGE_TOP + (m.key === 'nijika' ? 0.42 : 0);
    const w = h * tex.image.width / tex.image.height;    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide, toneMapped: false, depthWrite: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, baseY + h / 2, z); mesh.renderOrder = 5; mesh.userData.noWire = true; scene.add(mesh);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.35, h * 1.25), new THREE.MeshBasicMaterial({ map: glowTex, color: m.hex, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.position.set(x, baseY + h / 2, z - 0.08); glow.renderOrder = 4; glow.userData.noWire = true; scene.add(glow);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.1, w * 0.5), new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(x, baseY + 0.012, z + 0.1); shadow.userData.noWire = true; scene.add(shadow);
    chars[m.key] = { mesh, glow, mat, baseY, h, phase: idx * 1.3, x, z, color: new THREE.Color(m.hex) };
  }));
}

// ------------------------------------------------------------------ 灯海
const rnd = mulberry32(20261125);
const N_PEN = CAPTURE ? +(q.get('pen') || 3600) : (MOBILE ? 1100 : 3600);
const N_HEAD = MOBILE ? 700 : 1500;
const PALETTE = [0xf384a5, 0xffcf00, 0xf05960, 0x0083c4, 0xa583fa, 0x57d4bc, 0xffa45f, 0x69baff].map(c => new THREE.Color(c));
const crowd = { pen: [], head: [] };
function crowdPoint() {
  const z = 3.2 + Math.pow(rnd(), 0.85) * 11.5; const hw = 3.2 + z * 0.47;
  return [((rnd() * 2 - 1) * hw), z];
}
const penGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.34, 6);
const penMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
const tintUniforms = { uTint: { value: new THREE.Color(0xffffff) }, uMix: { value: 0 } };
penMat.onBeforeCompile = (sh) => { sh.uniforms.uTint = tintUniforms.uTint; sh.uniforms.uMix = tintUniforms.uMix; sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uTint * (0.55 + 0.45 * diffuseColor.rgb), uMix);').replace('void main() {', 'uniform vec3 uTint; uniform float uMix;\nvoid main() {'); };
const penMesh = new THREE.InstancedMesh(penGeo, penMat, N_PEN); penMesh.frustumCulled = false; penMesh.userData.noWire = true; scene.add(penMesh);
const glowGeo = new THREE.BufferGeometry(); glowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_PEN * 3), 3));
glowGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N_PEN * 3), 3));
const glowMat = new THREE.PointsMaterial({ size: 0.26, map: glowTex, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, sizeAttenuation: true, toneMapped: false });
glowMat.onBeforeCompile = (sh) => { sh.uniforms.uTint = tintUniforms.uTint; sh.uniforms.uMix = tintUniforms.uMix; sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uTint * (0.55 + 0.45 * diffuseColor.rgb), uMix);').replace('void main() {', 'uniform vec3 uTint; uniform float uMix;\nvoid main() {'); };
const glowPts = new THREE.Points(glowGeo, glowMat); glowPts.frustumCulled = false; glowPts.userData.noWire = true; scene.add(glowPts);
for (let i = 0; i < N_PEN; i++) {
  const [x, z] = crowdPoint();
  const zone = Math.floor((x + 15) / 3.5 + Math.sin(z * 0.62) * 1.5);
  const accent = rnd() < 0.72 ? Math.floor(rnd() * 2) : Math.floor(rnd() * PALETTE.length);
  const c = PALETTE[(zone + accent + PALETTE.length) % PALETTE.length];
  crowd.pen.push({ x, z, y: 1.28 + rnd() * 0.38, ph: rnd() * TAU, amp: 0.08 + rnd() * 0.1, jump: rnd() < 0.35 ? 1 : 0.3, c });
  penMesh.setColorAt(i, c);
  glowGeo.attributes.color.setXYZ(i, c.r, c.g, c.b);
}
penMesh.instanceColor.needsUpdate = true;
const headMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0x0d0e15 }), N_HEAD);
headMesh.frustumCulled = false; headMesh.userData.noWire = true; scene.add(headMesh);
const bodyMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.55, 0.24), new THREE.MeshBasicMaterial({ color: 0x0b0c12 }), N_HEAD);
bodyMesh.frustumCulled = false; bodyMesh.userData.noWire = true; scene.add(bodyMesh);
for (let i = 0; i < N_HEAD; i++) { const [x, z] = crowdPoint(); crowd.head.push({ x, z, y: 0.92 + rnd() * 0.12, ph: rnd() * TAU, jump: rnd() < 0.3 ? 1 : 0.25 }); }
const dummy = new THREE.Object3D();
// 节拍辅助：返回当前帧相对小节首拍的位置（帧）
function downbeatPhase(t) { if (!feat) return 1e9; const bf = feat.beatFrames, off = feat.beatOffsetFrame, barF = bf * 4; return (((Math.round(t * feat.fps) - off) % barF) + barF) % barF; }
// 小节第一拍上的平滑起跳包络 0..1（替代逐帧脉冲，消除抖动）
function downbeatK(t) { if (!feat) return 0; const bf = feat.beatFrames, ph = downbeatPhase(t); if (ph > bf * 0.85) return 0; return Math.sin(Math.PI * ph / (bf * 0.85)); }
function updateCrowd(t, pulse, energy, flare, swayHz) {
  const k = 1 + energy * 0.7 + flare * 0.4;
  const jump = downbeatK(t);
  const swayT = t * swayHz * TAU;
  const pos = glowGeo.attributes.position;
  for (let i = 0; i < N_PEN; i++) {
    const p = crowd.pen[i]; const w = swayT + p.ph;
    const x = p.x + Math.sin(w) * p.amp * k; const y = p.y + jump * (0.05 + 0.16 * p.jump) * k;
    dummy.position.set(x, y, p.z); dummy.rotation.set(0, 0, Math.sin(w) * 0.18 * k); dummy.scale.setScalar(1); dummy.updateMatrix();
    penMesh.setMatrixAt(i, dummy.matrix); pos.setXYZ(i, x, y, p.z);
  }
  penMesh.instanceMatrix.needsUpdate = true; pos.needsUpdate = true;
  glowMat.size = (0.26 + flareMix * 0.14) * (mode === 'bocchi' ? 1.3 : 1); glowMat.opacity = Math.min(0.8, (0.42 + flareMix * 0.3 + pulse * 0.1) * (mode === 'bocchi' ? 1.15 : 1));
  for (let i = 0; i < N_HEAD; i++) {
    const h = crowd.head[i]; const w = swayT + h.ph;
    dummy.position.set(h.x + Math.sin(w) * 0.06 * k, h.y + jump * 0.08 * h.jump * k, h.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
    headMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.y -= 0.42; dummy.updateMatrix(); bodyMesh.setMatrixAt(i, dummy.matrix);
  }
  headMesh.instanceMatrix.needsUpdate = true; bodyMesh.instanceMatrix.needsUpdate = true;
}

// ------------------------------------------------------------------ 灯光
scene.add(new THREE.AmbientLight(0x404050, 0.32));
const hemi = new THREE.HemisphereLight(0x6a4a66, 0x0a0a10, 0.3); scene.add(hemi);
const beamGeo = new THREE.ConeGeometry(1, 1, 28, 1, true); beamGeo.translate(0, -0.5, 0);
const beams = [];
function addSpot(color, x, y, z, angle, base, targetZ = -3.6) {
  const light = new THREE.SpotLight(color, base, 40, angle, 0.55, 1.4);
  light.position.set(x, y, z); light.target.position.set(0, 1.5, targetZ); scene.add(light, light.target);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
  beam.renderOrder = 3; scene.add(beam);
  beams.push({ light, beam, base, angle, home: new THREE.Vector3(x, y, z), targetZ });
  return beams[beams.length - 1];
}
const memberSpots = [
  addSpot(MEM.bocchi.hex, -5.2, 7.3, -2.6, 0.3, 14),
  addSpot(MEM.nijika.hex, -1.7, 7.3, -0.8, 0.26, 12, -5.0),
  addSpot(MEM.kita.hex, 1.7, 7.3, -0.8, 0.3, 14),
  addSpot(MEM.ryo.hex, 5.2, 7.3, -2.6, 0.3, 14)
];
const washA = addSpot(0xffffff, -4.5, 7.0, 5.5, 0.5, 8, -3.5);
const washB = addSpot(0xffd9e6, 4.5, 7.0, 5.5, 0.5, 8, -3.5);
// 观众席补光（让灯海里的人头有轮廓）
const audA = addSpot(0xffe6f0, -6, 8.2, 2.0, 0.75, 26, 8.5);
const audB = addSpot(0xdfeaff, 6, 8.2, 2.0, 0.75, 26, 8.5);
// 频闪灯条
const strobes = [];
for (let i = 0; i < 10; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.18), new THREE.MeshBasicMaterial({ color: 0x111218, toneMapped: false })); s.position.set(-7.2 + i * 1.6, 7.25, -2.6); scene.add(s); strobes.push(s); }
// 镭射幕
const laserCanvas = document.createElement('canvas'); laserCanvas.width = 512; laserCanvas.height = 256;
{ const c = laserCanvas.getContext('2d'); c.fillStyle = 'rgba(0,0,0,0)'; c.fillRect(0, 0, 512, 256); c.fillStyle = '#fff'; for (let y = 8; y < 256; y += 18) c.fillRect(0, y, 512, 2); }
const laserTex = new THREE.CanvasTexture(laserCanvas); laserTex.wrapS = laserTex.wrapT = THREE.RepeatWrapping; laserTex.repeat.set(3, 1);
const lasers = [];
for (const [x, color] of [[-7.5, 0xf384a5], [7.5, 0x0083c4]]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 7), new THREE.MeshBasicMaterial({ map: laserTex, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
  m.position.set(x * 0.5, 4.5, -1.5); m.rotation.set(0.35, x < 0 ? 0.5 : -0.5, 0); m.renderOrder = 2; scene.add(m); lasers.push(m);
}
// 烟雾
const hazes = [];
for (let i = 0; i < 7; i++) { const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); h.position.set((rnd() * 2 - 1) * 6, 2 + rnd() * 3, -5 + rnd() * 6); h.scale.setScalar(6 + rnd() * 6); scene.add(h); hazes.push(h); }

// Each fixture has a visible lens and a soft footprint at its performer's mark.
const marks = ['bocchi', 'nijika', 'kita', 'ryo'].map((key, index) => {
  const [x, z] = CHAR_POS[key];
  const material = new THREE.MeshBasicMaterial({map: glowTex, color: MEM[key].hex,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false});
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.9), material);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(x, STAGE_TOP + (key === 'nijika' ? 0.43 : 0.014), z);
  const lens = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex, color: MEM[key].hex,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false}));
  lens.position.copy(memberSpots[index].light.position);
  scene.add(pool, lens);
  return {x, z, pool, lens};
});
let flareMix = 0;
function updateLights(t, pulse, energy, flare, dt) {
  flareMix = CAPTURE ? (flare ? 1 : 0) : lerp(flareMix, flare ? 1 : 0, Math.min(1, dt * 3));
  memberSpots.forEach((b, i) => {
    const ph = i * 1.7 + 0.4;
    const mark = marks[i];
    const phrase = songIndex + i + (REDUCED ? 0 : t / Math.max(6, feat.beat * 32));
    const base = Math.floor(phrase);
    const color = b.light.color.copy(PALETTE[base % PALETTE.length])
      .lerp(PALETTE[(base + 1) % PALETTE.length], smooth(phrase - base));
    b.beam.material.color.copy(color);
    mark.lens.material.color.copy(color);
    mark.pool.material.color.copy(color);
    const sway = REDUCED ? 0 : Math.sin(t * 0.44 + ph);
    const spread = flareMix * (i % 2 ? 1 : -1);
    b.light.target.position.set(mark.x + sway * 0.32 + spread * 2.2,
      1.1, mark.z + flareMix * (2.7 + sway));
    mark.pool.material.opacity = 0.28 + energy * 0.26;
    mark.lens.scale.setScalar(0.48 + energy * 0.25 + flareMix * 0.22);
    const inten = (b.base + pulse * 34 + energy * 20) * (1 + flareMix * 0.7);
    b.light.intensity = REDUCED ? b.base * 0.8 : inten;
    b.light.angle = b.angle * (1 - pulse * 0.12);
    // 光锥
    const dir = new THREE.Vector3().subVectors(b.light.target.position, b.light.position); const len = dir.length(); dir.normalize();
    b.beam.position.copy(b.light.position); b.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    const r = len * Math.tan(b.light.angle); b.beam.scale.set(r, len, r);
    const crowdSweep = mode === 'bocchi' ? 0 : (b.light.target.position.z > 0 ? 0.35 : 1);
    b.beam.material.opacity = (0.014 + pulse * 0.016 + energy * 0.018) * (1 + flareMix * 0.6) * crowdSweep;
  });
  washA.light.intensity = 8 + energy * 14; washB.light.intensity = 8 + energy * 14;
  audA.light.intensity = (16 + energy * 22 + flareMix * 20) * (mode === 'bocchi' ? 1.3 : 1); audB.light.intensity = (16 + energy * 22 + flareMix * 20) * (mode === 'bocchi' ? 1.3 : 1);
  // 观众灯锥保持很淡
  for (const b of [audA, audB]) b.beam.material.opacity = 0;
  // 频闪：只在副歌的小节首拍上整排同闪，取代逐帧随机闪烁
  const db = downbeatPhase(t);
  strobes.forEach((s) => { const on = !REDUCED && flare && db < 2.5; s.material.color.setHex(on ? 0xffffff : 0x111218); });
  lasers.forEach((m, i) => {
    m.material.opacity = REDUCED ? 0 : flareMix * (0.045 + energy * 0.09);
    m.rotation.z = (i ? -1 : 1) * (0.18 + Math.sin(t * 0.31) * 0.12);
    m.material.map.offset.y = REDUCED ? 0 : (t * 0.055) % 1;
  });
  hazes.forEach((h, i) => {
    h.position.x = Math.sin(i * 2.4 + (REDUCED ? 0 : t * 0.09)) * 5;
    h.material.opacity = (0.016 + energy * 0.026 + flareMix * 0.018) * (mode === 'bocchi' ? 0.4 : 1);
  });
  // 灯色
  const tintTarget = tintColor; tintUniforms.uTint.value.lerp(tintTarget, CAPTURE ? 1 : Math.min(1, dt * 4)); tintUniforms.uMix.value = lerp(tintUniforms.uMix.value, tintOn ? 0.69 : 0, CAPTURE ? 1 : Math.min(1, dt * 3));
}
// 举灯颜色状态
let tintColor = new THREE.Color(0xffffff), tintOn = false;
function setColor(key, announce = false) {
  if (announce) toast(key === 'auto' ? '已恢复自动灯色' : '已为' + MEM[key].name + '举灯');
  tintOn = key !== 'auto'; if (tintOn) tintColor.setHex(MEM[key].hex);
  $$('.call').forEach(b => {
    const selected = b.dataset.color === key;
    b.classList.toggle('on', selected);
    b.setAttribute('aria-pressed', String(selected));
  });
}

// ------------------------------------------------------------------ 角色动画（平滑律动：锁定节拍相位的连续正弦，无脉冲跳变）
function updateChars(t, pulse, energy, flare, swayHz) {
  const grooveHz = swayHz * 2; // 半拍频率的连续律动
  for (const m of MEMBERS) {
    const c = chars[m.key]; if (!c) continue;
    const amp = m.key === 'kita' ? 0.07 : m.key === 'ryo' ? 0.012 : m.key === 'nijika' ? 0.026 : 0.04;
    const g = 0.5 + 0.5 * Math.sin(t * grooveHz * TAU + c.phase);
    c.mesh.position.y = c.baseY + c.h / 2 + g * amp * (0.45 + 0.55 * energy);
    c.mesh.rotation.z = Math.sin(t * grooveHz * TAU + c.phase + 0.4) * 0.03 * (0.4 + energy);
    c.mesh.scale.set(1, 1 + 0.012 * Math.sin(t * grooveHz * TAU + c.phase - 0.5) * (0.5 + energy), 1);
    const li = 0.72 + energy * 0.3 + flareMix * 0.08;
    c.mat.color.setScalar(li);
    c.glow.material.opacity = 0.05 + energy * 0.1 + flareMix * 0.12;
  }
  for (const k in insts) {
    const d = insts[k]; if (!d.mesh) continue;
    const g = 0.5 + 0.5 * Math.sin(t * grooveHz * TAU + d.phase);
    d.mesh.position.y = d.baseY + g * 0.02 * (0.4 + energy);
    d.mesh.rotation.z = d.rot + Math.sin(t * grooveHz * TAU + d.phase + 0.4) * 0.012;
  }
}

// ------------------------------------------------------------------ 音频特征
let feat = null, songIndex = DEFAULT_SONG;
const featCache = {};
async function loadFeatures(id) {
  if (featCache[id]) return featCache[id];
  const f = await fetch(`assets/audio/${encodeURIComponent(SONGS[id].title)}.json`).then(r => r.json());
  const n = f.frames; const pulse = new Float32Array(n); const energy = new Float32Array(n); const density = new Float32Array(n); const flare = new Uint8Array(n);
  for (const o of f.onsets) for (let k = 0; k < 8 && o + k < n; k++) pulse[o + k] = Math.max(pulse[o + k], 1 - k / 8);
  const raw = new Float32Array(n); for (let i = 0; i < n; i++) raw[i] = 0.5 * f.bass[i] + 0.3 * f.mid[i] + 0.2 * f.high[i];
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = -15; k <= 15; k++) { const j = i + k; if (j >= 0 && j < n) { s += raw[j]; c++; } } energy[i] = s / c; }
  // 包络自身做 p5–p95 归一化，拉开主歌/副歌的动态范围
  const robust = (arr) => { const s = Float32Array.from(arr).sort(); return [s[Math.floor(s.length * 0.05)], s[Math.floor(s.length * 0.95)]]; };
  const [e5, e95] = robust(energy); for (let i = 0; i < n; i++) energy[i] = clamp((energy[i] - e5) / Math.max(1e-6, e95 - e5), 0, 1);
  const onsetSet = new Set(f.onsets); let cnt = 0;
  for (let i = 0, acc = 0; i < n; i++) { if (onsetSet.has(i)) acc++; if (i >= 60 && onsetSet.has(i - 60)) acc--; density[i] = acc; }
  const [d5, d95] = robust(density); for (let i = 0; i < n; i++) density[i] = clamp((density[i] - d5) / Math.max(1e-6, d95 - d5), 0, 1);
  // 平滑脉冲：±5 帧滑动平均，让灯与角色不再逐帧抽搐
  const pulseS = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k2 = -5; k2 <= 5; k2++) { const j = i + k2; if (j >= 0 && j < n) { s += pulse[j]; c++; } } pulseS[i] = s / c; }
  let hype = 0, hold = 0, on = 0;
  for (let i = 0; i < n; i++) {
    hype = lerp(hype, 0.6 * energy[i] + 0.4 * density[i], 0.08);
    if (!on && hype > 0.58) { hold++; if (hold > 45) { on = 1; hold = 0; } } else if (on && hype < 0.46) { hold++; if (hold > 60) { on = 0; hold = 0; } } else hold = 0;
    flare[i] = on;
  }
  const beat = 60 / f.bpm / (f.bpm < 120 ? 2 : 1);
  const beatFrames = Math.max(2, Math.round(beat * f.fps));
  const out = { ...f, pulse, pulseS, energy, density, flare, beat, beatFrames, beatOffsetFrame: Math.round(f.beatOffset), swayHz: clamp(f.bpm / 240, 0.55, 1.1) };
  featCache[id] = out; return out;
}
const idxAt = (t) => feat ? clamp(Math.floor(t * feat.fps), 0, feat.frames - 1) : 0;

// ------------------------------------------------------------------ 相机
let mode = CAPTURE ? (q.get('mode') || 'director') : 'director';
const orbit = { theta: +(q.get('theta') || 0), phi: +(q.get('phi') || 1.22), radius: +(q.get('radius') || 9.5), target: new THREE.Vector3(0, 1.9, -3.4) };
const SHOTS = {
  // 每个机位是一条 4 秒内的镜头内运动（a→b 缓动），切镜为硬切，不再跨机位插值
  wide:     { a: [0, 4.6, 15.8], la: [0, 2.2, -3.6], b: [0, 3.9, 13.6], lb: [0, 2.1, -3.6] },
  mid:      { a: [0, 4.8, 8.0], la: [0, 2.0, -3.6], b: [0, 4.1, 6.6], lb: [0, 1.95, -3.6] },
  low:      { a: [-0.8, 1.6, 2.6], la: [0, 2.6, -3.6], b: [0.7, 1.85, 2.2], lb: [0.2, 2.5, -3.6] },
  bocchi:   { a: [-0.85, 2.05, -1.25], la: [-1.25, 1.95, -3.6], b: [-0.5, 1.85, -1.6], lb: [-1.2, 1.9, -3.55] },
  kita:     { a: [0.75, 2.1, -1.35], la: [1.35, 1.95, -3.6], b: [0.3, 1.95, -1.05], lb: [1.3, 1.9, -3.55] },
  ryo:      { a: [-1.8, 2.0, -1.5], la: [-3.4, 1.9, -3.9], b: [-2.4, 1.75, -1.15], lb: [-3.3, 1.85, -3.9] },
  nijika:   { a: [-0.3, 2.6, -2.7], la: [0.1, 2.2, -5.0], b: [0.55, 2.35, -2.25], lb: [0.05, 2.15, -5.0] },
  crowd:    { a: [0, 2.75, -1.2], la: [0, 1.5, 9], b: [0.5, 2.45, -0.9], lb: [0.4, 1.45, 9] },
  crowdPOV: { a: [0, 1.75, 10.5], la: [0, 2.3, -2.8], b: [0.2, 1.8, 7.5], lb: [0.1, 2.15, -3.0] },
  crane:    { a: [0, 7.8, 6.0], la: [0, 1.4, -3.4], b: [0.4, 3.2, 7.0], lb: [0.2, 1.9, -3.5] },
  track:    { a: [-7.0, 2.7, 2.2], la: [-1.2, 2.0, -3.6], b: [7.0, 2.7, 2.2], lb: [1.2, 2.0, -3.6] },
  aerial:   { a: [0, 8.6, 6.2], la: [0, 1.2, -2.4], b: [1.6, 8.1, 4.6], lb: [0.3, 1.2, -2.4] },
  side:     { a: [7.8, 3.0, 1.6], la: [-0.6, 2.0, -3.8], b: [6.8, 2.75, 0.4], lb: [-0.4, 2.0, -3.6] }
};
const SHOT_ORDER = ['wide', 'mid', 'bocchi', 'crowd', 'kita', 'crowdPOV', 'nijika', 'track', 'ryo', 'low', 'crowd', 'bocchi', 'crane', 'side', 'mid', 'aerial'];
let shotCache = { song: null, list: [] };
const PIN_SHOT = CAPTURE ? q.get('shot') : null;
function directorShot(t) {
  if (!feat) return { name: 'wide', since: 0, prev: 'wide' };
  if (PIN_SHOT) return { name: PIN_SHOT, since: t - (t % 4), len: 4, prev: PIN_SHOT };
  if (shotCache.song !== songIndex) {
    const beats = feat.beat; const offset = feat.beatOffset / feat.fps; const list = [];
    let cursor = offset, k = 0;
    while (cursor < feat.duration + 10) {
      const e = feat.energy[idxAt(cursor)] || 0;
      const bars = e > 0.55 ? 2 : 4; // 高能 2 小节一切，低能 4 小节
      const len = bars * 4 * beats;
      const name = k === 0 ? 'mid' : SHOT_ORDER[(k + songIndex * 3) % SHOT_ORDER.length];
      list.push({ name, since: cursor, len, prev: k ? list[k - 1].name : 'wide' }); k++; cursor += len;
    }
    shotCache = { song: songIndex, list };
  }
  const s = shotCache.list.find(x => t >= x.since && t < x.since + x.len) || shotCache.list[0];
  return s;
}
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
let camBlend = 0; // 仅在手动切模式后的短暂过渡，切镜一律硬切
function updateCamera(t, pulse, dt = 1 / 30) {
  let pos, look, fov = PORTRAIT ? 60 : 46;
  if (mode === 'director') {
    const s = directorShot(t);
    const sh = SHOTS[s.name] || SHOTS.wide;
    const k = smooth(clamp((t - s.since) / Math.min(s.len, 4), 0, 1));
    pos = tmpA.set(lerp(sh.a[0], sh.b[0], k), lerp(sh.a[1], sh.b[1], k), lerp(sh.a[2], sh.b[2], k));
    look = tmpB.set(lerp(sh.la[0], sh.lb[0], k), lerp(sh.la[1], sh.lb[1], k), lerp(sh.la[2], sh.lb[2], k));
    if (!REDUCED) { pos.x += Math.sin(t * 0.9) * 0.02; pos.y += Math.sin(t * 1.3) * 0.015; }
    fov -= pulse * 0.8;
  } else if (mode === 'free') {
    const r = orbit.radius * (PORTRAIT ? 0.82 : 1);
    pos = tmpA.set(orbit.target.x + r * Math.sin(orbit.phi) * Math.sin(orbit.theta), orbit.target.y + r * Math.cos(orbit.phi), orbit.target.z + r * Math.sin(orbit.phi) * Math.cos(orbit.theta));
    look = tmpB.copy(orbit.target);
  } else { // 波奇视角
    pos = tmpA.set(-1.25 + Math.sin(t * 0.8) * 0.02, 2.55 + Math.sin(t * 1.6) * 0.012, -3.05);
    look = tmpB.set(0.3 + Math.sin(t * 0.5) * 0.6, 1.3, 12);
    fov = PORTRAIT ? 70 : 58;
  }
  const f = CAPTURE ? 1 : (camBlend > 0 ? 0.16 : 1);
  camBlend = Math.max(0, camBlend - dt);
  if (camera.userData.init) { camPos.lerp(pos, f); camLook.lerp(look, f); } else { camPos.copy(pos); camLook.copy(look); camera.userData.init = true; }
  camera.position.copy(camPos); camera.lookAt(camLook); camera.fov = lerp(camera.fov, fov, CAPTURE ? 1 : 0.2); camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ 音频
const audio = new Audio(); audio.preload = 'auto';
let actx = null, analyser = null, gain = null;
if (!CAPTURE) {
  actx = new (window.AudioContext || window.webkitAudioContext)();
  const src = actx.createMediaElementSource(audio); analyser = actx.createAnalyser(); analyser.fftSize = 256; gain = actx.createGain();
  src.connect(analyser); analyser.connect(gain); gain.connect(actx.destination);
}
let playing = false, pausedT = 0;
const lrcCache = {};
function parseLrc(id) {
  if (lrcCache[id]) return lrcCache[id];
  const lines = (LYRICS[id] || '').split('\n').map(l => { const m = l.match(/\[(\d+):(\d+\.?\d*)\](.*)/); return m ? { t: +m[1] * 60 + +m[2], text: m[3].trim() } : null; }).filter(x => x && x.text && !/^(作词|作曲|编曲)/.test(x.text));
  lrcCache[id] = lines; return lines;
}
let curLyric = '', curMono = -1, monoShownAt = -99;
let songRequest = 0;
async function loadSong(i, autoplay = false, at = 0) {
  songIndex = (i + SONGS.length) % SONGS.length; const s = SONGS[songIndex];
  const es = $('#entryStatus'); if (es) es.textContent = '正在调音……';
  audio.src = encodeURI(s.src); audio.load();
  const request = ++songRequest;
  const features = await loadFeatures(songIndex);
  if (request !== songRequest) return;
  feat = features;
  pausedT = at; curLyric = ''; curMono = -1; monoShownAt = -99; screenKey = '';
  $('#cover').src = encodeURI(s.cover); $('#songTitle').textContent = s.title; $('#songZh').textContent = s.zh;
  $('#timeText').textContent = `0:00 / ${fmt(s.duration)}`;
  $$('#setlistList li').forEach((li, k) => li.classList.toggle('on', k === songIndex));
  if (es) es.textContent = '';
  if (autoplay) { if (actx && actx.state === 'suspended') actx.resume(); audio.currentTime = at; await audio.play().catch(() => {}); playing = !audio.paused; }
  updatePlayUI();
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function updatePlayUI() {
  const button = $('#playBtn');
  button.classList.toggle('playing', playing);
  button.setAttribute('aria-label', playing ? '暂停' : '播放');
}
audio.addEventListener('play', () => { playing = true; updatePlayUI(); });
audio.addEventListener('pause', () => { playing = false; updatePlayUI(); });
audio.addEventListener('ended', () => loadSong(songIndex + 1, true));
audio.addEventListener('error', () => toast('音频加载失败，请刷新重试'));

// ------------------------------------------------------------------ UI
function setMode(m) {
  mode = m; camBlend = 0.9; $$('.mode').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  $('#pov').hidden = m !== 'bocchi'; $('#lyricWrap').style.opacity = m === 'bocchi' ? 0 : 1;
  curMono = -1; monoShownAt = -99; if (m === 'free') canvas.style.cursor = 'grab';
}
$$('.mode').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$$('.call').forEach(b => b.onclick = () => setColor(b.dataset.color, true));
$('#playBtn').onclick = () => { if (playing) audio.pause(); else { if (actx?.state === 'suspended') actx.resume(); audio.play().catch(() => {}); } };
$('#prevBtn').onclick = () => loadSong(songIndex - 1, true);
$('#nextBtn').onclick = () => loadSong(songIndex + 1, true);
$('#seek').oninput = (e) => { const v = +e.target.value / 1000; if (Number.isFinite(audio.duration)) { audio.currentTime = v * audio.duration; pausedT = audio.currentTime; } };
$('#setlistBtn').onclick = () => { $('#setlist').hidden = false; };
$('#setlistClose').onclick = () => { $('#setlist').hidden = true; };
$('#setlistList').innerHTML = SONGS.map((s, i) => `<li data-i="${i}"><img src="${encodeURI(s.cover)}" alt=""><div class="t"><b>${s.title}</b><small>${s.zh}</small></div><span class="d">${fmt(s.duration)}</span></li>`).join('');
$$('#setlistList li').forEach(li => li.onclick = () => { loadSong(+li.dataset.i, true); $('#setlist').hidden = true; });
let toastTimer; function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 1800); }
// 自由视角拖拽
let dragging = false, lx = 0, ly = 0, pinch0 = 0, touches = new Map();
canvas.addEventListener('pointerdown', (e) => { if (mode !== 'free') return; dragging = true; lx = e.clientX; ly = e.clientY; touches.set(e.pointerId, [e.clientX, e.clientY]); canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
canvas.addEventListener('pointermove', (e) => {
  if (mode !== 'free' || !dragging) return;
  if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
  if (touches.size === 2) { const [a, b] = [...touches.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) orbit.radius = clamp(orbit.radius * pinch0 / d, 3.2, 22); pinch0 = d; return; }
  orbit.theta -= (e.clientX - lx) * 0.005; orbit.phi = clamp(orbit.phi - (e.clientY - ly) * 0.004, 0.35, 1.55); lx = e.clientX; ly = e.clientY;
});
const endDrag = (e) => { dragging = false; pinch0 = 0; touches.delete(e.pointerId); canvas.style.cursor = 'grab'; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { if (mode !== 'free') return; e.preventDefault(); orbit.radius = clamp(orbit.radius * (1 + e.deltaY * 0.0012), 3.2, 22); }, { passive: false });
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); $('#playBtn').click(); }
  else if (k === 'arrowright') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
  else if (k === 'arrowleft') audio.currentTime = Math.max(0, audio.currentTime - 5);
  else if (k === 'arrowdown') loadSong(songIndex + 1, true);
  else if (k === 'arrowup') loadSong(songIndex - 1, true);
  else if (k === 'm') setMode(mode === 'director' ? 'free' : mode === 'free' ? 'bocchi' : 'director');
  else if (k === 'f') document.documentElement.requestFullscreen?.().catch(() => {});
  else if (k === 's') $('#setlist').hidden = !$('#setlist').hidden;
  else if ('1234'.includes(k)) setColor(MEMBERS[+k - 1].key, true);
  else if (k === '0') setColor('auto', true);
});
function updateUI(t) {
  const s = SONGS[songIndex];
  $('#timeText').textContent = `${fmt(t)} / ${fmt(s.duration)}`;
  if (document.activeElement !== $('#seek')) $('#seek').value = Math.round(clamp(t / s.duration, 0, 1) * 1000);
  // 歌词
  const lines = parseLrc(songIndex); let line = '';
  for (const l of lines) { if (l.t <= t) line = l.text; }
  if (line !== curLyric) { curLyric = line; const el = $('#lyric'); el.classList.remove('on'); if (line) { el.textContent = line; requestAnimationFrame(() => el.classList.add('on')); } }
  drawScreen(s, line, t, feat ? feat.pulse[idxAt(t)] : 0, feat ? feat.energy[idxAt(t)] : 0, feat ? !!feat.flare[idxAt(t)] : false);
  // 波奇独白
  if (mode === 'bocchi') {
    const prog = t / s.duration; let mi = -1; for (let i = 0; i < MONOLOGUE.length; i++) if (MONOLOGUE[i].at <= prog) mi = i;
    const fl = feat ? !!feat.flare[idxAt(t)] : false;
    const el = $('#povLine');
    if (mi !== curMono && !fl) { curMono = mi; if (mi >= 0) { el.textContent = MONOLOGUE[mi].text; el.classList.add('on'); monoShownAt = t; } }
    if (monoShownAt > -90 && t - monoShownAt > 4.2) { el.classList.remove('on'); monoShownAt = -99; }
    const pulse = feat ? feat.pulse[idxAt(t)] : 0;
    const blur = (7 * (1 - flareMix)).toFixed(1);
    document.documentElement.style.setProperty('--povBlur', `${blur}px`);
    document.documentElement.style.setProperty('--povOn', String(1 - flareMix * 0.92));
    $('.pov-flash').style.opacity = String(flareMix * (0.1 + pulse * 0.3));
    $('.pov-heart').style.boxShadow = `inset 0 0 ${60 + pulse * 50}px rgba(243,132,165,${(0.25 + pulse * 0.35) * (1 - flareMix)})`;
  }
}

// ------------------------------------------------------------------ 主循环
let lastNow = performance.now();
function tick(t, dt = 1 / 30) {
  if (!feat) { renderer.render(scene, camera); return; }
  const i = idxAt(t); const pulse = feat.pulseS[i], energy = feat.energy[i], flare = !!feat.flare[i];
  updateLights(t, pulse, energy, flare, dt);
  updateCrowd(t, pulse, energy, flare, feat.swayHz);
  updateChars(t, pulse, energy, flare, feat.swayHz);
  updateCamera(t, pulse, dt);
  updateUI(t);
  renderer.render(scene, camera);
}
function loop(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now;
  if (!CAPTURE) { if (playing && !audio.paused) pausedT = audio.currentTime; tick(pausedT, dt); requestAnimationFrame(loop); }
}
const enterButton = $('#enterBtn');
enterButton.onclick = () => {
  enterButton.disabled = true;
  $('#entry').classList.add('gone');
  setTimeout(() => $('#entry')?.remove(), 700);
  if (actx?.state === 'suspended') actx.resume();
  audio.play().catch(error => {
    if (error.name !== 'AbortError') toast('点播放键开始演出');
  });
};
$('#entryStatus').textContent = CAPTURE ? '' : '正在调音……';

// ------------------------------------------------------------------ 采集接口（无头浏览器逐帧）
window.__live = {
  ready: false,
  async seek(t) { pausedT = t; tick(t, 1 / 30); return true; },
  async setSong(i) { await loadSong(i, false); return songIndex; },
  setMode, setColor,
  setOrbit(theta, phi, radius) { orbit.theta = theta; orbit.phi = phi; orbit.radius = radius; },
  setUI(on) { document.body.classList.toggle('hide-ui', !on); const sl = document.querySelector('#setlist'); if (sl) sl.hidden = !on; },
  state: () => ({ song: songIndex, duration: feat?.duration, flareRanges: feat ? ranges(feat.flare) : [], beat: feat?.beat, shot: mode === 'director' ? directorShot(pausedT) : null }),
  debug: () => ({ tintOn, uMix: tintUniforms.uMix.value, uTint: '#' + tintUniforms.uTint.value.getHexString(), tint: '#' + tintColor.getHexString(), programs: renderer.info.programs.length, flareMix, wire: scene.traverse ? (() => { let c = 0; scene.traverse(o => { if (o.isMesh && o.material && o.material.wireframe) c++; }); return c; })() : 0 }),
  get feat() { return feat; }
};
function ranges(arr) { const out = []; let s = -1; for (let i = 0; i < arr.length; i++) { if (arr[i] && s < 0) s = i; if (!arr[i] && s >= 0) { out.push([+(s / 30).toFixed(1), +((i - 1) / 30).toFixed(1)]); s = -1; } } if (s >= 0) out.push([+(s / 30).toFixed(1), +((arr.length - 1) / 30).toFixed(1)]); return out; }

// ------------------------------------------------------------------ 启动
(async () => {
  resize();
  await Promise.all([loadChars(), loadInstruments()]);
  if (CAPTURE && q.get('wire') === '1') {
    scene.traverse(o => { if (o.isMesh && !o.userData.noWire && o.material && 'wireframe' in o.material) { o.material.wireframe = true; if (o.material.emissive) o.material.emissive.setHex(0x1d3247); } });
    scene.fog.density = 0.012;
  }
  // 字体不阻塞启动：先渲染，字体到位后歌词/屏幕会在下一次更新时自动重绘
  document.fonts.load('40px Chonburi').catch(() => {}); document.fonts.load('30px Xiaolai').catch(() => {});
  document.fonts.ready.then(() => { screenKey = ''; });
  await loadSong(CAPTURE ? +(q.get('song') || DEFAULT_SONG) : DEFAULT_SONG, false, CAPTURE ? +(q.get('t') || 0) : 0);
  if (CAPTURE) { document.body.classList.add('capture'); $('#entry').remove(); setColor(q.get('color') || 'auto'); setMode(mode); if (q.get('hideui') === '1') document.body.classList.add('hide-ui'); tick(pausedT, 1 / 30); window.__live.ready = true; }
  else { setColor('auto'); $('#entry').classList.add('ready'); enterButton.disabled = false; requestAnimationFrame(loop); }
})().catch(error => {
  console.error(error);
  const status = $('.soundcheck p');
  if (status) {
    status.textContent = '舞台加载失败，';
    const retry = document.createElement('a');
    retry.href = location.href;
    retry.textContent = '重新加载';
    status.append(retry);
  }
});
