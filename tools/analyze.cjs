// 离线分析每首歌：按 30fps 计算低/中/高频能量包络、节拍起点与 BPM，输出 assets/audio/<id>.json
// 用法：node tools/analyze.cjs   （需要 ffmpeg 在 PATH 或 /opt/homebrew/bin/ffmpeg）
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const root = path.join(__dirname, '..');
const songs = fs.readFileSync(path.join(root, 'data.js'), 'utf8').match(/export const SONGS=(\[.*?\]);\n/s);
const list = JSON.parse(songs[1]);
const SR = 22050, FPS = 30, HOP = SR / FPS;

function decode(file) {
  const r = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(r.error?.message || r.stderr.toString());
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
}
// 一阶低通
function lp(input, cutoff) {
  const a = 1 - Math.exp(-2 * Math.PI * cutoff / SR);
  const out = new Float32Array(input.length); let y = 0;
  for (let i = 0; i < input.length; i++) { y += a * (input[i] - y); out[i] = y; }
  return out;
}
function frameEnergy(sig) {
  const n = Math.floor(sig.length / HOP), e = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; const o = i * HOP; for (let j = 0; j < HOP; j++) { const v = sig[o + j]; s += v * v; } e[i] = Math.sqrt(s / HOP); }
  return e;
}
function pct(arr, p) { const s = Float32Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
function norm(arr, ref) { return Array.from(arr, v => Math.min(1.5, +(v / ref).toFixed(2))); }

for (const s of list) {
  const file = path.join(root, s.src);
  const raw = decode(file);
  const low = lp(raw, 160), midB = lp(raw, 3200);
  const eBass = frameEnergy(low), eMid = frameEnergy(midB), eHigh = frameEnergy(raw);
  const n = eBass.length;
  // 归一化（95 分位）
  const bass = norm(eBass, pct(eBass, 0.95)), mid = norm(eMid, pct(eMid, 0.95)), high = norm(eHigh, pct(eHigh, 0.95));
  // 中频 = 中低通 − 低通 近似；这里直接用 3200Hz 以下的能量作为“整体”，再用差分得到中频
  const midOnly = mid.map((v, i) => Math.max(0, +(v - bass[i] * 0.8).toFixed(2)));
  // 低频起音检测
  const onsets = []; let last = -99;
  const avg = (i) => { let a = 0, c = 0; for (let k = -6; k <= 6; k++) { const j = i + k; if (j >= 0 && j < n) { a += bass[j]; c++; } } return a / c; };
  for (let i = 1; i < n - 1; i++) {
    if (bass[i] > 0.12 && bass[i] >= bass[i - 1] && bass[i] > bass[i + 1] * 0.97 && bass[i] > avg(i) * 1.15 && i - last >= FPS * 0.22) { onsets.push(i); last = i; }
  }
  // BPM：起音包络自相关（60–200 BPM）
  const env = new Float32Array(n); for (const i of onsets) env[i] = 1; for (let i = 0; i < n; i++) env[i] = Math.max(env[i], bass[i] * 0.3);
  let best = 0, bestLag = 0;
  for (let lag = Math.round(FPS * 60 / 200); lag <= Math.round(FPS * 60 / 60); lag++) {
    let sum = 0, cnt = 0;
    for (let i = 0; i < n - lag; i += 1) { sum += env[i] * env[i + lag]; cnt++; }
    sum /= cnt; if (sum > best) { best = sum; bestLag = lag; }
  }
  const bpm = Math.round(FPS * 60 / bestLag * 10) / 10;
  // 第一拍位置：以最强起音附近对齐节拍网格
  let strongest = 0, sv = 0; for (const i of onsets) { if (bass[i] > sv) { sv = bass[i]; strongest = i; } }
  const beatOffset = ((strongest % bestLag) + bestLag) % bestLag;
  const out = { fps: FPS, frames: n, duration: +(raw.length / SR).toFixed(2), bpm, beatOffset, onsets, bass, mid: midOnly, high };
  fs.writeFileSync(path.join(root, 'assets/audio', s.title + '.json'), JSON.stringify(out));
  console.log(s.title.padEnd(20), 'dur', out.duration, 'bpm', bpm, 'onsets', onsets.length, 'frames', n);
}
