// 无头 Chrome 逐帧采集（CDP over WebSocket，零依赖）
// 用法：node tools/capture.cjs shots.json [--out promo/public/frames] [--w 1080 --h 1920 --dpr 1] [--fps 30] [--still]
// shots.json: [{"name":"wide","from":61,"to":67,"mode":"director","color":"auto","song":1,"orbit":[0,1.2,9]} ...]
// --still：每个镜头只取 from+1 秒处一帧，输出到 promo/public/stills/<name>.jpg 供检查
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes('--' + k);
const specFile = args.find(a => !a.startsWith('--') && a.endsWith('.json'));
if (!specFile) { console.error('need shots.json'); process.exit(1); }
const shots = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(opt('out', has('still') ? 'promo/public/stills' : 'promo/public/frames'));
const W = +opt('w', 1080), H = +opt('h', 1920), DPR = +opt('dpr', 1), FPS = +opt('fps', 30);
const BASE = opt('base', 'http://127.0.0.1:8123/');
const CHROME = opt('chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const GPU = has('gpu');
fs.mkdirSync(OUT, { recursive: true });

const port = 9400 + Math.floor(Math.random() * 400);
const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-chrome-'));
const chromeArgs = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${udd}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--mute-audio', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', `--window-size=${W},${H}`, 'about:blank'];
if (GPU) chromeArgs.push('--use-angle=metal', '--enable-gpu');
const chrome = spawn(CHROME, chromeArgs, { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitForDevtools() {
  for (let i = 0; i < 100; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return (await r.json()).webSocketDebuggerUrl; } catch {} await sleep(100); }
  throw new Error('devtools not reachable');
}
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = []; ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } else { for (const l of this.listeners) l(m); } }; }
  send(method, params = {}, sessionId) { const id = ++this.id; return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params, sessionId })); }); }
  on(fn) { this.listeners.push(fn); }
}
async function main() {
  const wsUrl = await waitForDevtools();
  const ws = new WebSocket(wsUrl); await new Promise(r => ws.onopen = r);
  const cdp = new CDP(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
  const evalJS = async (expr) => { const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '')); return r.result.value; };
  let currentKey = '';
  const t0 = Date.now(); let frames = 0;
  for (const shot of shots) {
    const key = `${shot.song ?? 1}|${shot.mode}|${shot.color || 'auto'}|${shot.shot || ''}|${shot.wire ? 'w' : ''}|${shot.ui ? 'u' : ''}|${JSON.stringify(shot.orbitFrom || shot.orbit || [])}`;
    if (key !== currentKey) {
      const q = `capture=1&${shot.ui ? '' : 'hideui=1&'}song=${shot.song ?? 1}&mode=${shot.mode}&color=${shot.color || 'auto'}&w=${W}&h=${H}&dpr=${DPR}` + (shot.shot ? `&shot=${shot.shot}` : '') + (shot.wire ? '&wire=1' : '') + (shot.orbit ? `&theta=${shot.orbit[0]}&phi=${shot.orbit[1]}&radius=${shot.orbit[2]}` : '');
      await S('Page.navigate', { url: BASE + '?' + q + '&v=' + Date.now() });
      for (let i = 0; i < 600; i++) { try { if (await evalJS('!!(window.__live&&window.__live.ready)')) break; } catch {} await sleep(100); if (i === 599) throw new Error('page never ready'); }
      currentKey = key;
      const o0 = shot.orbitFrom || shot.orbit, o1 = shot.orbitTo || shot.orbit || shot.orbitFrom;
      if (o0) await evalJS(`window.__live.setOrbit(${o0[0]},${o0[1]},${o0[2]})`);
      if (shot.ui) await evalJS('window.__live.setUI(true)');
      // 预热两帧，让着色器与字体就绪
      await evalJS(`window.__live.seek(${shot.from})`); await evalJS(`window.__live.seek(${shot.from + 1 / FPS})`);
    }
    if (has('still')) {
      const t = shot.from + (shot.stillAt ?? 1);
      await evalJS(`window.__live.seek(${t})`); await sleep(150);      const { data } = await S('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
      const file = path.join(OUT, `${shot.name}.jpg`); fs.writeFileSync(file, Buffer.from(data, 'base64')); console.log('still', file);
      continue;
    }
    const n = Math.round((shot.to - shot.from) * FPS);
    for (let i = 0; i < n; i++) {
      const t = shot.from + i / FPS;
      if (shot.orbitFrom && shot.orbitTo) { const k = n > 1 ? i / (n - 1) : 0; const o = shot.orbitFrom.map((v, j) => v + (shot.orbitTo[j] - v) * k); await evalJS(`window.__live.setOrbit(${o[0]},${o[1]},${o[2]})`); }
      await evalJS(`window.__live.seek(${t})`);
      const { data } = await S('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
      fs.writeFileSync(path.join(OUT, `${shot.name}_${String(i).padStart(4, '0')}.png`), Buffer.from(data, 'base64'));
      frames++;
      if (i % 30 === 0) console.log(shot.name, i, '/', n, ((Date.now() - t0) / 1000).toFixed(0) + 's');
    }
    fs.writeFileSync(path.join(OUT, `${shot.name}.json`), JSON.stringify({ from: shot.from, to: shot.to, fps: FPS, frames: n, mode: shot.mode, color: shot.color, song: shot.song }));
  }
  console.log('done', frames, 'frames in', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  ws.close(); chrome.kill('SIGTERM'); await sleep(300); try { fs.rmSync(udd, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} process.exit(0);
}
main().catch(async e => { console.error('CAPTURE_ERROR', e); chrome.kill('SIGTERM'); await sleep(500); try { fs.rmSync(udd, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} process.exit(1); });
