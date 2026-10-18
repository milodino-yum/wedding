// Desktop shell for the planner: one window running ../index.html, native menus that drive the page's own buttons,
// save dialogs that remember their folder, and the window's size and position kept between runs. The page itself
// is unchanged and still works in a browser; it keeps its autosave in this app's own storage.
const { app, BrowserWindow, Menu, dialog, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const PAGE = path.join(__dirname, '..', 'index.html');
const VENUES = [['garden', 'Surprise Garden'], ['townhall', 'Town Hall']];
const statePath = () => path.join(app.getPath('userData'), 'window-state.json');
let win = null, venue = null;

function readJSON(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; } }
function writeJSON(file, data) { try { fs.writeFileSync(file, JSON.stringify(data)); } catch (e) { /* not fatal */ } }

// Run a snippet in the page as if the user had clicked (so the file pickers and downloads it opens are allowed).
const run = code => win && win.webContents.executeJavaScript(code, true).catch(() => {});
const click = id => run(`document.getElementById(${JSON.stringify(id)}).click()`);
const setVenue = id => run(`(s => { if (s.value !== ${JSON.stringify(id)}) { s.value = ${JSON.stringify(id)}; s.dispatchEvent(new Event('change')); } })(document.getElementById('sel-venue'))`);

function buildMenu() {
  const mac = process.platform === 'darwin';
  const template = [
    ...(mac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'Open Layout…', accelerator: 'CmdOrCtrl+O', click: () => click('btn-load') },
      // The page handles Ctrl/Cmd+S itself; the menu only shows the shortcut.
      { label: 'Save Layout…', accelerator: 'CmdOrCtrl+S', registerAccelerator: false, click: () => click('btn-save') },
      { label: 'Export PNG…', accelerator: 'CmdOrCtrl+E', click: () => click('btn-png') },
      { type: 'separator' },
      { label: 'Load Example', click: () => click('btn-example') },
      { label: 'Clear Layout', click: () => click('btn-clear') },
      { type: 'separator' },
      mac ? { role: 'close' } : { role: 'quit' },
    ] },
    { role: 'editMenu' },
    { label: 'Venue', submenu: VENUES.map(([id, name], i) => ({
      label: name, type: 'radio', checked: venue === id, accelerator: `CmdOrCtrl+${i + 1}`, click: () => setVenue(id),
    })) },
    { label: 'View', submenu: [
      { label: 'Top-down', accelerator: 'T', registerAccelerator: false, click: () => click('btn-top') },
      { label: 'Reset View', click: () => click('btn-reset') },
      { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { role: 'reload' }, { role: 'toggleDevTools' },
    ] },
    { role: 'windowMenu' },
    { role: 'help', submenu: [
      { label: `About ${app.getName()}`, click: () => dialog.showMessageBox(win, {
        type: 'info', title: 'About', message: `${app.getName()} ${app.getVersion()}`,
        detail: 'Reception layouts for Basin Harbor\'s Surprise Garden and Town Hall.\nLayouts autosave in this app; use Save Layout to keep a file.',
      }) },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Saved bounds, if they still land on a connected display.
function initialBounds() {
  const s = readJSON(statePath(), null);
  if (!s || !s.width) return { width: 1500, height: 950 };
  const visible = screen.getAllDisplays().some(d => { const a = d.workArea; return s.x < a.x + a.width - 100 && s.x + s.width > a.x + 100 && s.y >= a.y - 10 && s.y < a.y + a.height - 100; });
  return visible ? s : { width: s.width, height: s.height, maximized: s.maximized };
}

function createWindow() {
  const b = initialBounds();
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height, minWidth: 1000, minHeight: 640,
    backgroundColor: '#f5f4f0', show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  if (b.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadFile(PAGE);

  // Keep the window on the planner: anything else (links) opens in the browser.
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file:') && decodeURIComponent(new URL(url).pathname).endsWith('/index.html')) return;
    e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });

  // Track the venue so the menu's radio items follow it (the page switches venue by reloading itself).
  win.webContents.on('did-finish-load', async () => {
    venue = await win.webContents.executeJavaScript('window.__planner ? __planner.VENUE_ID : null').catch(() => null);
    buildMenu();
  });

  // Saves and PNG exports arrive as downloads: ask where, starting in the folder used last time.
  win.webContents.session.on('will-download', (e, item) => {
    const prefs = readJSON(path.join(app.getPath('userData'), 'prefs.json'), {});
    const dir = prefs.saveDir && fs.existsSync(prefs.saveDir) ? prefs.saveDir : app.getPath('documents');
    const png = item.getFilename().toLowerCase().endsWith('.png');
    item.setSaveDialogOptions({
      title: png ? 'Export PNG' : 'Save Layout', defaultPath: path.join(dir, item.getFilename()),
      filters: png ? [{ name: 'PNG image', extensions: ['png'] }] : [{ name: 'Layout', extensions: ['json'] }],
    });
    item.once('done', (ev, state) => {
      if (state !== 'completed') return;
      writeJSON(path.join(app.getPath('userData'), 'prefs.json'), { ...prefs, saveDir: path.dirname(item.getSavePath()) });
    });
  });

  const save = () => writeJSON(statePath(), { ...win.getNormalBounds(), maximized: win.isMaximized() });
  win.on('close', save);
  win.on('closed', () => { win = null; });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    buildMenu(); createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
