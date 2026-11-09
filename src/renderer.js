/* ===== Novaus IDE — интерфейс ===== */
'use strict';

const $ = (sel) => document.querySelector(sel);

/* ---------- Состояние ---------- */
const state = {
  rootFolder: null,
  tabs: [],          // {id, path, name, lang, model, dirty}
  activeTab: null,
  expanded: new Set(),
  monacoReady: false,
};

/* ---------- Сессия (сохранение между запусками) ---------- */
const SESSION_KEY = 'novaus.session.v1';
const termCmdHistory = [];   // введённые в консоль команды
let aiLog = [];              // визуальный лог чата [{role, text}]

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || '{}'); } catch { return {}; }
}
function saveSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      rootFolder: state.rootFolder,
      expanded: [...state.expanded].slice(-300),
      tabs: state.tabs.filter(t => !t.dirty).map(t => t.path).slice(-20),
      activeTab: state.activeTab ? state.activeTab.path : null,
      termHistory: termCmdHistory.slice(-100),
      termOutput: (termOut ? termOut.textContent : '').slice(-3000),
      aiHistory: aiHistory.slice(-60),
      aiLog: aiLog.slice(-200),
    }));
  } catch { /* переполнение localStorage — игнорируем */ }
}
window.addEventListener('beforeunload', saveSession);

const LANG_BY_EXT = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript', '.jsx': 'javascript',
  '.py': 'python', '.pyw': 'python',
  '.html': 'html', '.htm': 'html', '.css': 'css', '.scss': 'scss',
  '.json': 'json', '.md': 'markdown', '.xml': 'xml', '.svg': 'xml', '.yml': 'yaml', '.yaml': 'yaml',
  '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.hpp': 'cpp', '.cc': 'cpp',
  '.cs': 'csharp', '.java': 'java', '.rs': 'rust', '.go': 'go',
  '.sql': 'sql', '.sh': 'shell', '.bat': 'bat', '.ps1': 'powershell',
  '.rb': 'ruby', '.php': 'php', '.kt': 'kotlin', '.swift': 'swift',
  '.lua': 'lua', '.ini': 'ini', '.toml': 'ini', '.wat': 'wasm', '.s': 'asm',
};

function langFor(path) {
  return LANG_BY_EXT[path.slice(path.lastIndexOf('.')).toLowerCase()] || 'plaintext';
}

/* ---------- Monaco ---------- */
const monacoBase = new URL('../node_modules/monaco-editor/min/vs', location.href).href;
window.MonacoEnvironment = {
  getWorkerUrl() {
    return URL.createObjectURL(new Blob([
      `self.MonacoEnvironment={baseUrl:'${monacoBase}'};importScripts('${monacoBase}/base/worker/workerMain.js');`
    ], { type: 'text/javascript' }));
  },
};

let editor = null;
require.config({ paths: { vs: monacoBase } });
require(['vs/editor/editor.main'], () => {
  editor = monaco.editor.create($('#editor'), {
    theme: 'vs-dark',
    automaticLayout: true,
    fontSize: 14,
    minimap: { enabled: false },
    fontFamily: 'Consolas, "Courier New", monospace',
  });
  editor.onDidChangeCursorPosition(e => {
    $('#st-cursor').textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
  });
  state.monacoReady = true;
  const pending = pendingOpen; pendingOpen = null;
  if (pending) openFile(pending);
});
let pendingOpen = null;

/* ---------- Вкладки ---------- */
function findTab(path) { return state.tabs.find(t => t.path === path); }

function openFile(path) {
  if (!state.monacoReady) { pendingOpen = path; return; }
  const existing = findTab(path);
  if (existing) { activateTab(existing); return; }

  api.fs.read(path).then(r => {
    if (!r.ok && !r.kind) { toast('Read Error: ' + r.error); return; }
    let model;
    if (r.kind === 'binary') {
      model = monaco.editor.createModel(
        `// This is a compiled binary file\n// Open it via the Decompiler panel to get source code\n// Size: ${r.size} bytes`,
        'javascript'
      );
    } else {
      model = monaco.editor.createModel(r.content, langFor(path), monaco.Uri.parse('file://' + path.replace(/\\/g, '/')));
      if (model.uri && monaco.languages.getEncodedTokens && false) {}
    }
    if (r.kind === 'binary') model.isBinary = true;
    else model.isBinary = false;

    const tab = {
      path, name: path.split(/[\\\/]/).pop(),
      model, dirty: false,
    };
    state.tabs.push(tab);
    saveSession();
    renderTabs();
    activateTab(tab);
  });
}

function activateTab(tab) {
  state.activeTab = tab;
  editor.setModel(tab.model);
  editor.focus();
  $('#empty-hint').style.display = 'none';
  saveSession();
  renderTabs();
}

function closeTab(tab) {
  const i = state.tabs.indexOf(tab);
  if (i === -1) return;
  if (tab.dirty) {
    dialogConfirm(`Save Changes To "${tab.name}"?`).then(async a => {
      if (a === 'cancel') return;
      if (a === 'yes') await saveTab(tab);
      tab.model.dispose();
      state.tabs.splice(i, 1);
      if (state.activeTab === tab) {
        state.activeTab = state.tabs[Math.min(i, state.tabs.length - 1)] || null;
        if (state.activeTab) activateTab(state.activeTab);
        else { editor.setModel(null); $('#empty-hint').style.display = 'flex'; }
      }
      renderTabs();
    });
    return;
  }
  tab.model.dispose();
  state.tabs.splice(i, 1);
  saveSession();
  if (state.activeTab === tab) {
    state.activeTab = state.tabs[Math.min(i, state.tabs.length - 1)] || null;
    if (state.activeTab) activateTab(state.activeTab);
    else { editor.setModel(null); $('#empty-hint').style.display = 'flex'; }
  }
  renderTabs();
}

async function saveTab(tab) {
  if (tab.model.isBinary) return true;
  const r = await api.fs.write(tab.path, tab.model.getValue());
  if (r.ok) { tab.dirty = false; renderTabs(); toast('Saved Successfully: ' + tab.name); return true; }
  toast('Save Error: ' + r.error);
  return false;
}

function renderTabs() {
  const el = $('#tabs');
  el.innerHTML = '';
  state.tabs.forEach(tab => {
    const d = document.createElement('div');
    d.className = 'tab' + (tab === state.activeTab ? ' active' : '') + (tab.dirty ? ' dirty' : '');
    d.innerHTML = `<span class="icon">${iconFor(tab.path)}</span><span class="label"></span><span class="close">×</span>`;
    d.querySelector('.label').textContent = tab.name;
    d.onclick = () => activateTab(tab);
    d.querySelector('.close').onclick = (e) => { e.stopPropagation(); closeTab(tab); };
    el.appendChild(d);
  });
  const cur = state.activeTab;
  $('#st-lang').textContent = cur ? (langFor(cur.path) || 'plaintext') : '';
}

/* ---------- File type icons (SVG + colored badges) ---------- */
const FOLDER_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="#dcb67a"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>';
const GENERIC_FILE_SVG = '<svg width="13" height="15" viewBox="0 0 24 24" fill="#a0a0a0"><path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-4-4-4-4H6z"/></svg>';
const UNFOLDER_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="#d3b17c"><path d="M4 4h8l2 2h6c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" opacity=".85"/></svg>';

// unified file icons: colored page silhouette + short label inside
const fileI = (c, label = '', fg = '#fff') => {
  const fs = label.length >= 3 ? 6.2 : label.length === 2 ? 7.8 : 8.8;
  return `<svg width="13" height="15" viewBox="0 0 24 24" fill="${c}"><path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-4-4-4-4H6z"/>${label ? `<text x="12" y="18.2" font-family="Segoe UI, sans-serif" font-size="${fs}" font-weight="700" fill="${fg}" text-anchor="middle">${label}</text>` : ''}</svg>`;
};

const EXT_ICON = {
  '.js': fileI('#e8c93c', 'JS', '#24292e'), '.mjs': fileI('#e8c93c', 'JS', '#24292e'), '.cjs': fileI('#e8c93c', 'JS', '#24292e'),
  '.ts': fileI('#3178c6', 'TS'), '.tsx': fileI('#3178c6', 'TS'), '.jsx': fileI('#61dafb', 'JSX', '#24292e'),
  '.py': fileI('#3572a5', 'PY'), '.pyw': fileI('#3572a5', 'PY'), '.pyi': fileI('#3572a5', 'PY'),
  '.pyc': fileI('#6d4c9f', 'PYC'), '.pyo': fileI('#6d4c9f', 'PYO'),
  '.html': fileI('#e34c26', 'HTM'), '.htm': fileI('#e34c26', 'HTM'),
  '.css': fileI('#563d7c', 'CSS'), '.scss': fileI('#c6538c', 'SCS'), '.less': fileI('#2a5d9f', 'LES'),
  '.json': fileI('#cbcb41', 'JSN', '#24292e'), '.jsonc': fileI('#cbcb41', 'JSN', '#24292e'),
  '.md': fileI('#4a6ea9', 'MD'), '.markdown': fileI('#4a6ea9', 'MD'),
  '.xml': fileI('#e37933', 'XML'), '.svg': fileI('#ffb13b', 'SVG', '#24292e'),
  '.yml': fileI('#cb171e', 'YML'), '.yaml': fileI('#cb171e', 'YML'),
  '.c': fileI('#555555', 'C'), '.h': fileI('#555555', 'H'),
  '.cpp': fileI('#f34b7d', 'C+'), '.hpp': fileI('#f34b7d', 'C+'), '.cc': fileI('#f34b7d', 'C+'),
  '.cs': fileI('#178600', 'C#'), '.sln': fileI('#5c2d91', 'SLN'), '.csproj': fileI('#5c2d91', 'CSP'),
  '.java': fileI('#b07219', 'JVA'), '.class': fileI('#5382a1', 'CLS'), '.jar': fileI('#5382a1', 'JAR'),
  '.rs': fileI('#dea584', 'RS', '#24292e'), '.go': fileI('#00add8', 'GO'), '.rb': fileI('#cc342d', 'RB'),
  '.php': fileI('#4f5d95', 'PHP'), '.kt': fileI('#a97bff', 'KT'), '.kts': fileI('#a97bff', 'KT'),
  '.swift': fileI('#f05138', 'SW'), '.lua': fileI('#3c6ed8', 'LU'), '.sql': fileI('#e38c00', 'SQL'),
  '.sh': fileI('#24292e', 'SH', '#89e051'), '.bash': fileI('#24292e', 'SH', '#89e051'), '.zsh': fileI('#24292e', 'SH', '#89e051'),
  '.bat': fileI('#24292e', 'BAT', '#c1f12e'), '.cmd': fileI('#24292e', 'CMD', '#c1f12e'), '.ps1': fileI('#012456', 'PS1', '#4fc3f7'),
  '.ini': fileI('#6d8086', 'INI'), '.conf': fileI('#6d8086', 'CNF'), '.cfg': fileI('#6d8086', 'CFG'),
  '.env': fileI('#e2c08d', 'ENV', '#24292e'), '.toml': fileI('#9c4221', 'TML'),
  '.wat': fileI('#654ff0', 'WAT'), '.wasm': fileI('#654ff0', 'WAS'), '.dll': fileI('#68217a', 'DLL'), '.exe': fileI('#519aba', 'EXE'),
  '.txt': fileI('#7f7f7f', 'TXT'), '.log': fileI('#6d8086', 'LOG'),
  '.s': fileI('#504c46', 'ASM'), '.asm': fileI('#504c46', 'ASM'),
  '.gitignore': fileI('#f14e32', 'GIT'), '.gitattributes': fileI('#f14e32', 'GIT'), '.lock': fileI('#e2c08d', 'LK', '#24292e'),
  '.png': fileI('#519aba', 'IMG'), '.jpg': fileI('#519aba', 'IMG'), '.jpeg': fileI('#519aba', 'IMG'), '.gif': fileI('#519aba', 'IMG'), '.bmp': fileI('#519aba', 'IMG'), '.webp': fileI('#519aba', 'IMG'), '.ico': fileI('#519aba', 'IMG'),
  '.pdf': fileI('#d32f2f', 'PDF'),
  '.zip': fileI('#a8842c', 'ZIP'), '.rar': fileI('#a8842c', 'RAR'), '.7z': fileI('#a8842c', '7Z'), '.tar': fileI('#a8842c', 'TAR'), '.gz': fileI('#a8842c', 'GZ'),
  '.mp3': fileI('#b394f6', 'MP3'), '.wav': fileI('#b394f6', 'WAV'), '.flac': fileI('#b394f6', 'FLA'), '.ogg': fileI('#b394f6', 'OGG'),
  '.mp4': fileI('#6d4c9f', 'MP4'), '.avi': fileI('#6d4c9f', 'AVI'), '.mkv': fileI('#6d4c9f', 'MKV'), '.mov': fileI('#6d4c9f', 'MOV'),
};

// returns an SVG icon fragment for the given file name
function iconFor(name) {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  return EXT_ICON[ext] || GENERIC_FILE_SVG;
}

/* ---------- Дерево файлов ---------- */
async function renderTree() {
  const tree = $('#tree');
  tree.innerHTML = '';
  if (!state.rootFolder) {
    tree.innerHTML = '<div style="padding:12px;color:var(--fg-dim)">No Project Open Yet — Your Adventure Starts Here</div>';
    return;
  }
  const sp = $('#st-path');
  sp.innerHTML = FOLDER_SVG;
  sp.appendChild(document.createTextNode(' ' + state.rootFolder));
  await renderNode(state.rootFolder, tree, 0);
  api.term.start(state.rootFolder);
}

async function renderNode(dir, parentEl, depth) {
  const r = await api.fs.list(dir);
  if (!r.ok) return;
  const holder = parentEl;
  for (const entry of r.entries) {
    const item = document.createElement('div');
    item.className = 'tree-item';
    item.style.paddingLeft = (10 + depth * 14) + 'px';
    const isDir = entry.type === 'dir';
    item.innerHTML = `
      <span class="caret">${isDir ? (state.expanded.has(entry.path) ? '▾' : '▸') : ''}</span>
      <span class="icon">${isDir ? (state.expanded.has(entry.path) ? FOLDER_SVG : UNFOLDER_SVG) : iconFor(entry.name)}</span>
      <span class="label"></span>`;
    item.querySelector('.label').textContent = entry.name;
    item.onclick = async () => {
      if (isDir) {
        if (state.expanded.has(entry.path)) state.expanded.delete(entry.path);
        else state.expanded.add(entry.path);
        saveSession();
        renderTreeNoReset();
      } else {
        openFile(entry.path);
      }
    };
    item.dataset.path = entry.path;
    holder.appendChild(item);
    if (isDir && state.expanded.has(entry.path)) {
      const kids = document.createElement('div');
      kids.className = 'tree-children';
      holder.appendChild(kids);
      await renderNode(entry.path, kids, depth + 1);
    }
  }
}

function renderTreeNoReset() {
  $('#tree').innerHTML = '';
  if (state.rootFolder) renderNode(state.rootFolder, $('#tree'), 0);
}

/* ---------- Нижняя панель ---------- */
document.querySelectorAll('.panel-tabs button[data-panel]').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.panel-tabs button[data-panel]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $('#panel-term').classList.remove('active');
    $('#panel-output').classList.remove('active');
    $('#panel-' + btn.dataset.panel).classList.add('active');
    $('#bottom-panel').classList.remove('collapsed');
  };
});
$('#panel-close').onclick = () => $('#bottom-panel').classList.toggle('collapsed');

/* ---------- Терминал ---------- */
const termOut = document.createElement('div');
termOut.className = 'term-out';
const termInput = document.createElement('input');
termInput.className = 'term-cmd';
    termInput.placeholder = 'Type a PowerShell command and press Enter…';
const termRow = document.createElement('div');
termRow.className = 'term-in-row';
termRow.innerHTML = '<span style="color:#4fc3f7;font-family:Consolas,monospace">$&gt;</span>';
termRow.appendChild(termInput);
termRow.appendChild(mkStopBtn('term:stop'));
$('#panel-term').appendChild(termOut);
$('#panel-term').appendChild(termRow);
let termHistIdx = -1;
termInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && termInput.value) {
    api.term.input(termInput.value + '\n');
    termOut.append('· ' + termInput.value + '\n');
    if (termCmdHistory[termCmdHistory.length - 1] !== termInput.value) {
      termCmdHistory.push(termInput.value);
      if (termCmdHistory.length > 100) termCmdHistory.shift();
    }
    termHistIdx = -1;
    saveSession();
    termInput.value = '';
  } else if (e.key === 'ArrowUp' && termCmdHistory.length) {
    e.preventDefault();
    termHistIdx = termHistIdx < 0 ? termCmdHistory.length - 1 : Math.max(0, termHistIdx - 1);
    termInput.value = termCmdHistory[termHistIdx];
  } else if (e.key === 'ArrowDown' && termHistIdx >= 0) {
    e.preventDefault();
    termHistIdx++;
    if (termHistIdx >= termCmdHistory.length) { termHistIdx = -1; termInput.value = ''; }
    else termInput.value = termCmdHistory[termHistIdx];
  }
});
api.term.onData(d => { termOut.append(d); termOut.scrollTop = termOut.scrollHeight; });
// авто-снапшот консоли (для восстановления между запусками)
setInterval(saveSession, 20000);

function mkStopBtn(kind) {
  const b = document.createElement('button');
  b.title = 'Stop';
  b.style.cssText = 'background:#5a1f1f;color:#fff;border:none;border-radius:3px;cursor:pointer;padding:3px 7px;display:inline-flex';
  b.innerHTML = '<svg class="i i-f" viewBox="0 0 24 24" style="width:12px;height:12px"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';
  b.onclick = () => kind === 'term:stop' ? api.term.stop() : api.run.stop();
  return b;
}

/* ---------- Запуск кода (панель «Вывод») ---------- */
const runOut = document.createElement('div');
runOut.className = 'term-out';
const runRow = document.createElement('div');
runRow.className = 'term-in-row';
const runInput = document.createElement('input');
runInput.className = 'term-cmd';
runInput.placeholder = 'stdin for the running program…';
runRow.appendChild(runInput);
runRow.appendChild(mkStopBtn('run:stop'));
$('#panel-output').appendChild(runOut);
$('#panel-output').appendChild(runRow);
runInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && runInput.value) {
    api.run.input(runInput.value + '\n');
    runInput.value = '';
  }
});
api.run.onData(d => { runOut.append(d); runOut.scrollTop = runOut.scrollHeight; });

function selectPanel(name) {
  document.querySelector(`.panel-tabs button[data-panel="${name}"]`).click();
}

/* ---------- Запуск активного файла ---------- */
async function runActive() {
  const tab = state.activeTab;
  if (!tab) { toast('No File Open Yet'); return; }
  selectPanel('output');
  const os = runOut; os.innerHTML = '';
  api.run.start({ file: tab.path });
}

/* ---------- Декомпилятор ---------- */
$('#btn-decompile').onclick = () => {
  $('#decomp-panel').classList.toggle('open');
  $('#ai-panel').classList.remove('open');
};

const decompDrop = $('#decomp-drop');
['dragover', 'dragenter'].forEach(ev =>
  decompDrop.addEventListener(ev, e => { e.preventDefault(); decompDrop.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev =>
  decompDrop.addEventListener(ev, e => { e.preventDefault(); decompDrop.classList.remove('drag'); }));
decompDrop.addEventListener('drop', e => {
  const f = e.dataTransfer.files[0];
  if (f) decompileFile(api.decompile.getPathForFile(f));
});
$('#decomp-pick').onclick = async () => {
  const p = await api.dialog.openFile();
  if (p) decompileFile(p);
};

async function decompileFile(path) {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  const st = $('#decomp-status');
  const res = $('#decomp-result');
  st.textContent = '✨ Decompiling ' + path.split(/[\\\/]/).pop() + '…';
  res.innerHTML = '';

  let r;
  if (ext === '.wasm') {
    r = await api.decompile.file(path);
  } else if (ext === '.class') {
    r = await api.decompile.javap(path);
  } else if (ext === '.pyc' || ext === '.pyo') {
    r = await api.decompile.pyc(path);
  } else if (ext === '.dll' || ext === '.exe') {
    r = await api.decompile.ilspy(path);
  } else {
    r = { ok: false, error: 'File extension "' + ext + '" is not supported by the decompiler.\nSupported: .wasm, .class, .pyc/.pyo, .dll/.exe' };
  }

  if (r.ok) {
    st.innerHTML = `✓ Done → <button id="open-decomp-btn" style="background:var(--accent);color:#fff;border:none;border-radius:3px;cursor:pointer;padding:3px 8px">open in editor</button>`;
    const pre = document.createElement('pre');
    pre.textContent = r.result;
    res.appendChild(pre);
    $('#open-decomp-btn').onclick = () => openDecompiledAsVirtualFile(path, r.result, r.lang);
  } else {
    st.textContent = '✗ ' + (r.error || 'Decompilation Failed');
    if (r.hint) st.textContent += ' — ' + r.hint;
  }
}

// показать декомпилированный код как виртуальную вкладку
function openDecompiledAsVirtualFile(origPath, content, lang) {
  const name = origPath.split(/[\\\/]/).pop() + '.decompiled.' + (lang || 'txt');
  const model = monaco.editor.createModel(content, lang === 'wasm' ? 'wasm' : (langFor('.' + (lang || 'txt'))));
  const tab = { path: name, name, model, dirty: false };
  state.tabs.push(tab);
  renderTabs();
  activateTab(tab);
}

/* ---------- Действия панели ---------- */
function toggleAiPanel(forceOpen) {
  const p = $('#ai-panel');
  const willOpen = forceOpen !== undefined ? forceOpen : !p.classList.contains('open');
  p.classList.toggle('open', willOpen);
  if (willOpen) $('#decomp-panel').classList.remove('open');
  else $('#decomp-panel').classList.remove('open');
}
$('#btn-open-folder').onclick = async () => {
  const dir = await api.dialog.openFolder();
  if (!dir) return;
  state.rootFolder = dir;
  state.expanded = new Set();
  saveSession();
  renderTree();
};
$('#btn-open-file').onclick = async () => {
  const f = await api.dialog.openFile();
  if (f) openFile(f);
};
$('#btn-save').onclick = () => { const t = state.activeTab; if (t) saveTab(t); };
$('#btn-run').onclick = runActive;
$('#btn-new-file').onclick = async () => {
  if (!state.rootFolder) { toast('Open A Project First'); return; }
  const name = await promptDialog('Name of the new file:', 'untitled.py');
  if (!name) return;
  const r = await api.fs.createFile(state.rootFolder + '\\' + name);
  r.ok ? renderTreeNoReset() : toast(r.error);
};
$('#btn-new-dir').onclick = async () => {
  if (!state.rootFolder) { toast('Open A Project First'); return; }
  const name = await promptDialog('Name of the new folder:', 'new-folder');
  if (!name) return;
  const r = await api.fs.createDir(state.rootFolder + '\\' + name);
  r.ok ? renderTreeNoReset() : toast(r.error);
};

/* ---------- Диалоги ---------- */
async function dialogConfirm(message) {
  const r = await api.dialog.message({
    type: 'question', buttons: ['Save', 'Discard', 'Cancel'], defaultId: 0,
    message: 'Unsaved changes', detail: message,
  });
  return r.response === 0 ? 'yes' : r.response === 1 ? 'no' : 'cancel';
}
function promptDialog(message, def) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:100';
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:18px;min-width:320px;box-shadow:0 8px 30px rgba(0,0,0,.5)';
    box.innerHTML = `
      <div style="margin-bottom:10px;font-weight:600"></div>
      <input class="modal-input" style="width:100%;background:var(--bg);border:1px solid var(--accent);color:var(--fg);padding:7px 9px;border-radius:4px;font-size:13px;outline:none;margin-bottom:14px">
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="m-cancel" style="background:none;border:1px solid var(--border);color:var(--fg-dim);padding:5px 14px;border-radius:4px;cursor:pointer">Cancel</button>
        <button class="m-ok" style="background:var(--accent);color:#fff;border:none;padding:5px 14px;border-radius:4px;cursor:pointer">OK</button>
      </div>`;
    box.querySelector('div').textContent = message;
    const input = box.querySelector('.modal-input');
    input.value = def || '';
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    input.focus();
    input.select();
    const close = (v) => { overlay.remove(); resolve(v); };
    box.querySelector('.m-ok').onclick = () => close(input.value.trim() || null);
    box.querySelector('.m-cancel').onclick = () => close(null);
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Enter') close(input.value.trim() || null);
      if (e.key === 'Escape') close(null);
    });
  });
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2500);
  setTimeout(() => el.remove(), 3100);
}

/* ---------- Горячие клавиши ---------- */
window.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); const t = state.activeTab; if (t) saveTab(t); }
  if (e.key === 'F5') { e.preventDefault(); runActive(); }
  if (e.ctrlKey && e.key === 'b') { e.preventDefault(); $('#sidebar').style.display = $('#sidebar').style.display === 'none' ? 'flex' : 'none'; }
  if (e.ctrlKey && e.key.toLowerCase() === 'i') { e.preventDefault(); toggleAiPanel(); }
});

/* ---------- AI-чат ---------- */
let aiHistory = []; // [{role, content}] без system prompt
let aiSysPrompt = 'You are an expert coding assistant. Reply concisely and use code blocks.';
api.ai.getConfig().then(c => { if (c.systemPrompt) aiSysPrompt = c.systemPrompt; });

$('#btn-ai').onclick = () => {
  toggleAiPanel();
  if ($('#ai-panel').classList.contains('open')) $('#ai-input').focus();
};

// ---- настройки ----
$('#ai-settings-btn').onclick = async () => {
  const box = $('#ai-settings');
  if (box.classList.contains('open')) { box.classList.remove('open'); return; }
  const c = await api.ai.getConfig();
  $('#ai-endpoint').value = c.endpoint || '';
  $('#ai-model').value = c.model || '';
  $('#ai-key').value = '';
  $('#ai-key').placeholder = c.hasKey ? '•••••••• (saved — enter a new one to change)' : 'sk-…';
  $('#ai-sysprompt').value = c.systemPrompt || '';
  box.classList.add('open');
  if (c.hasKey) checkAiKey(); // авто-проверка ключа и подгрузка моделей
};
$('#ai-cancel-btn').onclick = () => $('#ai-settings').classList.remove('open');

// проверка API-ключа + список доступных моделей
const aiCheckStatus = $('#ai-check-status');
async function checkAiKey() {
  aiCheckStatus.textContent = 'Checking…';
  aiCheckStatus.className = '';
  const r = await api.ai.models();
  const list = $('#ai-models-list');
  list.innerHTML = '';
  if (r.ok) {
    aiCheckStatus.textContent = `✓ Key Works — ${r.count} Models Available`;
    aiCheckStatus.className = 'ok';
    for (const id of r.models.slice(0, 300)) {
      const opt = document.createElement('option');
      opt.value = id;
      list.appendChild(opt);
    }
  } else {
    aiCheckStatus.textContent = '✗ ' + (r.hint ? r.error + ': ' + r.hint : r.error);
    aiCheckStatus.className = 'err';
  }
  return r;
}
$('#ai-check-btn').onclick = async () => {
  // применяем то, что введено в настройках, — чтобы проверка шла с новым ключом
  await api.ai.saveConfig({
    endpoint: $('#ai-endpoint').value.trim() || 'https://api.openai.com/v1',
    model: $('#ai-model').value.trim() || 'gpt-4o-mini',
    key: $('#ai-key').value.trim(),
    systemPrompt: $('#ai-sysprompt').value,
  });
  const c = await api.ai.getConfig();
  $('#ai-key').value = '';
  $('#ai-key').placeholder = c.hasKey ? '•••••••• (saved — enter a new one to change)' : 'sk-…';
  checkAiKey();
};
$('#ai-save-btn').onclick = async () => {
  await api.ai.saveConfig({
    endpoint: $('#ai-endpoint').value.trim() || 'https://api.openai.com/v1',
    model: $('#ai-model').value.trim() || 'gpt-4o-mini',
    key: $('#ai-key').value.trim(),
    systemPrompt: $('#ai-sysprompt').value,
  });
  $('#ai-settings').classList.remove('open');
  toast('AI Settings Saved — You Rock!');
};

$('#ai-clear-btn').onclick = () => {
  aiHistory = [];
  aiLog = [];
  saveSession();
  $('#ai-msgs').innerHTML = `<div class="ai-empty" id="ai-empty">👋 Hi! I can explain, fix and refactor your code.</div>`;
};

// ---- рендер сообщений ----
function addCodeBlock(lang, code) {
  const wrap = document.createElement('div');
  wrap.className = 'code-block';
  const head = document.createElement('div');
  head.className = 'code-head';
  const name = document.createElement('span');
  name.textContent = lang || 'code';
  const btns = document.createElement('span');
  const copyB = document.createElement('button');
  copyB.innerHTML = '<svg class="i" viewBox="0 0 24 24" style="width:11px;height:11px;vertical-align:-1px"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> copy';
  copyB.onclick = () => { navigator.clipboard.writeText(code); toast('Copied To Clipboard'); };
  const insB = document.createElement('button');
  insB.textContent = 'Insert At Cursor';
  insB.onclick = () => {
    if (editor && state.activeTab) {
      const pos = editor.getPosition();
      editor.executeEdits('ai', [{ range: monaco.Range.fromPositions(pos, pos), text: code + '\n' }]);
      toast('Inserted At Cursor');
    } else toast('Open A File First');
  };
  btns.append(copyB, insB);
  head.append(name, btns);
  const pre = document.createElement('pre');
  pre.textContent = code;
  wrap.append(head, pre);
  return wrap;
}

// разбор ответа: текст + ```-блоки
function renderAiContent(container, text) {
  container.innerHTML = '';
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      const t = document.createElement('div');
      t.textContent = text.slice(last, m.index);
      container.appendChild(t);
    }
    container.appendChild(addCodeBlock(m[1], m[2].replace(/\n$/, '')));
    last = re.lastIndex;
  }
  if (last < text.length) {
    const t = document.createElement('div');
    t.textContent = text.slice(last);
    container.appendChild(t);
  }
}

function addMsgEl(role, text, className) {
  $('#ai-empty')?.remove();
  const el = document.createElement('div');
  el.className = 'msg ' + (className || ((role === 'user') ? 'user' : 'ai'));
  if (role === 'user') el.textContent = text;
  else renderAiContent(el, text);
  $('#ai-msgs').appendChild(el);
  $('#ai-msgs').scrollTop = $('#ai-msgs').scrollHeight;
  return el;
}

// ---- отправка ----
async function sendAiMessage(text) {
  if (!text.trim()) return;
  $('#ai-settings').classList.remove('open');
  addMsgEl('user', text);
  aiLog.push({ role: 'user', text });
  saveSession();

  const messages = [{ role: 'system', content: aiSysPrompt }];

  let userContent = text;
  if ($('#ai-attach-file').checked && state.activeTab && state.activeTab.model && !state.activeTab.model.isBinary) {
    const tab = state.activeTab;
    const sel = editor?.getSelection?.();
    let fileBlock = `Current file: ${tab.name}\n\`\`\`${langFor(tab.path)}\n${tab.model.getValue()}\n\`\`\``;
    if (sel && !sel.isEmpty()) {
      fileBlock = `Selected fragment of ${tab.name} (lines ${sel.startLineNumber}-${sel.endLineNumber}):\n\`\`\`${langFor(tab.path)}\n${tab.model.getValueInRange(sel)}\n\`\`\`\n\nFull file ${tab.name}:\n\`\`\`${langFor(tab.path)}\n${tab.model.getValue()}\n\`\`\``;
    }
    userContent = text + '\n\n' + fileBlock;
  }

  aiHistory.push({ role: 'user', content: userContent });

  const agentOn = $('#ai-agent-mode') && $('#ai-agent-mode').checked;
  if (agentOn) {
    await agentTurn(messages);
    return;
  }

  const pending = addMsgEl('ai', '', 'ai pending');
  pending.innerHTML = `<span class="think-row"><span class="think-dots"><i></i><i></i><i></i></span><span class="think-label">Thinking</span></span>`;
  const thinkPhrases = ['Thinking', 'Analyzing the code', 'Generating an answer', 'Almost ready'];
  let ti = 0;
  const thinkTimer = setInterval(() => {
    const l = pending.querySelector('.think-label');
    if (l) l.textContent = thinkPhrases[ti++ % thinkPhrases.length];
  }, 1400);

  const r = await api.ai.chat([...messages, ...aiHistory]);
  clearInterval(thinkTimer);
  if (r.ok) {
    aiHistory.push({ role: 'assistant', content: r.reply });
    aiLog.push({ role: 'assistant', text: r.reply });
    saveSession();
    renderAiContent(pending, r.reply);
    pending.classList.remove('pending');
  } else {
    pending.textContent = '✗ ' + (r.hint ? r.error + ': ' + r.hint : r.error);
    pending.classList.add('err');
    if (r.error === 'NO_KEY') $('#ai-settings-btn').click();
  }
  $('#ai-msgs').scrollTop = $('#ai-msgs').scrollHeight;
}

/* ---------- Agent mode: tools ---------- */
const AGENT_PROMPT = `

You also have AGENT TOOLS. To use one, output exactly ONE fenced block at a time:
\`\`\`tool
{"tool":"read_file","path":"src/main.js"}
\`\`\`
Available tools:
- {"tool":"list_files","path":"."}         — list a directory of the project (use "." for root)
- {"tool":"read_file","path":"rel/path"}  — read a text file
- {"tool":"write_file","path":"rel/path","content":"full new content"}  — create/overwrite a file (whole content required)
- {"tool":"run_command","command":"npm install"}  — run a shell command in the project root (builds, tests, etc.)
Paths are RELATIVE to the project root; access outside it is denied.
IMPORTANT: the tool JSON must be a SINGLE line. Never put raw newlines inside a JSON string — use the \\n escape sequence instead.
Rules: one tool call per turn; wait for the result (it will come back as a user message) before the next step;
never guess file contents — read first; after finishing, reply normally WITHOUT a tool block.`;

function thinkingBubble() {
  const el = addMsgEl('ai', '', 'ai pending');
  el.innerHTML = `<span class="think-row"><span class="think-dots"><i></i><i></i><i></i></span><span class="think-label">Thinking</span></span>`;
  const phrases = ['Thinking', 'Planning a step', 'Working on it', 'Checking'];
  let i = 0;
  const timer = setInterval(() => {
    const l = el.querySelector('.think-label');
    if (l) l.textContent = phrases[i++ % phrases.length];
  }, 1400);
  return { el, stop: () => clearInterval(timer) };
}

async function agentTurn(sysMessages) {
  const sys = [...sysMessages];
  sys[0] = { role: 'system', content: aiSysPrompt + AGENT_PROMPT };
  const MAX_STEPS = 8;

  for (let step = 0; step < MAX_STEPS; step++) {
    const bubble = thinkingBubble();
    const r = await api.ai.chat([...sys, ...aiHistory]);
    bubble.stop();
    $('#ai-msgs').scrollTop = $('#ai-msgs').scrollHeight;

    if (!r.ok) {
      bubble.el.textContent = '✗ ' + (r.hint ? r.error + ': ' + r.hint : r.error);
      bubble.el.classList.add('err');
      if (r.error === 'NO_KEY') $('#ai-settings-btn').click();
      return;
    }
    aiHistory.push({ role: 'assistant', content: r.reply });
    aiLog.push({ role: 'assistant', text: r.reply });
    saveSession();

    const m = r.reply.match(/```tool\s*([\s\S]*?)```/i);
    const visible = r.reply.replace(/```tool\s*[\s\S]*?```/g, '').trim();

    if (!m) { renderAiContent(bubble.el, r.reply); bubble.el.classList.remove('pending'); return; }
    if (visible) { renderAiContent(bubble.el, visible); bubble.el.classList.remove('pending'); }
    else bubble.el.remove();

    let call;
    try {
      call = JSON.parse(m[1].trim());
    } catch (e1) {
      // слабые модели иногда пишут сырые переводы строк внутри строк — чиним
      try {
        call = JSON.parse(m[1].trim().replace(/\r/g, '').replace(/"( |[\s\S])*?"/g, s => s.replace(/\n/g, '\\n')));
      } catch (e2) {
        call = null;
      }
    }
    if (!call) {
      addMsgEl('ai', '⚠ Agent produced invalid tool JSON. Retrying with a stricter instruction.');
      aiHistory.push({ role: 'user', content: '[tool error invalid json] The JSON was malformed. IMPORTANT: output a SINGLE-LINE JSON object with real \\n escapes, no raw newlines. Retry the same tool now.' });
      continue;
    }

    const toolMsg = document.createElement('div');
    toolMsg.className = 'msg tool';
    toolMsg.textContent = '🔧 ' + call.tool + ' ' + (call.path || call.command || '');
    $('#ai-msgs').appendChild(toolMsg);
    $('#ai-msgs').scrollTop = $('#ai-msgs').scrollHeight;

    const result = await execTool(call);
    aiHistory.push({ role: 'user', content: '[tool result]\n' + result.slice(0, 6000) });
  }
  addMsgEl('ai', '⚠ Agent stopped after ' + MAX_STEPS + ' tool steps. Type "continue" to let it go on.');
}

async function execTool(call) {
  const root = state.rootFolder;
  try {
    if (!root) return '[tool error] No folder is open in the IDE — open one first.';
    if (call.tool === 'list_files') {
      const r = await api.agent.list(root, call.path || '.');
      if (!r.ok) return '[tool error] ' + r.error;
      return r.entries.map(e => (e.type === 'dir' ? '[dir]  ' : '[file] ') + e.name + (e.type !== 'dir' ? ' (' + e.size + ' B)' : '')).join('\n') || '(empty directory)';
    }
    if (call.tool === 'read_file') {
      const r = await api.agent.read(root, call.path);
      return r.ok ? r.content : '[tool error] ' + r.error;
    }
    if (call.tool === 'write_file') {
      const r = await api.agent.write(root, call.path, call.content == null ? '' : call.content);
      if (!r.ok) return '[tool error] ' + r.error;
      renderTreeNoReset();
      return '[ok] wrote ' + (call.path || '?') + ' (' + (call.content ? call.content.length : 0) + ' chars)';
    }
    if (call.tool === 'run_command') {
      const r = await api.agent.run(root, call.command);
      return r.ok ? ('[exit code ' + r.code + ']\n' + (r.output || '(no output)')) : ('[tool error] ' + r.error);
    }
    return '[tool error] Unknown tool "' + call.tool + '". Available: list_files, read_file, write_file, run_command.';
  } catch (e) {
    return '[tool error] ' + e.message;
  }
}

const aiInput = $('#ai-input');
$('#ai-send').onclick = () => { const v = aiInput.value; aiInput.value = ''; sendAiMessage(v); };
aiInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const v = aiInput.value; aiInput.value = ''; sendAiMessage(v); }
});

/* ---------- Старт ---------- */
(async function init() {
  const s = loadSession();

  // чат AI: контекст истории + визуальное восстановление
  if (s.aiHistory && s.aiHistory.length) aiHistory = s.aiHistory;
  if (s.aiLog && s.aiLog.length) {
    aiLog = s.aiLog;
    for (const m of aiLog.slice(-40)) addMsgEl(m.role, m.text);
  }

  // история команд консоли
  if (s.termHistory && s.termHistory.length) termCmdHistory.push(...s.termHistory);

  // восстановление последнего проекта (если папка ещё существует)
  if (s.rootFolder) {
    const r = await api.fs.list(s.rootFolder);
    if (r.ok) {
      state.rootFolder = s.rootFolder;
      state.expanded = new Set(s.expanded || []);
    } else {
      toast('Previous Project Not Found — Open A New One');
    }
  }
  await renderTree();

  // восстановление вывода консоли (приглушённым)
  if (s.termOutput) {
    termOut.append('· — Restored Session —\n');
    termOut.append(s.termOutput.endsWith('\n') ? s.termOutput : s.termOutput + '\n');
  }

  // восстановление открытых вкладок
  if (s.tabs && s.tabs.length) {
    for (const p of s.tabs.slice(-10)) {
      const chk = await api.fs.read(p);
      if (chk.ok || chk.kind) openFile(p);
      else saveSession();
    }
    // ждём загрузки и делаем активной последнюю открытую вкладку
    for (let i = 0; i < 20; i++) {
      const t = s.activeTab ? findTab(s.activeTab) : null;
      if (t) { activateTab(t); break; }
      await new Promise(r => setTimeout(r, 100));
    }
  }
  selectPanel('term');
  toggleAiPanel(true); // панель AI-чата открыта по умолчанию
})();
