const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');

// Suppress harmless Chromium GPU cache errors
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('log-level', '3'); // only FATAL

let win, tray;
let isPaused = false;
let isMuted = false;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const fullBounds = screen.getPrimaryDisplay().bounds;

  win = new BrowserWindow({
    x: 0,
    y: 0,
    width: fullBounds.width,
    height: fullBounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setIgnoreMouseEvents(true, { forward: true });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.loadFile('renderer/index.html');

  // Prevent the window from being closed accidentally
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  // Create a 16x16 tray icon programmatically
  const iconSize = 16;
  const canvas = Buffer.alloc(iconSize * iconSize * 4);
  // Draw a tiny teal blob
  for (let y = 0; y < iconSize; y++) {
    for (let x = 0; x < iconSize; x++) {
      const idx = (y * iconSize + x) * 4;
      const cx = x - 8, cy = y - 8;
      const dist = Math.sqrt(cx * cx + cy * cy);
      if (dist < 6) {
        // Eyes
        if ((x === 6 || x === 10) && y === 6) {
          canvas[idx] = 255; canvas[idx+1] = 255; canvas[idx+2] = 255; canvas[idx+3] = 255;
        } else {
          canvas[idx] = 100; canvas[idx+1] = 220; canvas[idx+2] = 210; canvas[idx+3] = 255; // Teal
        }
      } else {
        canvas[idx+3] = 0; // Transparent
      }
    }
  }
  const img = nativeImage.createFromBuffer(canvas, { width: iconSize, height: iconSize });

  tray = new Tray(img);
  tray.setToolTip('Dead Pixel Pet — Bitsy is alive!');
  updateTrayMenu();
}

function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Dead Pixel Pet', enabled: false },
    { type: 'separator' },
    {
      label: isPaused ? '▶ Resume' : '⏸ Pause',
      click: () => {
        isPaused = !isPaused;
        win.webContents.send('set-paused', isPaused);
        updateTrayMenu();
      }
    },
    {
      label: isMuted ? '🔊 Unmute' : '🔇 Mute',
      click: () => {
        isMuted = !isMuted;
        win.webContents.send('set-muted', isMuted);
        updateTrayMenu();
      }
    },
    { type: 'separator' },
    {
      label: '✨ Customize',
      click: () => {
        win.webContents.send('open-customize');
      }
    },
    {
      label: '⚙ Settings',
      click: () => {
        win.webContents.send('open-settings');
      }
    },
    {
      label: '📊 Stats',
      click: () => {
        win.webContents.send('open-stats');
      }
    },
    { type: 'separator' },
    {
      label: '❌ Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
}

// IPC handlers
ipcMain.on('set-ignore-mouse', (event, ignore) => {
  if (!win) return;
  if (ignore) {
    win.setFocusable(false);
    win.setIgnoreMouseEvents(true, { forward: true });
  } else {
    win.setIgnoreMouseEvents(false);
    win.setFocusable(true);
  }
});

ipcMain.on('set-interactive', (event, interactive) => {
  if (!win) return;
  if (interactive) {
    win.setIgnoreMouseEvents(false);
    win.setFocusable(true);
    win.focus();
  } else {
    win.setFocusable(false);
    win.setIgnoreMouseEvents(true, { forward: true });
  }
});

ipcMain.handle('get-screen-bounds', () => {
  const display = screen.getPrimaryDisplay();
  return {
    workArea: display.workArea,
    bounds: display.bounds,
    scaleFactor: display.scaleFactor
  };
});

ipcMain.handle('get-taskbar-bounds', () => {
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;
  const b = display.bounds;
  // Taskbar is the difference between bounds and workArea
  if (wa.y > b.y) return { position: 'top', height: wa.y - b.y }; // top
  if (wa.x > b.x) return { position: 'left', width: wa.x - b.x };
  if (wa.width < b.width) return { position: 'right', width: b.width - wa.width };
  return { position: 'bottom', height: b.height - wa.height, y: wa.y + wa.height };
});

app.whenReady().then(() => {
  // macOS: hide dock icon (desktop pet shouldn't show in dock)
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  createWindow();
  createTray();

  // macOS: re-create window when clicking dock icon
  app.on('activate', () => {
    if (!win) createWindow();
    else win.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
