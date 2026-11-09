const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { spawn } = require('child_process');

let win = null;
let procTerm = null;   // текущий процесс терминала (powershell)
let procRun = null;    // процесс запуска кода

/* ================= утилиты FS ================= */

const IGNORE = new Set(['node_modules', '.git']);

function listDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (IGNORE.has(e.name)) continue;
    const full = path.join(dir, e.name);
    let type = 'other';
    if (e.isDirectory()) type = 'dir';
    else {
      const ext = path.extname(e.name).toLowerCase();
      if (['.class', '.pyc', '.pyo', '.wasm', '.dll', '.exe'].includes(ext)) type = 'bin';
      else type = 'file';
    }
    out.push({ name: e.name, path: full, type });
  }
  out.sort((a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name));
  return out;
}

/* ================= IPC: файлы ================= */

ipcMain.handle('fs:home', () => app.getPath('home'));

ipcMain.handle('fs:list', async (_e, dir) => {
  try { return { ok: true, entries: listDir(dir) }; }
  catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('fs:read', async (_e, file) => {
  try {
    const stat = await fsp.stat(file);
    if (file.endsWith('.wasm') || file.endsWith('.class') || file.endsWith('.pyc') || file.endsWith('.pyo') || file.endsWith('.dll') || file.endsWith('.exe')) {
      return { ok: true, kind: 'binary', size: stat.size };
    }
    const content = await fsp.readFile(file, 'utf8');
    return { ok: true, kind: 'text', content, size: stat.size };
  } catch (err) {
    // бинарный файл — вернём hex
    try {
      const buf = await fsp.readFile(file);
      if (buf.length < 5 * 1024 * 1024) return { ok: true, kind: 'binary', size: buf.length };
      return { ok: false, error: 'File is larger than 5 MB' };
    } catch (e2) { return { ok: false, error: e2.message }; }
  }
});

ipcMain.handle('fs:write', async (_e, file, content) => {
  try { await fsp.writeFile(file, content, 'utf8'); return { ok: true }; }
  catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('fs:createFile', async (_e, file) => {
  try { await fsp.writeFile(file, '', { flag: 'wx' }); return { ok: true }; }
  catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('fs:createDir', async (_e, dir) => {
  try { await fsp.mkdir(dir); return { ok: true }; }
  catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('fs:rename', async (_e, from, to) => {
  try { await fsp.rename(from, to); return { ok: true }; }
  catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('fs:delete', async (_e, target) => {
  try { await fsp.rm(target, { recursive: true }); return { ok: true }; }
  catch (err) { return { ok: false, error: err.message }; }
});

/* ================= IPC: диалоги ================= */

ipcMain.handle('dialog:openFolder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog:openFile', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (_e, defaultName) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: defaultName });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('dialog:message', async (_e, opts) => {
  const r = await dialog.showMessageBox(win, opts);
  return r;
});

/* ================= терминал (powershell) ================= */

function startTerm(cwd) {
  if (procTerm) { try { procTerm.kill(); } catch {} }
  procTerm = spawn('powershell.exe', ['-NoLogo'], { cwd: cwd || app.getPath('home'), env: { ...process.env } });
  procTerm.stdout.setEncoding('utf8');
  procTerm.stderr.setEncoding('utf8');
  procTerm.stdout.on('data', d => win?.webContents.send('term:data', d));
  procTerm.stderr.on('data', d => win?.webContents.send('term:data', d));
  procTerm.on('exit', c => win?.webContents.send('term:data', `\r\n[process exited: code ${c}]\r\n`));
}

ipcMain.on('term:start', (_e, cwd) => startTerm(cwd));

ipcMain.on('term:input', (_e, data) => {
  if (procTerm && procTerm.stdin.writable) procTerm.stdin.write(data);
});

ipcMain.on('term:stop', () => { if (procTerm) { try { procTerm.kill(); } catch {} procTerm = null; } });

/* ================= запуск кода ================= */

const RUNNERS = {
  '.py':  (f) => ({ cmd: 'python', args: [f] }),
  '.js':  (f) => ({ cmd: 'node', args: [f] }),
};

ipcMain.on('run:start', async (_e, { file, cwd, cmdline }) => {
  if (procRun) { try { procRun.kill(); } catch {} procRun = null; }
  const ext = path.extname(file).toLowerCase();
  let cmd, args;

  if (cmdline) {
    if (process.platform === 'win32') {
      cmd = 'cmd.exe'; args = ['/c', cmdline];
    } else { cmd = 'sh'; args = ['-c', cmdline]; }
  } else {
    const runner = RUNNERS[ext];
    const r = runner ? runner(file, cwd) : null;
    if (!r) {
      win?.webContents.send('run:data', `There is no auto-runner for the "${ext}" extension. Use the terminal or a custom command.`);
      win?.webContents.send('run:done');
      return;
    }
    cmd = r.cmd; args = r.args;
  }
  win?.webContents.send('run:data', `$ ${cmd} ${args.slice(1).join(' ')}\r\n`);
  try {
    procRun = spawn(cmd, args, { cwd: cwd || path.dirname(file) });
    procRun.stdout.setEncoding('utf8'); procRun.stderr.setEncoding('utf8');
    procRun.stdout.on('data', d => win?.webContents.send('run:data', d));
    procRun.stderr.on('data', d => win?.webContents.send('run:data', d));
    procRun.on('exit', c => { procRun = null; win?.webContents.send('run:done', c); win?.webContents.send('run:data', `\r\n[exit code ${c}]\r\n`); });
  } catch (err) {
    win?.webContents.send('run:data', 'Start error: ' + err.message + '\r\n');
    win?.webContents.send('run:done');
  }
});

ipcMain.on('run:input', (_e, data) => { if (procRun && procRun.stdin.writable) procRun.stdin.write(data); });
ipcMain.on('run:stop', () => { if (procRun) { try { procRun.kill(); } catch {} procRun = null; } });

/* ================= AI-чат (OpenAI-совместимый) ================= */

function aiConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function readAIConfig() {
  try {
    const txt = fs.readFileSync(aiConfigPath(), 'utf8');
    return JSON.parse(txt.replace(/^\uFEFF/, ''));
  }
  catch { return { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini', key: '', systemPrompt: 'You are an expert coding assistant. Reply concisely and use code blocks with language fences when showing code.' }; }
}

function writeAIConfig(obj) {
  try {
    fs.mkdirSync(path.dirname(aiConfigPath()), { recursive: true });
    fs.writeFileSync(aiConfigPath(), JSON.stringify(obj, null, 2));
  } catch (e) { console.error(e); }
}

ipcMain.handle('ai:getConfig', () => { const c = readAIConfig(); c.hasKey = !!c.key; c.key = c.key ? '***saved***' : ''; return c; });
ipcMain.handle('ai:saveConfig', (_e, cfg) => {
  const cur = readAIConfig();
  const merged = { ...cur, ...cfg };
  if (!cfg.key) merged.key = cur.key; // пустой ключ = не менять
  writeAIConfig(merged);
  return true;
});

ipcMain.handle('ai:models', async () => {
  const cfg = readAIConfig();
  if (!cfg.key) return { ok: false, error: 'NO_KEY', hint: 'Add an API key in settings (⚙)' };
  try {
    let base = (cfg.endpoint || '').trim().replace(/\/+$/, '');
    if (base.endsWith('/chat/completions')) base = base.slice(0, -'/chat/completions'.length);
    const r = await fetch(base + '/models', {
      headers: {
        'Authorization': 'Bearer ' + cfg.key,
        'User-Agent': 'NovausIDE/1.0',
      },
    });
    if (r.status === 401) return { ok: false, error: 'KEY_INVALID', hint: 'The API key is wrong or expired' };
    if (r.status === 403) return { ok: false, error: 'KEY_BLOCKED', hint: 'The key is denied by the provider (security policy)' };
    if (r.status === 429) return { ok: false, error: 'Rate Limit', hint: 'Too many requests — try again in a few seconds' };
    if (!r.ok) return { ok: false, error: 'HTTP ' + r.status, hint: (await r.text()).slice(0, 200) };
    const data = await r.json();
    const ids = (data.data || []).map(m => m.id).filter(Boolean).sort((a, b) => a.localeCompare(b));
    return { ok: true, models: ids, count: ids.length };
  } catch (e) {
    return { ok: false, error: e.message, hint: 'Check the endpoint URL and internet connection' };
  }
});

ipcMain.handle('ai:chat', async (_e, { messages }) => {
  const cfg = readAIConfig();
  if (!cfg.key) return { ok: false, error: 'NO_KEY', hint: 'Add an API key in settings (⚙)' };
  try {
    let base = (cfg.endpoint || '').trim().replace(/\/+$/, '');
    if (base.endsWith('/chat/completions')) base = base.slice(0, -'/chat/completions'.length); // если вписали полный путь
    const url = base + '/chat/completions';

    const FALLBACKS = [
      'nvidia/nemotron-3.5-lightning:free',
      'liquid/lfm-2.5-2.6b:free',
      'cohere/north-mini-code:free',
      'google/gemma-4-26b-a4b-it:free',
      'nvidia/nemotron-3.5-nano-omni-30b-a3b-reasoning:free',
    ];
    const models = [cfg.model, ...FALLBACKS.filter(m => m !== cfg.model)];

    let lastErr = { error: 'unknown' };
    for (const model of models) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + cfg.key,
            'User-Agent': 'NovausIDE/1.0',
            'HTTP-Referer': 'https://novaus-ide.local',
            'X-Title': 'Novaus IDE',
          },
          body: JSON.stringify({ model, messages, temperature: 0.2 }),
        });
        if (!r.ok) {
          const t = await r.text();
          if (r.status === 403) lastErr = { error: 'ERR_KEY_BLOCKED', hint: 'The key is denied by OpenRouter security policy. Create a NEW key at openrouter.ai/settings/keys' };
          else if (r.status === 429) lastErr = { error: 'Rate limit', hint: 'free models: ~1 req / 10 s — trying next model…' };
          else lastErr = { error: 'HTTP ' + r.status + ' (' + model + ')', hint: t.slice(0, 250) };
          continue; // пробуем следующую модель
        }
        const data = await r.json();
        const m0 = data.choices?.[0]?.message ?? {};
        const reply = m0.content || m0.reasoning || '(empty reply)';
        return { ok: true, reply, usage: data.usage, model };
      } catch (e) { lastErr = { error: e.message }; }
    }
    return { ok: false, ...lastErr };
  } catch (e) { return { ok: false, error: e.message }; }
});

/* ================= агентные инструменты AI ================= */

function safeAgentPath(root, rel) {
  if (!root) throw new Error('No folder is open in the IDE');
  const abs = path.resolve(root, rel || '.');
  const rootAbs = path.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
    throw new Error('Access outside the project folder is forbidden');
  }
  return abs;
}

ipcMain.handle('agent:list', (_e, { root, rel }) => {
  try {
    const dir = safeAgentPath(root, rel);
    const entries = listDir(dir).map(e => {
      let size = 0;
      try { if (e.type !== 'dir') size = fs.statSync(e.path).size; } catch {}
      return { name: path.relative(root, e.path), type: e.type, size };
    });
    return { ok: true, entries };
  } catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('agent:read', (_e, { root, rel }) => {
  try {
    const abs = safeAgentPath(root, rel);
    const stat = fs.statSync(abs);
    if (stat.size > 300 * 1024) return { ok: false, error: 'File is larger than 300 KB — ask to read a part of it' };
    let content = fs.readFileSync(abs, 'utf8');
    let truncated = false;
    if (content.length > 60000) { content = content.slice(0, 60000); truncated = true; }
    return { ok: true, content: truncated ? content + '\n…[truncated]' : content, size: stat.size };
  } catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('agent:write', (_e, { root, rel, content }) => {
  try {
    const abs = safeAgentPath(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('agent:run', (_e, { root, cmd }) => {
  return new Promise(res => {
    if (!root) return res({ ok: false, error: 'No folder is open in the IDE' });
    let out = '';
    const p = spawn('cmd.exe', ['/c', cmd], { cwd: root, env: { ...process.env } });
    p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8');
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => out += d);
    const timer = setTimeout(() => { try { p.kill(); } catch {} ; }, 120000);
    p.on('exit', c => {
      clearTimeout(timer);
      const tail = out.length > 8000 ? '\n…[output truncated, showing the last 8000 chars]' : '';
      let o = out.slice(-8000);
      if (o.toLowerCase().includes('"?' + '#xFFFD;')) o = '';
      res({ ok: true, code: c, output: o + tail });
      win?.webContents.send('term:data', `$> ${cmd}\r\n${out}\r\n`);
    });
    p.on('error', e => { clearTimeout(timer); res({ ok: false, error: e.message }); });
  });
});

/* ================= встроенный декомпилятор ================= */

ipcMain.handle('decompile:file', async (_e, file) => {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.wasm') return decompileWasm(file);
  if (ext === '.class') return { ok: false, error: 'JAVA_CLASS', hint: 'javap (JDK) или CFR' };
  return { ok: false, error: 'unsupported' };
});

async function decompileWasm(file) {
  try {
    const wabt = require('wabt');
    const buf = fs.readFileSync(file);
    const instance = await wabt();
    const mod = instance.readWasm(new Uint8Array(buf), { readDebugNames: true });
    const wat = mod.toText({ foldExprs: false, inlineExport: true });
    return { ok: true, result: wat, lang: 'wasm' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// javap из установленного JDK
ipcMain.handle('decompile:javap', async (_e, file) => {
  return new Promise(res => {
    const p = spawn('javap', ['-c', '-p', file], { windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('error', () => res({ ok: false, error: 'javap not found (install a JDK and add it to PATH)' }));
    p.on('exit', c => c === 0 ? res({ ok: true, result: out, lang: 'java' }) : res({ ok: false, error: err || 'javap exited with code ' + c }));
  });
});

// cfr (если есть jar и java)
ipcMain.handle('decompile:cfr', async (_e, file, jar) => {
  return new Promise(res => {
    const p = spawn('java', ['-jar', jar, file, '--outputdir', app.getPath('temp')], { windowsHide: true });
    let err = '';
    p.stdout.on('data', () => {});
    p.stderr.on('data', d => err += d);
    p.on('error', () => res({ ok: false, error: 'java not found in PATH' }));
    p.on('exit', c => {
      if (c !== 0) return res({ ok: false, error: err || 'CFR exited with code ' + c });
      // ищем исходник .java в temp
      try {
        const base = path.basename(file, '.class');
        const found = findJavaIn(app.getPath('temp'), base);
        if (found) { const src = fs.readFileSync(found, 'utf8'); return res({ ok: true, result: src, lang: 'java' }); }
        return res({ ok: false, error: 'CFR did not produce a source file' });
      } catch (e) { res({ ok: false, error: e.message }); }
    });
  });
});

function findJavaIn(dir, base) {
  const q = [dir];
  while (q.length) {
    const d = q.pop();
    let es;
    try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of es) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) q.push(full);
      else if (e.name === base + '.java') return full;
    }
  }
  return null;
}

// dis-ассемблер байткода Python (.pyc/.pyo) через установленный Python
ipcMain.handle('decompile:pyc', async (_e, file) => {
  const script = `
import sys, dis, marshal, importlib.util
with open(sys.argv[1], 'rb') as f:
    magic = f.read(4)
    if sys.version_info >= (3, 7):
        f.read(12)  # flags + timestamp/size
    code = marshal.load(f)
print("# Python bytecode disassembly ({}{})".format(sys.version_info.major, sys.version_info.minor))
print("# Magic: {}".format(magic.hex()))
dis.dis(code)
`;
  return new Promise(res => {
    const p = spawn('python', ['-c', script, file], { windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('error', () => res({ ok: false, error: 'Python not found in PATH' }));
    p.on('exit', c => c === 0 ? res({ ok: true, result: out, lang: 'python' }) : res({ ok: false, error: err || 'python exited with code ' + c }));
  });
});

// ILSpy для .NET (dll/exe), если установлен ilspycmd
ipcMain.handle('decompile:ilspy', async (_e, file) => {
  return new Promise(res => {
    const p = spawn('ilspycmd', [file], { windowsHide: true });
    let out = '', err = '';
    p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8');
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('error', () => res({ ok: false, error: 'ilspycmd not found. Install it: dotnet tool install -g ilspycmd' }));
    p.on('exit', c => c === 0 ? res({ ok: true, result: out, lang: 'csharp' }) : res({ ok: false, error: err || 'ilspycmd exited with code ' + c }));
  });
});

/* ================= прочее ================= */

ipcMain.handle('shell:openExternal', (_e, url) => shell.openExternal(url));
ipcMain.handle('app:info', () => ({ version: app.getVersion(), electron: process.versions.electron, node: process.versions.node, platform: process.platform }));

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900,
    backgroundColor: '#1e1e1e',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: undefined,
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { if (procTerm) try { procTerm.kill(); } catch {} if (procRun) try { procRun.kill(); } catch {} });
