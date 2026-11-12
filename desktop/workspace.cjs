'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const {tool}=require('./local-tools.cjs');

const DEFAULT_SETTINGS = Object.freeze({
  codexPath: '', model: '', reasoningEffort: 'medium',
  theme: 'light', permissions: 'workspace-write',
});
const EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const HEBREW_INSTRUCTIONS = 'Respond to the user in clear Hebrew unless they explicitly request another language. Keep code, command syntax, file paths, identifiers, and original diagnostic output unchanged. Explain progress and final results in Hebrew.';

function fail(message) { throw new Error(message); }
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function boundedString(value, label, max = 4096, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > max || value.includes('\0')) {
    fail(`${label} אינו תקין.`);
  }
  return value;
}
function keysOnly(value, allowed) {
  if (!plain(value)) fail('הבקשה אינה תקינה.');
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`האפשרות ${key} אינה נתמכת בפעולה הזאת.`);
  }
}
function normalizedPath(value) {
  const normalized = path.resolve(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

class WorkspaceStore {
  constructor(directory) {
    this.directory = directory;
    this.file = path.join(directory, 'workspace.json');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.data = { version: 1, projects: [], settings: { ...DEFAULT_SETTINGS } };
    this.warning = null;
    try {
      const loaded = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!plain(loaded)) throw new Error('invalid store');
      if (Array.isArray(loaded.projects)) {
        this.data.projects = loaded.projects.filter(p => plain(p) && typeof p.id === 'string' &&
          typeof p.name === 'string' && typeof p.path === 'string' && path.isAbsolute(p.path))
          .slice(0, 200).map(p => ({ id: p.id, name: p.name, path: p.path, addedAt: p.addedAt || new Date().toISOString() }));
      }
      if (plain(loaded.settings)) this.data.settings = sanitizeSettings(loaded.settings, DEFAULT_SETTINGS, false);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.warning = 'קובץ ההעדפות לא נקרא. נשמר גיבוי והופעלו הגדרות ברירת המחדל.';
        try { fs.copyFileSync(this.file, `${this.file}.backup-${Date.now()}`); } catch {}
      }
    }
  }
  write() {
    const temporary = `${this.file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    try { fs.renameSync(temporary, this.file); }
    catch (error) { try { fs.unlinkSync(temporary); } catch {} throw error; }
  }
  getProjects() { return this.data.projects.map(p => ({ ...p })); }
  getSettings() { return { ...this.data.settings }; }
  saveSettings(settings) {
    this.data.settings = sanitizeSettings(settings, this.data.settings);
    this.write();
    return this.getSettings();
  }
  addProject(directory) {
    boundedString(directory, 'נתיב התיקייה');
    const real = fs.realpathSync(directory);
    if (!fs.statSync(real).isDirectory()) fail('יש לבחור תיקייה.');
    let project = this.data.projects.find(p => normalizedPath(p.path) === normalizedPath(real));
    if (!project) {
      project = { id: crypto.randomUUID(), name: path.basename(real) || real, path: real, addedAt: new Date().toISOString() };
      this.data.projects.unshift(project);
      this.data.projects = this.data.projects.slice(0, 200);
      this.write();
    }
    return { ...project };
  }
  findProject(idOrPath) {
    if (typeof idOrPath !== 'string') return null;
    return this.data.projects.find(p => p.id === idOrPath || normalizedPath(p.path) === normalizedPath(idOrPath)) || null;
  }
  requireProject(idOrPath) {
    const project = this.findProject(idOrPath);
    if (!project) fail('יש לבחור את תיקיית הפרויקט דרך כפתור בחירת התיקייה.');
    let real;
    try { real = fs.realpathSync(project.path); }
    catch { fail('תיקיית הפרויקט אינה זמינה במחשב. בחר אותה מחדש.'); }
    if (!fs.statSync(real).isDirectory() || normalizedPath(real) !== normalizedPath(project.path)) {
      fail('נתיב הפרויקט השתנה. בחר את התיקייה מחדש.');
    }
    return { ...project, path: real };
  }
  removeProject(id) {
    boundedString(id, 'מזהה הפרויקט', 256);
    this.data.projects = this.data.projects.filter(p => p.id !== id);
    this.write();
    return this.getProjects();
  }
}

function sanitizeSettings(update, base = DEFAULT_SETTINGS, strict = true) {
  if (!plain(update)) fail('ההגדרות אינן תקינות.');
  if (strict) keysOnly(update, Object.keys(DEFAULT_SETTINGS));
  const result = { ...base };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!(key in update)) continue;
    const value = update[key];
    try {
      if (key === 'codexPath') {
        boundedString(value, 'נתיב Codex', 4096, true);
        if (value && (!path.isAbsolute(value) || /[\r\n]/.test(value))) fail('יש להזין נתיב מלא לקובץ ההפעלה של Codex.');
        result[key] = value.trim();
      } else if (key === 'model') {
        result[key] = boundedString(value, 'שם המודל', 256, true).trim();
      } else if (key === 'reasoningEffort') {
        if (value !== '' && !EFFORTS.has(value)) fail('רמת החשיבה אינה נתמכת.');
        result[key] = value;
      } else if (key === 'theme') {
        if (!['light', 'dark'].includes(value)) fail('ערכת הצבעים אינה נתמכת.');
        result[key] = value;
      } else if (key === 'permissions') {
        if (!['read-only', 'workspace-write'].includes(value)) fail('רמת ההרשאות אינה נתמכת.');
        result[key] = value;
      }
    } catch (error) { if (strict) throw error; }
  }
  return result;
}

function optionalString(out, source, key, max = 256) {
  if (source[key] != null && source[key] !== '') out[key] = boundedString(source[key], key, max);
}
function optionalBoolean(out, source, key) {
  if (source[key] != null) {
    if (typeof source[key] !== 'boolean') fail(`${key} אינו תקין.`);
    out[key] = source[key];
  }
}
function pagination(source, out) {
  optionalString(out, source, 'cursor', 16384);
  if (source.limit != null) {
    if (!Number.isInteger(source.limit) || source.limit < 1 || source.limit > 100) fail('גודל העמוד אינו תקין.');
    out.limit = source.limit;
  }
  if (source.sortDirection != null) {
    if (!['asc', 'desc'].includes(source.sortDirection)) fail('סדר המיון אינו תקין.');
    out.sortDirection = source.sortDirection;
  }
}

function validateRpcRequest(method, params = {}, store, threadProjects) {
  boundedString(method, 'שם הפעולה', 128);
  if (params == null) params = {};
  if (!plain(params)) fail('הבקשה אינה תקינה.');
  const out = {};
  const thread = () => {
    const id = boundedString(params.threadId, 'מזהה השיחה', 256);
    const projectId = threadProjects.get(id);
    if (!projectId) fail('השיחה אינה שייכת לפרויקט שנבחר. טען את רשימת השיחות מחדש.');
    store.requireProject(projectId);
    out.threadId = id;
  };
  switch (method) {
    case 'account/read':
      keysOnly(params, ['refreshToken']); optionalBoolean(out, params, 'refreshToken'); return out;
    case 'account/login/start':
      keysOnly(params, ['type']);
      if (!['chatgpt', 'chatgptDeviceCode'].includes(params.type)) fail('בגרסה הזאת מתחברים באמצעות חשבון ChatGPT.');
      return { type: params.type };
    case 'account/login/cancel':
      keysOnly(params, ['loginId']); return { loginId: boundedString(params.loginId, 'מזהה ההתחברות', 256) };
    case 'account/logout': case 'account/rateLimits/read': case 'windowsSandbox/readiness':
      keysOnly(params, []); return null;
    case 'windowsSandbox/setupStart':
      keysOnly(params, ['mode', 'cwd']);
      if (!['elevated', 'unelevated'].includes(params.mode)) fail('סוג ההגדרה של סביבת ההרצה אינו נתמך.');
      return { mode: params.mode, cwd: store.requireProject(params.cwd).path };
    case 'model/list':
      keysOnly(params, ['cursor', 'limit', 'includeHidden']);
      pagination(params, out); optionalBoolean(out, params, 'includeHidden'); return out;
    case 'thread/list': {
      keysOnly(params, ['cursor', 'limit', 'archived', 'cwd', 'searchTerm', 'sortKey', 'sortDirection', 'currentAccountOnly']);
      pagination(params, out); optionalBoolean(out, params, 'archived'); optionalString(out, params, 'searchTerm', 512);
      out.currentAccountOnly = true;
      if (params.sortKey != null) {
        if (!['created_at', 'updated_at'].includes(params.sortKey)) fail('סדר המיון אינו תקין.');
        out.sortKey = params.sortKey;
      }
      if (params.cwd != null) out.cwd = store.requireProject(params.cwd).path;
      return out;
    }
    case 'thread/start': {
      keysOnly(params, ['cwd', 'model', 'approvalPolicy', 'sandbox']);
      const project = store.requireProject(params.cwd);
      const settings = store.getSettings();
      optionalString(out, params, 'model');
      if (!out.model && settings.model) out.model = settings.model;
      return { ...out, cwd: project.path, sandbox: settings.permissions,
        approvalPolicy: 'on-request', approvalsReviewer: 'user', developerInstructions: HEBREW_INSTRUCTIONS };
    }
    case 'thread/resume': {
      keysOnly(params, ['threadId', 'cwd', 'model', 'excludeTurns', 'approvalPolicy', 'sandbox']); thread();
      const project = store.requireProject(threadProjects.get(out.threadId));
      if (params.cwd != null && normalizedPath(store.requireProject(params.cwd).path) !== normalizedPath(project.path)) fail('התיקייה אינה שייכת לשיחה הזאת.');
      optionalString(out, params, 'model'); optionalBoolean(out, params, 'excludeTurns');
      return { ...out, cwd: project.path, sandbox: store.getSettings().permissions,
        approvalPolicy: 'on-request', approvalsReviewer: 'user', developerInstructions: HEBREW_INSTRUCTIONS };
    }
    case 'thread/read':
      keysOnly(params, ['threadId', 'includeTurns']); thread(); optionalBoolean(out, params, 'includeTurns'); return out;
    case 'thread/turns/list':
      keysOnly(params, ['threadId', 'cursor', 'limit', 'sortDirection', 'itemsView']); thread(); pagination(params, out);
      if (params.itemsView != null) {
        if (!['notLoaded', 'summary', 'full'].includes(params.itemsView)) fail('סוג תצוגת השיחה אינו תקין.');
        out.itemsView = params.itemsView;
      }
      return out;
    case 'thread/items/list':
      keysOnly(params, ['threadId', 'turnId', 'cursor', 'limit', 'sortDirection']); thread(); pagination(params, out);
      optionalString(out, params, 'turnId'); return out;
    case 'thread/archive':
      keysOnly(params, ['threadId']); thread(); return out;
    case 'thread/name/set':
      keysOnly(params, ['threadId', 'name']); thread(); out.name = boundedString(params.name, 'שם השיחה', 200); return out;
    case 'turn/start': {
      keysOnly(params, ['threadId', 'input', 'model', 'effort', 'cwd', 'approvalPolicy']); thread();
      const project = store.requireProject(threadProjects.get(out.threadId));
      if (params.cwd != null && normalizedPath(store.requireProject(params.cwd).path) !== normalizedPath(project.path)) fail('התיקייה אינה שייכת לשיחה הזאת.');
      if (!Array.isArray(params.input) || params.input.length < 1 || params.input.length > 16) fail('ההודעה אינה תקינה.');
      out.input = params.input.map(item => {
        keysOnly(item, ['type', 'text']);
        if (item.type !== 'text') fail('בגרסה הזאת שולחים הודעות טקסט.');
        return { type: 'text', text: boundedString(item.text, 'ההודעה', 120000) };
      });
      optionalString(out, params, 'model');
      if (params.effort != null) {
        if (!EFFORTS.has(params.effort)) fail('רמת החשיבה אינה נתמכת.');
        out.effort = params.effort;
      }
      out.approvalPolicy = 'on-request'; out.approvalsReviewer = 'user';
      out.cwd = project.path;
      out.sandboxPolicy = store.getSettings().permissions === 'read-only'
        ? { type: 'readOnly', networkAccess: false }
        : { type: 'workspaceWrite', writableRoots: [project.path], networkAccess: false };
      return out;
    }
    case 'turn/interrupt':
      keysOnly(params, ['threadId', 'turnId']); thread(); out.turnId = boundedString(params.turnId, 'מזהה הפעולה', 256); return out;
    case 'config/read':
      keysOnly(params, ['cwd', 'includeLayers']);
      if (params.cwd != null) out.cwd = store.requireProject(params.cwd).path;
      out.includeLayers = false; return out;
    default: fail('הפעולה אינה זמינה באפליקציה.');
  }
}

function isSubset(requested, granted) {
  if (granted === null || granted === undefined || granted === false) return true;
  if (Array.isArray(granted)) return Array.isArray(requested) && granted.every(v => requested.some(r => isSubset(r, v)));
  if (plain(granted)) return plain(requested) && Object.keys(granted).every(k => Object.hasOwn(requested, k) && isSubset(requested[k], granted[k]));
  return requested === granted;
}

function validateApprovalResponse(request, result) {
  if (!plain(request) || !plain(result)) fail('תשובת האישור אינה תקינה.');
  const method = request.method;
  if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
    keysOnly(result, ['decision']);
    if (!['accept', 'acceptForSession', 'decline', 'cancel'].includes(result.decision)) fail('סוג האישור אינו נתמך.');
    const available = request.params?.availableDecisions;
    if (Array.isArray(available) && available.length && !available.some(x => x === result.decision || x?.type === result.decision)) {
      fail('האפשרות הזאת אינה זמינה לבקשת האישור.');
    }
    return { decision: result.decision };
  }
  if (method === 'item/permissions/requestApproval') {
    keysOnly(result, ['permissions', 'scope']);
    if (!plain(result.permissions) || !isSubset(request.params?.permissions || {}, result.permissions)) fail('אפשר לאשר רק את ההרשאות שהתבקשו.');
    if (result.scope != null && !['turn', 'session'].includes(result.scope)) fail('טווח ההרשאה אינו תקין.');
    return { permissions: result.permissions, scope: result.scope || 'turn' };
  }
  if (method === 'mcpServer/elicitation/request') {
    keysOnly(result, ['action', 'content']);
    if (!['accept', 'decline', 'cancel'].includes(result.action)) fail('התשובה אינה תקינה.');
    if (result.action === 'accept' && request.params?.mode !== 'url' && !plain(result.content)) fail('יש להשלים את הפרטים המבוקשים.');
    if (JSON.stringify(result.content || {}).length > 50000) fail('התשובה גדולה מדי.');
    return { action: result.action, content: result.action === 'accept' ? result.content ?? null : null };
  }
  if (method === 'item/tool/requestUserInput' || method === 'tool/requestUserInput') {
    keysOnly(result, ['answers']);
    if (!plain(result.answers)) fail('התשובות אינן תקינות.');
    const ids = new Set((request.params?.questions || []).map(q => q.id));
    const answers = {};
    for (const [id, value] of Object.entries(result.answers)) {
      if (!ids.has(id)) fail('השאלה אינה מוכרת.');
      keysOnly(value, ['answers']);
      if (!Array.isArray(value.answers) || value.answers.length > 10) fail('התשובה אינה תקינה.');
      answers[id] = { answers: value.answers.map(a => boundedString(a, 'התשובה', 10000, true)) };
    }
    return { answers };
  }
  fail('סוג הבקשה אינו נתמך. אפשר לעצור את המשימה ולנסות שוב.');
}

function sanitizeAccountResult(result) {
  if (!plain(result)) return result;
  const account = result.account;
  return { requiresOpenaiAuth: Boolean(result.requiresOpenaiAuth), account: account ? {
    type: account.type, email: account.email || null, planType: account.planType || null,
  } : null };
}
function sanitizeConfigResult(result) {
  const config = result?.config || {};
  return { config: {
    model: config.model ?? null,
    model_reasoning_effort: config.model_reasoning_effort ?? null,
    approval_policy: config.approval_policy ?? null,
    sandbox_mode: config.sandbox_mode ?? null,
  } };
}
function redactLog(value) {
  return String(value).slice(0, 16000)
    .replace(/\bsk-[A-Za-z0-9_-]{10,}/g, '[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~-]+/gi, '$1[redacted]')
    .replace(/((?:access_token|refresh_token|api_key|apiKey|id_token)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[redacted]');
}

function getGitDiff(store, projectId) {
  const project = store.requireProject(projectId);
  return new Promise((resolve, reject) => {
    execFile(tool('git'), ['-c', 'core.pager=cat', '-c', 'core.fsmonitor=false', 'diff', '--no-ext-diff', '--no-textconv', '--no-color', 'HEAD', '--'], {
      cwd: project.path, encoding: 'utf8', timeout: 12000, maxBuffer: 2 * 1024 * 1024,
      windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat' },
    }, (error, stdout, stderr) => {
      if (!error) return resolve({ diff: stdout, truncated: false, source: 'git' });
      if (error.code === 'ENOENT') return reject(new Error('Git אינו מותקן או אינו זמין במחשב.'));
      if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return resolve({ diff: String(stdout || '').slice(0, 2 * 1024 * 1024), truncated: true, source: 'git' });
      if (/not a git repository/i.test(stderr)) return resolve({ diff: '', truncated: false, source: 'git', message: 'התיקייה אינה מאגר Git. השינויים של Codex יופיעו במהלך העבודה.' });
      if (/ambiguous argument 'HEAD'|bad revision 'HEAD'/i.test(stderr)) return resolve({ diff: '', truncated: false, source: 'git', message: 'עדיין אין commit ראשון במאגר. השינויים של Codex יופיעו במהלך העבודה.' });
      reject(new Error('לא ניתן לקרוא את השינויים מ־Git כרגע.'));
    });
  });
}

module.exports = { WorkspaceStore, DEFAULT_SETTINGS, HEBREW_INSTRUCTIONS, sanitizeSettings,
  validateRpcRequest, validateApprovalResponse, isSubset, normalizedPath,
  sanitizeAccountResult, sanitizeConfigResult, redactLog, getGitDiff };
