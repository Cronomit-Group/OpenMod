const { app, BrowserWindow, shell, ipcMain  } = require("electron");
const cors = require("cors");
var express = require("express");
const isDev = require('electron-is-dev');
try {
  require('electron-reloader')(module)
} catch {}

const fetch = require('node-fetch');
const Store = require('electron-store');
const pkceChallenge = require('pkce-challenge');
const path = require('path');
// === CONFIGURATION ===
const CLIENT_ID = 'openmod';
const REALM = 'master';
const BASE_URL = `https://idp.cronomit.hu/realms/${REALM}`;
const REDIRECT_URI = 'http://localhost:3000/auth/callback';
const TOKEN_ENDPOINT = `${BASE_URL}/protocol/openid-connect/token`;
const AUTH_ENDPOINT = `${BASE_URL}/protocol/openid-connect/auth`;

const store = new Store();
let code_verifier;
let refreshInterval;

var expressApp = express();
expressApp.use(cors());

let win;
const distPath = `dist/angular-electron`;

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (win) {
      if (win.isMinimized()) win.restore()
        win.focus()
    }
  })
}


expressApp.get("/test", (req, res) => {
  console.log("Hit");
  res.send({ response: "Here is a response" });
});
  // Step 1: Start login
expressApp.get('/auth/login', (req, res) => {
  const accessToken = store.get('access_token');
  const expiresAt = store.get('expires_at');

  // ✅ Check if already authenticated
  if (accessToken && Date.now() < expiresAt) {
    console.log('Already authenticated, skipping login');
    res.send('Already authenticated');
    return;
  }

  // If not authenticated, proceed with login
  const { code_verifier: verifier, code_challenge } = pkceChallenge();
  code_verifier = verifier;

  const loginUrl = `${AUTH_ENDPOINT}?` +
    `client_id=${CLIENT_ID}&response_type=code&scope=openid` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&code_challenge=${code_challenge}&code_challenge_method=S256`;

  shell.openExternal(loginUrl);
  res.send('Opening browser for login...');
});


  // Step 2: Callback
  expressApp.get('/auth/callback', async (req, res) => {
    const authCode = req.query.code;
    if (!authCode || !code_verifier) {
      return res.status(400).sendFile(__dirname + "/src/views/error.html")//.send('Missing authorization code or verifier');
    }

    try {
      const tokenRes = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          code: authCode,
          code_verifier: code_verifier
        })
      });

      const tokenData = await tokenRes.json();

      if (tokenData.access_token) {
        const expiresAt = Date.now() + tokenData.expires_in * 1000;
        //console.log()

        store.set('access_token', tokenData.access_token);
        store.set('refresh_token', tokenData.refresh_token);
        store.set('expires_at', expiresAt);

        console.log('Tokens saved to store');
        startTokenRefresh();
        ipcMain.emit('auth-success');
        res.sendFile(__dirname + "/src/views/successful.html")
        //res.send('Login successful. You can close this window.'+new Date(expiresAt));
      } else {
        console.error('Token error:', tokenData);
        res.status(500)//.send('Failed to get token');
        res.sendFile(__dirname + "/src/views/error.html")
      }
    } catch (err) {
      console.error('Token request failed:', err);
      res.status(500)//.send('Token exchange failed');
      res.sendFile(__dirname + "/src/views/error.html")
    }
  });
expressApp.get('/auth/user', async (req, res) => {
  const accessToken = store.get('access_token');

  if (!accessToken) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  try {
    const userInfoResponse = await fetch(`${BASE_URL}/protocol/openid-connect/userinfo`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      }
    });

    if (!userInfoResponse.ok) {
      console.error('Failed to fetch user info:', await userInfoResponse.text());
      return res.status(500).json({ error: "Failed to fetch user info" });
    }

    const userInfo = await userInfoResponse.json();
    console.log('User Info:', userInfo);

    res.json(userInfo);

  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ error: "Error fetching user info" });
  }
});

expressApp.get('/auth/status', async (req, res) => {
  const accessToken = store.get('access_token');
  const expiresAt = store.get('expires_at');
  const refreshToken = store.get('refresh_token');

  // Check if the access token is still valid
  if (accessToken && Date.now() < expiresAt) {
    res.json({ authenticated: true });
    return;
  }

  // If the access token is expired, attempt to refresh it
  if (refreshToken) {
    console.log('🔄 Access token expired, attempting refresh...');

    try {
      const tokenRes = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: CLIENT_ID,
          refresh_token: refreshToken,
        }),
      });

      const tokenData = await tokenRes.json();

      if (tokenData.access_token) {
        console.log('🔄 Token successfully refreshed.');
        const newExpiresAt = Date.now() + tokenData.expires_in * 1000;

        store.set('access_token', tokenData.access_token);
        store.set('refresh_token', tokenData.refresh_token || refreshToken);
        store.set('expires_at', newExpiresAt);

        // Start the refresh cycle again
        startTokenRefresh();

        res.json({ authenticated: true });
        return;
      } else {
        console.error('Failed to refresh token:', tokenData);
      }
    } catch (err) {
      console.error('Refresh token error:', err);
    }
  }

  // If refresh fails or there is no refresh token, authentication is required
  res.json({ authenticated: false });
});


ipcMain.handle('auth-status', async () => {
  const accessToken = store.get('access_token');
  const expiresAt = store.get('expires_at');
  return accessToken && Date.now() < expiresAt;
});

function startTokenRefresh() {
  if (refreshInterval) clearTimeout(refreshInterval);

  const expiresAt = store.get('expires_at');
  const refresh_token = store.get('refresh_token');

  if (!expiresAt || !refresh_token) {
    console.error('No expiration or refresh token found.');
    return;
  }

  let timeUntilRefresh = expiresAt - Date.now() - 60_000; // 1 minute before expiry

  // 🛑 If timeUntilRefresh is negative or too small, we set a minimum wait time
  if (timeUntilRefresh < 50_000) { // less than 10 seconds
    console.warn('⚠️ Expiry time too short, setting to 50 seconds.');
    timeUntilRefresh = 50_000; // 10 seconds minimum
  }

  console.log(`🔄 Next token refresh scheduled in ${timeUntilRefresh / 1000} seconds.`);

  refreshInterval = setTimeout(async () => {
    console.log('Attempting to refresh token...');
    try {
      const tokenRes = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: CLIENT_ID,
          refresh_token: refresh_token
        })
      });

      const tokenData = await tokenRes.json();

      if (tokenData.access_token) {
        console.log('Token refreshed! ' + new Date(Date.now() + tokenData.expires_in * 1000));
        store.set('access_token', tokenData.access_token);
        store.set('refresh_token', tokenData.refresh_token || refresh_token);
        store.set('expires_at', Date.now() + tokenData.expires_in * 1000);

        // 🔄 Start the refresh process again
        startTokenRefresh();
      } else {
        console.error('Failed to refresh token:', tokenData);
      }
    } catch (err) {
      console.error('Refresh token error:', err);
    }
  }, timeUntilRefresh);
}




function createWindow() {
  let pathom = ""
  if (!isDev) {
    pathom="file://${__dirname}/${distPath}";
  } else {
    pathom = "http://localhost:4200"
  }
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: "#ffffff",
    icon: `${pathom}/assets/logo.png`,
    webPreferences: {
      contextIsolation: false,    // Important for security
      nodeIntegration: true,    // This is disabled, we use preload instead
    },
  });

  //win.loadURL(`file://${__dirname}/${distPath}/index.html`);
  win.loadURL(pathom)

  win.webContents.openDevTools();

  win.on("closed", function () {
    win = null;
  });

  expressApp.listen(3000, () => {
    console.log("App is listening");
  });

  ipcMain.on('auth-success', () => {
    console.log("🔄 Refreshing window after authentication");
    win.webContents.reload();
  });
}

ipcMain.handle('open-external-link', async (_, url) => {
  await shell.openExternal(url);
});

app.on("ready", createWindow);

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});


if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('openmod', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('openmod')
}
