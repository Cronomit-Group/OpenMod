const { app, BrowserWindow, shell } = require("electron");
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
    const { code_verifier: verifier, code_challenge } = pkceChallenge();
    code_verifier = verifier;
    console.log(code_challenge)

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

function startTokenRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);

  const expiresAt = store.get('expires_at');
  const refresh_token = store.get('refresh_token');

  if (!expiresAt || !refresh_token) return;

  const timeUntilRefresh = expiresAt - Date.now() - 60_000; // 1 minute before expiry

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
        console.log('Token refreshed!'+new Date(Date.now() + tokenData.expires_in * 1000));
        store.set('access_token', tokenData.access_token);
        store.set('refresh_token', tokenData.refresh_token || refresh_token);
        store.set('expires_at', Date.now() + tokenData.expires_in * 1000);
        startTokenRefresh(); // Set up next refresh
      } else {
        console.error('Failed to refresh token:', tokenData);
      }
    } catch (err) {
      console.error('Refresh token error:', err);
    }
  }, Math.max(1000, timeUntilRefresh));
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
}

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