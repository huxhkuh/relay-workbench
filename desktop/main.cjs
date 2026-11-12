'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, session, Notification } = require('electron');
const { Recovery, inspectProject, sanitizeDiagnostic } = require('./productivity.cjs');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { AgentRouter, handoffText } = require('./agent-router.cjs');
const { NAMES, providerInfo, executable: agentExecutable } = require('./agent-providers.cjs');
const { ProjectConfig, CommandRunner } = require('./workbench.cjs');
const { registerWorkbench } = require('./workbench-ipc.cjs');
const { TaskManager } = require('./task-manager.cjs');
const {tool}=require('./local-tools.cjs');
const { WorkspaceStore, validateRpcRequest, validateApprovalResponse, normalizedPath,
  sanitizeAccountResult, sanitizeConfigResult, redactLog, getGitDiff } = require('./workspace.cjs');

const { LoginManager } = require('./login-manager.cjs');
const logins = new LoginManager({openExternal:url=>shell.openExternal(url)});
app.setName('Relay Workbench');
// Keep existing profiles during the product rename.
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData',path.join(app.getPath('appData'),'Boau Code'));
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
let window;
let store;
let bridge;
let initialURL;
let closing = false;
let connectionPromise = null;
let connectedExecutableSetting = null;
let recovery;
let extraState;
let recoveryBusy = false;
let confirmingClose = false;
let projectConfigs;
let commandRunner;
let tasks;
function readExtras() {
  try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'productivity.json'), 'utf8')); }
  catch { return { pins: [], projectPins: [], notifications: true, autoRecovery: false }; }
}
function writeExtras() {
  const file = path.join(app.getPath('userData'), 'productivity.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(extraState)); fs.renameSync(file + '.tmp', file);
}
function notify(body) {
  if (extraState?.notifications && Notification.isSupported() && window && !window.isFocused()) {
    const note = new Notification({ title: 'Relay Workbench', body });
    note.on('click', () => { window?.show(); window?.focus(); }); note.show();
  }
}
const threadProjects = new Map();
const pendingApprovals = new Map();
const activeTurns = new Map();
const loginURLs = new Map();
const loginIds = new Set();
const requestKey = id => `${typeof id}:${String(id)}`;
const SUPPORTED_REQUESTS = new Set(['item/commandExecution/requestApproval', 'item/fileChange/requestApproval',
  'item/permissions/requestApproval', 'mcpServer/elicitation/request', 'item/tool/requestUserInput', 'tool/requestUserInput']);

function send(data) {
  if (window && !window.isDestroyed()) window.webContents.send('boau:event', data);
}
function getStatus() {
  const value = bridge?.status || { state: 'stopped' };
  return { ...value, running: ['starting', 'ready'].includes(value.state), connected: value.state === 'ready',
    error: value.error ? { code: value.error.code, message: redactLog(value.error.message || value.error) } : null };
}
function assertSender(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('הבקשה אינה מגיעה מחלון האפליקציה.');
  }
  const actual = event.senderFrame.url;
  if (initialURL?.startsWith('file:')) {
    if (actual.split('#')[0].split('?')[0] !== initialURL) throw new Error('מקור הבקשה אינו מאושר.');
  } else if (new URL(actual).origin !== new URL(initialURL).origin) throw new Error('מקור הבקשה אינו מאושר.');
}
function handle(name, callback) {
  ipcMain.handle(`boau:${name}`, async (event, ...args) => {
    assertSender(event);
    try { return await callback(...args); }
    catch (error) { throw new Error(redactLog(error.message || 'הפעולה לא הושלמה.')); }
  });
}
function trustedAuthURL(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
      ['auth.openai.com', 'auth0.openai.com', 'chatgpt.com'].includes(parsed.hostname) &&
      (!parsed.port || parsed.port === '443');
  } catch { return false; }
}
function clearLogin(id) {
  loginIds.delete(id);
  for (const [url, loginId] of loginURLs) if (loginId === id) loginURLs.delete(url);
}
function projectForThread(thread) {
  if (!thread || typeof thread.id !== 'string' || typeof thread.cwd !== 'string') return null;
  const project = store.findProject(thread.cwd);
  if (project) threadProjects.set(thread.id, project.id);
  return project;
}

function bindBridge() {
  bridge = new AgentRouter(path.join(app.getPath('userData'), 'agent-conversations'),{settingsForProject:cwd=>{const project=store.findProject(cwd);return project?projectConfigs.get(project.id):{};}});
  bridge.on('status', () => send({ type: 'status', ...getStatus() }));
  bridge.on('notification', message => {
    const { method, params = {} } = message;
    if (method === 'thread/started') projectForThread(params.thread);
    if (method === 'turn/started' && params.threadId) activeTurns.set(params.threadId, params.turn?.id);
    if (method === 'turn/completed' && params.threadId) activeTurns.delete(params.threadId);
    if (method === 'turn/completed') notify(params.turn?.status === 'failed' ? 'המשימה נכשלה. פתח את השיחה לפרטים.' : 'המשימה הסתיימה. אפשר לבדוק את התוצאה.');
    if (method === 'serverRequest/resolved') pendingApprovals.delete(requestKey(params.requestId));
    if (method === 'account/login/completed') clearLogin(params.loginId);
    if (params.threadId && !threadProjects.has(params.threadId)) return;
    // The model's private raw reasoning stream is not a product-visible surface.
    if (method === 'item/reasoning/textDelta') return;
    send({ type: 'notification', method, params });
  });
  bridge.on('serverRequest', request => {
    if (!SUPPORTED_REQUESTS.has(request.method)) {
      void bridge.respondError(request.id, { code: -32601, message: 'This client does not support the requested interaction.' })
        .catch(error => send({ type: 'error', message: redactLog(error.message) }));
      send({ type: 'error', message: 'Codex ביקש פעולה שהגרסה הזאת אינה תומכת בה. ניתן להמשיך או לעצור את המשימה.' });
      return;
    }
    const threadId = request.params?.threadId;
    if (typeof threadId !== 'string' || !threadProjects.has(threadId)) {
      send({ type: 'error', message: 'התקבלה בקשה משיחה שאינה שייכת לפרויקט פתוח. החיבור נעצר.' });
      void bridge.stop();
      return;
    }
    pendingApprovals.set(requestKey(request.id), request);
    notify('המשימה ממתינה לתשובה או לאישור שלך.');
    send({ type: 'request', ...request });
  });
  bridge.on('stderr', text => send({ type: 'stderr', text: redactLog(text) }));
  bridge.on('diagnostic', value => send({ type: 'error', code: value.code, message: redactLog(value.message) }));
  bridge.on('exit', value => {
    pendingApprovals.clear(); activeTurns.clear(); loginURLs.clear(); loginIds.clear();
    connectedExecutableSetting = null;
    send({ type: 'exit', ...value });
  });
  bridge.on('error', error => send({ type: 'error', message: redactLog(error.message || error) }));
}

function bundledExecutable() {
  const executable = path.join(process.resourcesPath, 'codex', 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
  return fs.existsSync(executable) ? executable : undefined;
}
async function connect(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => k !== 'projectId')) throw new Error('אפשרויות החיבור אינן תקינות.');
  if (connectionPromise) return connectionPromise;
  const project = options.projectId ? store.requireProject(options.projectId) : null;
  const cwd = project?.path || path.join(app.getPath('userData'), 'agent-workspace');
  fs.mkdirSync(cwd, { recursive: true });
  const settings = store.getSettings();
  const executable = settings.codexPath || bundledExecutable();
  if (bridge.status.state === 'ready' && connectedExecutableSetting === settings.codexPath &&
      (!project || normalizedPath(bridge.status.cwd) === normalizedPath(cwd))) return getStatus();
  if (activeTurns.size) throw new Error('יש משימה פעילה. עצור אותה לפני החלפת החיבור.');
  connectionPromise = (async () => {
    await bridge.stop();
    pendingApprovals.clear();
    await bridge.start({ executable, cwd });
    connectedExecutableSetting = settings.codexPath;
    return getStatus();
  })();
  try { return await connectionPromise; }
  finally { connectionPromise = null; }
}

function setupIPC() {
  handle('taskList',()=>tasks.list());
  handle('taskStart',value=>tasks.start(value));
  handle('taskStop',id=>tasks.stop(id));
  handle('taskRespond',(id,requestId,accept)=>tasks.respond(id,requestId,accept));
  handle('taskOpen',async id=>{
    if(activeTurns.size)throw Error('יש להמתין לסיום המשימה בשיחה הפתוחה.');
    const task=tasks.records.find(t=>t.id===id);if(!task?.threadId||!task.projectId)throw Error('עדיין אין שיחה למשימה הזאת.');if(tasks.running.has(id))throw Error('יש להמתין לסיום משימת הרקע לפני פתיחת השיחה לעריכה.');
    const project=store.requireProject(task.projectId);
    projectConfigs.save(project.id,projectConfigs.get(task.sourceProjectId));
    if(task.provider!=='codex'){
      const file=path.join(tasks.directory,'sessions',task.id,task.threadId.split(':')[1]+'.json');
      const record=JSON.parse(fs.readFileSync(file,'utf8'));bridge.threads.set(record.id,record);bridge.save(record);
    }
    threadProjects.set(task.threadId,project.id);await bridge.select(task.provider);connectedExecutableSetting=null;await connect({projectId:project.id});return {project,thread:{id:task.threadId,cwd:project.path,name:task.prompt.slice(0,60)}};
  });
  registerWorkbench({handle,store,bridge,configs:projectConfigs,commands:commandRunner,dialog,getWindow:()=>window,active:()=>activeTurns.size,recoveryBusy:()=>recoveryBusy,userData:app.getPath('userData')});
  handle('getAgents', async threadId => ({ selected: bridge.threads.get(threadId)?.provider || (threadId ? 'codex' : bridge.selected),
    providers: await Promise.all(Object.keys(bridge.names()).map(id=>['codex','claude'].includes(id)?providerInfo(id):bridge.catalog.info(id))) }));
  handle('selectAgent', async provider => {
    if (activeTurns.size || recoveryBusy || connectionPromise) throw Error('יש להמתין לסיום הפעולה לפני החלפת סוכן.');
    await bridge.select(provider); connectedExecutableSetting = null; return { selected: provider };
  });
  handle('prepareHandoff', async ({ threadId, projectId, messages, notes }) => {
    if (activeTurns.size || recoveryBusy) throw Error('יש לעצור את המשימה לפני העברה.');
    const project = store.requireProject(projectId);
    if (threadProjects.get(threadId) !== project.id) throw Error('השיחה אינה שייכת לפרויקט הנבחר.');
    if (typeof notes !== 'string' || notes.length > 8000) throw Error('בקשת ההמשך ארוכה מדי.');
    const { changes } = await inspectProject(project);
    const provider = bridge.threads.get(threadId)?.provider || 'codex';
    return { text: handoffText({ provider, messages, changes, notes,name:bridge.names()[provider] }), source: provider };
  });
  handle('loginAgent', async provider => {
    if (activeTurns.size || recoveryBusy) throw Error('יש להמתין לסיום הפעולה לפני התחברות.');
    if (!bridge.names()[provider] || provider==='codex' || provider.startsWith('custom-')) throw Error('התחבר באמצעות הכלי הרשמי של הסוכן.');
    // Launch the official login flow; never read or copy provider credentials.
    const spec=provider==='claude'?{command:agentExecutable(provider),args:[]}:bridge.catalog.spec(provider);
    const definition=bridge.catalog.definitions()[provider];
    const prefix=provider==='claude'?[]:spec.args.slice(0,Math.max(0,spec.args.length-definition.args.length));
    const args=[...prefix,...({claude:['auth','login'],antigravity:['acp','--login'],opencode:['auth','login'],cline:['auth'],copilot:['login'],gemini:[]}[provider]||[])];
    return logins.start(provider,spec,args);
  });
  handle('agentLoginStatus', provider => logins.status(provider));
  handle('reopenAgentLogin', provider => logins.reopen(provider));
  handle('submitAgentLoginCode', (provider,code) => logins.submitCode(provider,code));
  handle('getProductivity', () => extraState);
  handle('saveProductivity', value => {
    if (!value || typeof value !== 'object' || Object.keys(value).some(k => !['pins','projectPins','notifications','autoRecovery'].includes(k))) throw Error('אפשרויות לא תקינות.');
    for (const key of ['pins','projectPins']) if (value[key] !== undefined) {
      if (!Array.isArray(value[key]) || value[key].length > 500 || value[key].some(id => typeof id !== 'string' || id.length > 256)) throw Error('רשימת הצמדות לא תקינה.');
      extraState[key] = value[key];
    }
    for (const key of ['notifications','autoRecovery']) if (value[key] !== undefined) {
      if (typeof value[key] !== 'boolean') throw Error('האפשרות אינה תקינה.'); extraState[key] = value[key];
    }
    writeExtras(); return extraState;
  });
  handle('inspectProject', id => inspectProject(id ? store.requireProject(id) : null));
  handle('listRecovery', id => recovery.list(store.requireProject(id)));
  handle('deleteRecovery', async (projectId, id) => {
    if (recoveryBusy || activeTurns.size) throw Error('יש להמתין לסיום הפעולה לפני מחיקת גיבוי.');
    recoveryBusy = true;
    try {
      const project = store.requireProject(projectId);
      if (!recovery.list(project).some(point => point.id === id)) throw Error('נקודת השחזור לא נמצאה.');
      const result = await dialog.showMessageBox(window, { type: 'warning', message: 'למחוק את נקודת השחזור לצמיתות?', buttons: ['ביטול','מחיקת הגיבוי'], defaultId: 0, cancelId: 0 });
      if (result.response !== 1) return { canceled: true };
      recovery.remove(project, id); return { ok: true };
    } finally { recoveryBusy = false; }
  });
  handle('createRecovery', async id => {
    if (activeTurns.size || recoveryBusy) throw Error('יש להמתין לסיום המשימה לפני יצירת נקודת שחזור.');
    recoveryBusy = true;
    try { return await recovery.create(store.requireProject(id)); } finally { recoveryBusy = false; }
  });
  handle('restoreRecovery', async (projectId, id) => {
    if (activeTurns.size || recoveryBusy) throw Error('יש לעצור את המשימה לפני שחזור.');
    recoveryBusy = true;
    try {
      const project = store.requireProject(projectId);
      const answer = await dialog.showMessageBox(window, { type: 'warning', title: 'שחזור קבצי הפרויקט',
        message: 'לחזור לנקודת השחזור?', detail: 'קבצים שנוספו מאז יוסרו וקבצים ששונו יוחלפו. קבצים מוחרגים ב־Git ותיקיית Git אינם משתנים. יישמר גיבוי של המצב הנוכחי לפני השחזור.',
        buttons: ['ביטול', 'שחזור עם גיבוי'], defaultId: 0, cancelId: 0 });
      if (answer.response !== 1) return { canceled: true };
      return await recovery.restore(project, id);
    } finally { recoveryBusy = false; }
  });
  handle('exportDiagnostic', async () => {
    const selected = await dialog.showSaveDialog(window, { title: 'שמירת דוח אבחון', defaultPath: 'boau-diagnostic.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (selected.canceled) return { canceled: true };
    const status = getStatus();
    const report = { appVersion: app.getVersion(), platform: process.platform, arch: process.arch,
      electron: process.versions.electron, state: status.state, connected: status.connected,
      tools: (await inspectProject(null)).checks, activeTasks: activeTurns.size,
      note: 'הדוח אינו כולל תוכן שיחות, קבצים, נתיבי פרויקטים או פרטי חשבון.' };
    fs.writeFileSync(selected.filePath, sanitizeDiagnostic(JSON.stringify(report, null, 2))); return { ok: true };
  });
  handle('openRecoveryFolder', async () => { await shell.openPath(recovery.directory); return { ok: true }; });
  handle('installLocalUpdate', async () => {
    if (activeTurns.size || recoveryBusy) throw Error('יש לסיים משימות לפני עדכון.');
    const picked = await dialog.showOpenDialog(window, { title: 'בחר תיקיית חבילת Relay Workbench שחולצה', properties: ['openDirectory'] });
    if (picked.canceled) return { canceled: true };
    const source = picked.filePaths[0];
    if (!fs.existsSync(path.join(source, 'Boau-Code.exe')) || !fs.existsSync(path.join(source, 'release-manifest.json'))) throw Error('התיקייה אינה חבילת עדכון נתמכת.');
    const answer = await dialog.showMessageBox(window, { type: 'question', message: 'להתקין את החבילה המקומית שנבחרה?', detail: 'יש לבחור רק חבילה ממקור שאתה סומך עליו. בדיקת הקבצים מזהה פגיעה בשלמותם ואינה מאמתת את זהות המפרסם.', buttons: ['ביטול', 'התקנה'], defaultId: 0, cancelId: 0 });
    if (answer.response !== 1) return { canceled: true };
    require('node:child_process').spawn(tool('powershell'), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'install.ps1'), '-Source', source], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
    return { started: true };
  });
  handle('getStatus', () => getStatus());
  handle('getAppInfo', () => ({ name: 'Relay Workbench', version: app.getVersion(), platform: process.platform, packaged: app.isPackaged, warning: store.warning }));
  handle('connect', connect);
  handle('disconnect', async () => { await bridge.stop(); return getStatus(); });
  handle('getProjects', () => store.getProjects());
  handle('chooseFolder', async () => {
    const picked = await dialog.showOpenDialog(window, { title: 'בחר תיקיית פרויקט', buttonLabel: 'בחר תיקייה', properties: ['openDirectory', 'createDirectory'] });
    if (picked.canceled || !picked.filePaths[0]) return null;
    return store.addProject(picked.filePaths[0]);
  });
  handle('removeProject', id => {
    if ([...activeTurns.keys()].some(threadId => threadProjects.get(threadId) === id)) throw new Error('יש משימה פעילה בפרויקט. עצור אותה לפני הסרתו מהרשימה.');
    const projects = store.removeProject(id);
    for (const [threadId, projectId] of threadProjects) if (projectId === id) threadProjects.delete(threadId);
    return projects;
  });
  handle('getSettings', () => store.getSettings());
  handle('saveSettings', settings => {
    if (activeTurns.size && (settings?.permissions !== undefined || settings?.codexPath !== undefined)) {
      const current = store.getSettings();
      if ((settings.permissions != null && settings.permissions !== current.permissions) ||
          (settings.codexPath != null && settings.codexPath !== current.codexPath)) throw new Error('יש לעצור את המשימה לפני שינוי ההרשאות או קובץ ההפעלה.');
    }
    return store.saveSettings(settings);
  });
  handle('getGitDiff', projectId => getGitDiff(store, projectId));
  handle('request', async (method, params = {}) => {
    // The router can list local external-agent history without launching a provider.
    if (bridge.status.state !== 'ready' && method !== 'thread/list') throw new Error('הסוכן עדיין אינו מחובר. לחץ על התחברות.');
    const safe = validateRpcRequest(method, params, store, threadProjects);
    if (method === 'turn/start') {
      if (recoveryBusy) throw Error('מתבצעת פעולת שחזור. המתן לסיומה.');
      if (extraState.autoRecovery) {
        recoveryBusy = true;
        try { await recovery.create(store.requireProject(threadProjects.get(safe.threadId)), 'לפני משימה'); }
        catch (error) { throw Error('לא נוצרה נקודת שחזור: ' + error.message + ' אפשר ליצור מאגר Git או לכבות שחזור אוטומטי במרכז העבודה.'); }
        finally { recoveryBusy = false; }
      }
    }
    if (method.startsWith('windowsSandbox/') && process.platform !== 'win32') throw new Error('הגדרת סביבת ההרצה הזאת זמינה ב־Windows בלבד.');
    if (method === 'windowsSandbox/setupStart' && activeTurns.size) throw new Error('יש לעצור את המשימה לפני הגדרת סביבת ההרצה.');
    if (method === 'account/login/cancel' && !loginIds.has(safe.loginId)) throw new Error('בקשת ההתחברות הזאת אינה פעילה.');
    const result = await bridge.request(method, safe);
    if (method === 'thread/start' || method === 'thread/resume') {
      const project = store.requireProject(safe.cwd);
      if (result?.thread?.id) threadProjects.set(result.thread.id, project.id);
    }
    if (method === 'thread/list' && result && Array.isArray(result.data)) {
      return { ...result, data: result.data.filter(thread => Boolean(projectForThread(thread))) };
    }
    if (method === 'account/login/start') {
      const url = result?.authUrl || result?.verificationUrl;
      if (url) {
        if (!trustedAuthURL(url)) {
          if (result?.loginId) void bridge.request('account/login/cancel', { loginId: result.loginId }).catch(() => {});
          throw new Error('כתובת ההתחברות שהתקבלה אינה כתובת OpenAI מאושרת.');
        }
        loginURLs.clear(); loginIds.clear();
        loginURLs.set(url, result?.loginId);
      }
      if (result?.loginId) loginIds.add(result.loginId);
    }
    if (method === 'account/login/cancel') clearLogin(safe.loginId);
    if (method === 'account/read') return sanitizeAccountResult(result);
    if (method === 'account/logout') { loginURLs.clear(); loginIds.clear(); threadProjects.clear(); }
    if (method === 'config/read') return sanitizeConfigResult(result);
    return result;
  });
  handle('respond', async (id, result) => {
    const key = requestKey(id);
    const request = pendingApprovals.get(key);
    if (!request) throw new Error('בקשת האישור כבר נענתה או הסתיימה.');
    const safe = validateApprovalResponse(request, result);
    await bridge.respond(id, safe);
    pendingApprovals.delete(key);
    return { ok: true };
  });
  handle('openExternal', async url => {
    if (typeof url !== 'string' || !loginURLs.has(url) || !trustedAuthURL(url)) throw new Error('אפשר לפתוח מכאן רק את כתובת ההתחברות הרשמית שהתקבלה מ־Codex.');
    await shell.openExternal(url);
    return { ok: true };
  });
  handle('openElicitationURL', async id => {
    const request=pendingApprovals.get(requestKey(id));
    if(request?.method!=='mcpServer/elicitation/request'||request.params?.mode!=='url')throw Error('בקשת הקישור אינה פעילה.');
    const url=new URL(request.params.url);
    if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443'))throw Error('הקישור המבוקש אינו קישור HTTPS תקין.');
    await shell.openExternal(url.href);return {ok:true};
  });
}

async function createWindow() {
  const devURL = process.env.VITE_DEV_SERVER_URL;
  if (devURL) {
    const parsed = new URL(devURL);
    if (app.isPackaged || parsed.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password) throw new Error('כתובת שרת הפיתוח אינה מאושרת.');
    initialURL = parsed.href;
  } else initialURL = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;
  const connectPolicy = devURL ? `'self' ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:*` : "'none'";
  const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src ${connectPolicy}; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'`;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } }));
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  const icon = path.join(__dirname, '..', 'dist', 'relay.png');
  window = new BrowserWindow({
    title: 'Relay Workbench', width: 1440, height: 940, minWidth: 960, minHeight: 700,
    backgroundColor: '#f7f6f2', show: false,
    ...(fs.existsSync(icon) ? { icon } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-prevent-unload',event=>{const choice=dialog.showMessageBoxSync(window,{type:'warning',message:'יש עריכות שלא נשמרו. לסגור בכל זאת?',buttons:['להמשיך לערוך','סגירה ללא שמירה'],defaultId:0,cancelId:0});if(choice===1)event.preventDefault();else closing=false;});
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== initialURL) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  window.on('close', event => {
    if ((!activeTurns.size && !tasks?.hasRunning()) || closing) return;
    event.preventDefault();
    if (confirmingClose) return;
    confirmingClose = true;
    void dialog.showMessageBox(window, { type: 'warning', message: 'יש משימה פעילה. לעצור ולסגור?', detail: 'שינויים שכבר בוצעו בקבצים יישארו בפרויקט.', buttons: ['להמשיך לעבוד', 'לעצור ולסגור'], defaultId: 0, cancelId: 0 })
      .then(async result => { if (result.response === 1) { await Promise.all([bridge.stop(),tasks?.close(),commandRunner?.close()]); closing = true; app.quit(); } })
      .finally(() => { confirmingClose = false; });
  });
  window.on('closed', () => { window = null; void bridge.stop(); });
  await window.loadURL(initialURL);
}

app.whenReady().then(async () => {
  store = new WorkspaceStore(app.getPath('userData'));
  projectConfigs=new ProjectConfig(path.join(app.getPath('userData'),'project-tools'));
  commandRunner=new CommandRunner(send);
  extraState = readExtras(); recovery = new Recovery(path.join(app.getPath('userData'), 'recovery'));
  bindBridge();
  const taskStates=new Map();
  tasks=new TaskManager({directory:path.join(app.getPath('userData'),'background-tasks'),store,catalog:bridge.catalog,settingsForProject:id=>projectConfigs.get(id),executable:()=>store.getSettings().codexPath||bundledExecutable(),send:event=>{send(event);if(taskStates.get(event.task.id)!==event.task.status&&['waiting','completed','failed'].includes(event.task.status))notify(event.task.status==='waiting'?'משימת רקע ממתינה לאישור שלך.':'משימת רקע הסתיימה: '+event.task.status);taskStates.set(event.task.id,event.task.status);}});
  setupIPC(); await createWindow();
}).catch(error => {
  dialog.showErrorBox('לא ניתן לפתוח את Relay Workbench', redactLog(error.message));
  app.quit();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0 && store) void createWindow(); });
app.on('before-quit', event => {
  logins.close();
  if (closing || !bridge || (bridge.status.state === 'stopped' && !commandRunner?.running.size && !tasks?.hasRunning())) return;
  event.preventDefault(); closing = true;
  const timeout = setTimeout(() => app.exit(0), 5000); timeout.unref();
  Promise.all([bridge.stop(),commandRunner?.close(),tasks?.close()]).finally(() => { clearTimeout(timeout); app.quit(); });
});
