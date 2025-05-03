const { app, BrowserWindow } = require("electron");
const cors = require("cors");
var express = require("express");
const isDev = require('electron-is-dev');
try {
  require('electron-reloader')(module)
} catch {}

var expressApp = express();
expressApp.use(cors());

let win;
const distPath = `dist/angular-electron`;

expressApp.get("/test", (req, res) => {
  console.log("Hit");
  res.send({ response: "Here is a response" });
});

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
