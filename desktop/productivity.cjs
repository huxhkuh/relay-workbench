'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const { redactLog, normalizedPath } = require('./workspace.cjs');
const {tool}=require('./local-tools.cjs');
const LIMIT = 200 * 1024 * 1024;
async function git(cwd, args) {
  return (await exec(tool('git'), ['-c', 'core.fsmonitor=false', ...args], { cwd, windowsHide: true,
    encoding: 'utf8', timeout: 20000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat' } })).stdout;
}
function inside(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || !relative || relative.includes('\0')) throw Error('נתיב לא תקין.');
  const full = path.resolve(root, relative);
  const rel = path.relative(root, full);
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).some(piece => piece.toLowerCase() === '.git')) throw Error('הנתיב מחוץ לפרויקט.');
  let current = root;
  for (const piece of rel.split(path.sep)) {
    current = path.join(current, piece);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw Error('נקודות שחזור אינן תומכות בקישורים סמליים.');
  }
  return full;
}
async function files(root) {
  const top = (await git(root, ['rev-parse', '--show-toplevel'])).trim();
  if (normalizedPath(top) !== normalizedPath(root)) throw Error('לשחזור יש לבחור את תיקיית השורש של מאגר Git.');
  return [...new Set((await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0').filter(Boolean))];
}
class Recovery {
  constructor(directory) { this.directory = directory; fs.mkdirSync(directory, { recursive: true }); }
  folder(projectId) {
    if (typeof projectId !== 'string' || !/^[\w-]{1,100}$/.test(projectId)) throw Error('מזהה פרויקט אינו תקין.');
    const dir = path.join(this.directory, projectId); fs.mkdirSync(dir, { recursive: true }); return dir;
  }
  list(project) {
    return fs.readdirSync(this.folder(project.id)).filter(id => /^[\w-]+$/.test(id)).flatMap(id => {
      try { const m = JSON.parse(fs.readFileSync(path.join(this.folder(project.id), id, 'manifest.json'))); return [{ id, label: m.label, createdAt: m.createdAt, count: m.files.length, bytes: m.bytes }]; } catch { return []; }
    }).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }
  async create(project, label = 'נקודת שחזור') {
    if (typeof label !== 'string' || label.length > 150) throw Error('שם נקודת השחזור ארוך מדי.');
    if (this.list(project).reduce((sum, p) => sum + p.bytes, 0) >= 2 * 1024 * 1024 * 1024) throw Error('הגיבויים הגיעו ל־2GB. מחק נקודות ישנות כדי לפנות מקום.');
    const names = await files(project.path), entries = []; let bytes = 0;
    for (const name of names) {
      const full = inside(project.path, name);
      if (!fs.existsSync(full)) continue;
      const stat = fs.lstatSync(full);
      if (!stat.isFile()) throw Error('נמצאו קבצים שאינם נתמכים בנקודת שחזור.');
      bytes += stat.size; if (bytes > LIMIT || entries.length >= 20000) throw Error('הפרויקט גדול מדי לנקודת שחזור (עד 200MB ו־20,000 קבצים).');
      entries.push({ name, size: stat.size });
    }
    const id = crypto.randomUUID(), dest = path.join(this.folder(project.id), id);
    fs.mkdirSync(path.join(dest, 'files'), { recursive: true });
    try {
      let copied = 0;
      for (const entry of entries) {
        const content = fs.readFileSync(inside(project.path, entry.name));
        copied += content.length; if (copied > LIMIT) throw Error('הפרויקט גדל בזמן הגיבוי. נקודת השחזור בוטלה.');
        entry.size = content.length;
        entry.hash = crypto.createHash('sha256').update(content).digest('hex');
        const target = inside(path.join(dest, 'files'), entry.name);
        fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content);
      }
      fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify({ label, createdAt: new Date().toISOString(), root: project.path, bytes: copied, files: entries }));
    } catch (error) { fs.rmSync(dest, { recursive: true, force: true }); throw error; }
    return { id, count: entries.length };
  }
  remove(project, id) {
    if (typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)) throw Error('נקודת שחזור אינה תקינה.');
    const root = this.folder(project.id), target = path.resolve(root, id);
    if (path.dirname(target) !== root) throw Error('נתיב גיבוי אינו תקין.');
    fs.rmSync(target, { recursive: true });
  }
  async restore(project, id) {
    if (typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)) throw Error('נקודת שחזור אינה תקינה.');
    const source = path.join(this.folder(project.id), id), manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json')));
    if (normalizedPath(manifest.root) !== normalizedPath(project.path)) throw Error('נקודת השחזור שייכת לתיקייה אחרת.');
    const content = manifest.files.map(entry => {
      const target = inside(project.path, entry.name), data = fs.readFileSync(inside(path.join(source, 'files'), entry.name));
      if (crypto.createHash('sha256').update(data).digest('hex') !== entry.hash) throw Error('נקודת השחזור פגומה.');
      return { target, data };
    });
    const current = await files(project.path);
    // Always save current contents before any overwrite or removal.
    const backup = await this.create(project, 'גיבוי אוטומטי לפני שחזור');
    const keep = new Set(manifest.files.map(e => e.name));
    for (const name of current) {
      const full = inside(project.path, name);
      if (!keep.has(name) && fs.existsSync(full)) fs.unlinkSync(full);
    }
    for (const { target, data } of content) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, data); }
    return { backupId: backup.id, count: content.length };
  }
}
function sanitizeDiagnostic(value, home = require('node:os').homedir()) {
  return redactLog(value).split(home).join('[תיקיית משתמש]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[דוא״ל מוסתר]')
    .replace(/((?:password|secret|token|authorization|cookie)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[מוסתר]');
}
async function inspectProject(project) {
  const checks = [];
  for (const [name, args] of [['git', ['--version']], ['node', ['--version']], ['python', ['--version']]]) {
    try { const result = await exec(tool(name), args, { cwd: project?.path, windowsHide: true, timeout: 5000 }); checks.push({ name, available: true, version: result.stdout.trim() }); }
    catch { checks.push({ name, available: false }); }
  }
  let changes = [], message = '';
  if (project) try {
    const raw = await git(project.path, ['status', '--porcelain=v1', '-z', '--untracked-files=normal']);
    const parts = raw.split('\0').filter(Boolean);
    for (let i=0;i<parts.length;i++) { const status = parts[i].slice(0,2), name = parts[i].slice(3); changes.push({ status, name }); if (/[RC]/.test(status)) i++; }
  } catch { message = 'תצוגת הקבצים ונקודות השחזור דורשות מאגר Git נגיש.'; }
  return { checks, changes, message };
}
module.exports = { Recovery, inside, files, inspectProject, sanitizeDiagnostic };
