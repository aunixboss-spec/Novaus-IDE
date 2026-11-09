const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  fs: {
    home: () => ipcRenderer.invoke('fs:home'),
    list: (dir) => ipcRenderer.invoke('fs:list', dir),
    read: (file) => ipcRenderer.invoke('fs:read', file),
    write: (file, content) => ipcRenderer.invoke('fs:write', file, content),
    createFile: (file) => ipcRenderer.invoke('fs:createFile', file),
    createDir: (dir) => ipcRenderer.invoke('fs:createDir', dir),
    rename: (from, to) => ipcRenderer.invoke('fs:rename', from, to),
    remove: (target) => ipcRenderer.invoke('fs:delete', target),
  },
  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    saveFile: (name) => ipcRenderer.invoke('dialog:saveFile', name),
    message: (opts) => ipcRenderer.invoke('dialog:message', opts),
  },
  term: {
    start: (cwd) => ipcRenderer.send('term:start', cwd),
    input: (d) => ipcRenderer.send('term:input', d),
    stop: () => ipcRenderer.send('term:stop'),
    onData: (cb) => ipcRenderer.on('term:data', (_e, d) => cb(d)),
  },
  run: {
    start: (o) => ipcRenderer.send('run:start', o),
    input: (d) => ipcRenderer.send('run:input', d),
    stop: () => ipcRenderer.send('run:stop'),
    onData: (cb) => ipcRenderer.on('run:data', (_e, d) => cb(d)),
    onDone: (cb) => ipcRenderer.on('run:done', (_e, c) => cb(c)),
  },
  decompile: {
    file: (f) => ipcRenderer.invoke('decompile:file', f),
    javap: (f) => ipcRenderer.invoke('decompile:javap', f),
    cfr: (f, jar) => ipcRenderer.invoke('decompile:cfr', f, jar),
    pyc: (f) => ipcRenderer.invoke('decompile:pyc', f),
    ilspy: (f) => ipcRenderer.invoke('decompile:ilspy', f),
    getPathForFile: (file) => webUtils.getPathForFile(file),
  },
  agent: {
    list: (root, rel) => ipcRenderer.invoke('agent:list', { root, rel }),
    read: (root, rel) => ipcRenderer.invoke('agent:read', { root, rel }),
    write: (root, rel, content) => ipcRenderer.invoke('agent:write', { root, rel, content }),
    run: (root, cmd) => ipcRenderer.invoke('agent:run', { root, cmd }),
  },
  ai: {
    getConfig: () => ipcRenderer.invoke('ai:getConfig'),
    saveConfig: (cfg) => ipcRenderer.invoke('ai:saveConfig', cfg),
    chat: (messages) => ipcRenderer.invoke('ai:chat', { messages }),
    models: () => ipcRenderer.invoke('ai:models'),
  },
  showInFolder: (p) => ipcRenderer.invoke('shell:openExternal', 'file:///' + p.replace(/\\/g, '/')),
  appInfo: () => ipcRenderer.invoke('app:info'),
});
