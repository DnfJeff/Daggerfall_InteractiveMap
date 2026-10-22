// Launches the desktop exe with WebView2 remote debugging and evaluates expressions in the page.
//   node scripts/exe-probe.mjs <path-to-exe> "<js expression>" ["<js expression>" ...]
// Leaves the app running only if --keep is passed.
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const [exe, ...exprs] = args.filter((a) => a !== '--keep');
const port = 9333;
const child = spawn(exe, [], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
  detached: true,
  stdio: 'ignore',
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find((t) => t.type === 'page');
  } catch { /* not up yet */ }
}
if (!target) { console.error('no webview page found'); process.exit(1); }
console.log('page:', target.url);

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const evaluate = (expression) => new Promise((resolve) => {
  const n = ++id;
  pending.set(n, resolve);
  ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
});

await sleep(1500);
for (const e of exprs) {
  const r = await evaluate(e);
  console.log('>', e, '\n ', JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.text ?? r));
}
ws.close();
if (!keep) process.kill(child.pid);
process.exit(0);
