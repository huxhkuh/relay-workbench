'use strict';

/**
 * Local Codex app-server transport. No model requests or authentication are made
 * by start(): it only performs the documented initialize/initialized handshake.
 *
 * Events: status(snapshot), notification({method, params}),
 * serverRequest({id, method, params}), stderr(text), diagnostic({code, message}),
 * exit({code, signal}). Server request IDs retain their original JSON type.
 * Keep this module in the trusted desktop process; the renderer must use an
 * allowlisted IPC interface instead of receiving the transport directly.
 */

const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isId = (id) => id === null || typeof id === 'string' ||
  (typeof id === 'number' && Number.isFinite(id));

class CodexBridgeError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = 'CodexBridgeError';
    this.code = code;
    if (data !== undefined) this.data = data;
  }
}

function positiveInteger(value, fallback, name) {
  const result = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(result) || result < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return result;
}

function safeString(value, name) {
  if (typeof value !== 'string' || !value || /[\0\r\n]/u.test(value)) {
    throw new CodexBridgeError('INVALID_ARGUMENT', `${name} must be a non-empty string without control characters`);
  }
  return value;
}

async function isFile(filename) {
  try { return (await fs.stat(filename)).isFile(); } catch { return false; }
}

function envValue(env, name) {
  const key = Object.keys(env).find((entry) => entry.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : env[key];
}

async function findCommand(command, cwd, env, platform) {
  if (path.isAbsolute(command) || command.includes('/') || command.includes('\\')) {
    const candidate = path.resolve(cwd, command);
    return await isFile(candidate) ? candidate : null;
  }
  const extensions = platform === 'win32'
    ? (path.extname(command) ? [''] : (envValue(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD').split(';'))
    : [''];
  const delimiter = platform === 'win32' ? ';' : path.delimiter;
  for (const directory of (envValue(env, 'PATH') || '').split(delimiter)) {
    // Never search the current working directory through an empty PATH entry.
    if (!directory) continue;
    const cleanDirectory = directory.replace(/^"|"$/gu, '');
    for (const extension of extensions) {
      const candidate = path.resolve(cleanDirectory, command + extension);
      if (await isFile(candidate)) {
        if (platform !== 'win32') {
          try { await fs.access(candidate, fs.constants.X_OK); } catch { continue; }
        }
        return candidate;
      }
    }
  }
  return null;
}

async function asDescriptor(filename, source, nodeExecutable) {
  let actual = filename;
  try { actual = await fs.realpath(filename); } catch { /* Stat already checked. */ }
  if (/\.[cm]?js$/iu.test(actual)) {
    return { command: nodeExecutable, args: [actual], source };
  }
  if (/\.(cmd|bat)$/iu.test(actual)) {
    // npm's Windows shim is not required when its real JS entry point exists.
    const directory = path.dirname(actual);
    const npmEntries = [
      path.join(directory, 'node_modules', '@openai', 'codex', 'bin', 'codex.js'),
      path.join(directory, '..', '@openai', 'codex', 'bin', 'codex.js'),
    ];
    for (const entry of npmEntries) {
      if (await isFile(entry)) return { command: nodeExecutable, args: [entry], source: `${source}:npm` };
    }
  }
  return { command: actual, args: [], source };
}

/** Resolve the bundled CLI, an explicitly selected CLI, a local npm install, or PATH. */
async function resolveCodexExecutable(options = {}) {
  const { executable, cwd = process.cwd(), env = process.env, platform = process.platform,
    resourcesPath = process.resourcesPath, nodeExecutable = process.execPath } = options;

  if (executable && typeof executable === 'object' && !Array.isArray(executable)) {
    safeString(executable.command, 'executable.command');
    if (executable.args !== undefined && (!Array.isArray(executable.args) ||
      executable.args.some((argument) => typeof argument !== 'string' || /[\0\r\n]/u.test(argument)))) {
      throw new CodexBridgeError('INVALID_ARGUMENT', 'executable.args must be an array of strings');
    }
    const command = await findCommand(executable.command, cwd, env, platform);
    if (!command) throw new CodexBridgeError('CODEX_NOT_FOUND', 'The selected executable does not exist');
    return { command, args: [...(executable.args || [])], source: 'explicit' };
  }
  if (executable !== undefined) {
    safeString(executable, 'executable');
    const filename = await findCommand(executable, cwd, env, platform);
    if (!filename) throw new CodexBridgeError('CODEX_NOT_FOUND', 'The selected Codex executable was not found');
    return asDescriptor(filename, 'explicit', nodeExecutable);
  }

  const executableName = platform === 'win32' ? 'codex.exe' : 'codex';
  const bundledCandidates = resourcesPath ? [
    path.join(resourcesPath, 'codex', 'bin', executableName),
    path.join(resourcesPath, 'codex', executableName),
  ] : [];
  for (const candidate of bundledCandidates) {
    if (await isFile(candidate)) return asDescriptor(candidate, 'bundled', nodeExecutable);
  }
  // Prefer the application's pinned dependency over an unrelated global version.
  const npmEntry = path.resolve(__dirname, '..', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  if (await isFile(npmEntry)) return asDescriptor(npmEntry, 'local-npm', nodeExecutable);
  const onPath = await findCommand('codex', cwd, env, platform);
  if (onPath) return asDescriptor(onPath, 'path', nodeExecutable);
  if (platform === 'win32') {
    const npmHome = envValue(env, 'APPDATA');
    if (npmHome) {
      const globalEntry = path.join(npmHome, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
      if (await isFile(globalEntry)) return asDescriptor(globalEntry, 'global-npm', nodeExecutable);
    }
  }
  throw new CodexBridgeError('CODEX_NOT_FOUND', 'Codex CLI was not found. Install the official CLI or select its executable.');
}

/** Quote every cmd.exe token and reject expansion syntax, never interpolate a shell command. */
function buildSpawnSpec(descriptor, platform = process.platform, env = process.env) {
  // These apply only to this child process. They prevent a user's unrelated
  // full-access CLI defaults from becoming this application's startup policy.
  // Individual threads may request the narrower read-only mode through IPC.
  const args = [...descriptor.args,
    '-c', 'sandbox_mode=workspace-write',
    '-c', 'approval_policy=on-request',
    '-c', 'approvals_reviewer=user',
    '-c', 'sandbox_workspace_write.network_access=false',
    '-c', 'sandbox_workspace_write.writable_roots=[]',
    'app-server', '--listen', 'stdio://'];
  if (platform !== 'win32' || !/\.(cmd|bat)$/iu.test(descriptor.command)) {
    return { command: descriptor.command, args, windowsVerbatimArguments: false };
  }
  const tokens = [descriptor.command, ...args];
  for (const token of tokens) {
    // Percent expansion occurs even inside quotes. Newlines/quotes could escape
    // the wrapper. Delayed expansion is disabled, with ! also rejected defensively.
    if (/["%!\0\r\n]/u.test(token)) {
      throw new CodexBridgeError('UNSAFE_WINDOWS_SHIM', 'This Windows launcher path cannot be safely quoted; select codex.exe instead.');
    }
  }
  const commandLine = `"${tokens.map((token) => `"${token}"`).join(' ')}"`;
  const systemRoot = envValue(env, 'SystemRoot') || 'C:\\Windows';
  return {
    command: path.win32.join(systemRoot, 'System32', 'cmd.exe'),
    args: ['/d', '/s', '/v:off', '/c', commandLine],
    windowsVerbatimArguments: true,
  };
}

async function childEnvironment(descriptor) {
  const env = { ...process.env };
  if (process.versions.electron && descriptor.command === process.execPath) env.ELECTRON_RUN_AS_NODE = '1';
  const binaryDirectory = path.dirname(descriptor.command);
  const packageDirectory = path.basename(binaryDirectory).toLowerCase() === 'bin'
    ? path.dirname(binaryDirectory) : binaryDirectory;
  const helperDirectory = path.join(packageDirectory, 'codex-path');
  try {
    if ((await fs.stat(helperDirectory)).isDirectory()) {
      const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
      env[pathKey] = `${helperDirectory}${path.delimiter}${env[pathKey] || ''}`;
    }
  } catch { /* Native packages without helper tools are also supported. */ }
  return env;
}

class CodexBridge extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      requestTimeoutMs: positiveInteger(options.requestTimeoutMs, 60_000, 'requestTimeoutMs'),
      initializeTimeoutMs: positiveInteger(options.initializeTimeoutMs, 20_000, 'initializeTimeoutMs'),
      stopTimeoutMs: positiveInteger(options.stopTimeoutMs, 2_000, 'stopTimeoutMs'),
      killTimeoutMs: positiveInteger(options.killTimeoutMs, 1_000, 'killTimeoutMs'),
      maxLineBytes: positiveInteger(options.maxLineBytes, 8 * 1024 * 1024, 'maxLineBytes'),
      maxBufferedWriteBytes: positiveInteger(options.maxBufferedWriteBytes, 16 * 1024 * 1024, 'maxBufferedWriteBytes'),
      maxPendingRequests: positiveInteger(options.maxPendingRequests, 256, 'maxPendingRequests'),
      maxServerRequests: positiveInteger(options.maxServerRequests, 128, 'maxServerRequests'),
    };
    this._status = { state: 'stopped', pid: null, executable: null, cwd: null, startedAt: null, error: null };
    this._session = null;
    this._startPromise = null;
    this._stopPromise = null;
    this._generation = 0;
    this._nextId = 1;
  }

  get status() {
    return { ...this._status, error: this._status.error ? { ...this._status.error } : null };
  }

  _setStatus(state, changes = {}) {
    this._status = { ...this._status, ...changes, state };
    this.emit('status', this.status);
  }

  start(options = {}) {
    if (this._stopPromise) return this._stopPromise.then(() => this.start(options));
    if (this._startPromise) return this._startPromise;
    if (this._status.state === 'ready') return Promise.resolve(this.status);
    const generation = ++this._generation;
    const promise = this._launch(options, generation);
    this._startPromise = promise;
    const clear = () => { if (this._startPromise === promise) this._startPromise = null; };
    promise.then(clear, clear);
    return promise;
  }

  async _launch(options, generation) {
    if (this._session && !this._session.closed) await this._terminateSession(this._session);
    if (generation !== this._generation) throw new CodexBridgeError('STOPPED', 'Codex startup was cancelled');
    this._setStatus('starting', { error: null, pid: null, startedAt: null });
    let session;
    try {
      const cwd = path.resolve(options.cwd || os.homedir());
      if (!(await fs.stat(cwd)).isDirectory()) throw new CodexBridgeError('INVALID_CWD', 'The selected workspace is not a directory');
      const descriptor = await resolveCodexExecutable({ executable: options.executable, cwd });
      const env = await childEnvironment(descriptor);
      const spec = buildSpawnSpec(descriptor, process.platform, env);
      if (generation !== this._generation) throw new CodexBridgeError('STOPPED', 'Codex startup was cancelled');
      const child = spawn(spec.command, spec.args, {
        cwd, env, shell: false, windowsHide: true,
        windowsVerbatimArguments: spec.windowsVerbatimArguments,
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      session = {
        child, descriptor, generation, pending: new Map(), serverRequests: new Map(),
        fragments: [], bufferedBytes: 0, closed: false, stopRequested: false,
        fault: null, terminatePromise: null, stderrTail: '',
      };
      session.exitPromise = new Promise((resolve) => { session.resolveExit = resolve; });
      this._session = session;
      this._setStatus('starting', { pid: child.pid || null, executable: descriptor.command, cwd });
      child.stdout.on('data', (chunk) => this._readStdout(session, chunk));
      child.stdout.on('end', () => {
        if (session.bufferedBytes && !session.fault && !session.stopRequested) {
          const line = Buffer.concat(session.fragments, session.bufferedBytes);
          session.fragments = []; session.bufferedBytes = 0;
          this._parseLine(session, line);
        }
      });
      child.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        session.stderrTail = (session.stderrTail + text).slice(-16_384);
        this.emit('stderr', text.slice(-16_384));
      });
      child.stdin.on('error', (error) => {
        if (!session.stopRequested && !session.closed) this._abortSession(session,
          new CodexBridgeError('WRITE_FAILED', `Cannot write to Codex: ${error.message}`));
      });
      child.on('error', (error) => this._abortSession(session,
        new CodexBridgeError('SPAWN_FAILED', `Codex could not start: ${error.message}`)));
      child.on('close', (code, signal) => this._onClose(session, code, signal));
      await this._request(session, 'initialize', {
        clientInfo: { name: 'relay_workbench', title: 'Relay Workbench', version: require('../package.json').version },
      }, this.options.initializeTimeoutMs);
      if (session.closed || session.stopRequested || generation !== this._generation) {
        throw new CodexBridgeError('STOPPED', 'Codex startup was cancelled');
      }
      await this._write(session, { method: 'initialized' });
      if (session.closed || session.stopRequested) throw new CodexBridgeError('STOPPED', 'Codex startup was cancelled');
      this._setStatus('ready', { startedAt: new Date().toISOString(), error: null });
      return this.status;
    } catch (error) {
      const wrapped = error instanceof CodexBridgeError ? error
        : new CodexBridgeError(error.code === 'ENOENT' ? 'INVALID_CWD' : 'START_FAILED', error.message);
      if (session) {
        if (!session.stopRequested) this._abortSession(session, wrapped);
        await this._terminateSession(session);
      } else if (generation === this._generation) {
        this._setStatus('error', { pid: null, error: { code: wrapped.code, message: wrapped.message } });
      }
      throw wrapped;
    }
  }

  request(method, params, options = {}) {
    if (this._status.state !== 'ready' || !this._session || this._session.closed) {
      return Promise.reject(new CodexBridgeError('NOT_READY', 'Codex is not connected'));
    }
    let timeoutMs;
    try { timeoutMs = positiveInteger(options.timeoutMs, this.options.requestTimeoutMs, 'timeoutMs'); }
    catch (error) { return Promise.reject(error); }
    return this._request(this._session, method, params, timeoutMs);
  }

  _request(session, method, params, timeoutMs) {
    try { safeString(method, 'method'); } catch (error) { return Promise.reject(error); }
    if (session.closed || session.stopRequested) return Promise.reject(new CodexBridgeError('STOPPED', 'Codex is stopped'));
    if (session.pending.size >= this.options.maxPendingRequests) {
      return Promise.reject(new CodexBridgeError('TOO_MANY_REQUESTS', 'Too many Codex requests are pending'));
    }
    if (!Number.isSafeInteger(this._nextId)) return Promise.reject(new CodexBridgeError('ID_EXHAUSTED', 'Restart the app to continue'));
    const id = this._nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pending.delete(id);
        reject(new CodexBridgeError('REQUEST_TIMEOUT', `Codex did not respond to ${method} in time`, { method }));
      }, timeoutMs);
      timer.unref?.();
      session.pending.set(id, { resolve, reject, timer });
      this._write(session, { id, method, ...(params === undefined ? {} : { params }) }).catch((error) => {
        const pending = session.pending.get(id);
        if (pending) {
          clearTimeout(pending.timer); session.pending.delete(id); pending.reject(error);
        }
      });
    });
  }

  async respond(id, result) { return this._respond(id, { result }); }

  async respondError(id, error) {
    if (!error || !Number.isInteger(error.code) || typeof error.message !== 'string') {
      throw new CodexBridgeError('INVALID_ARGUMENT', 'RPC errors require an integer code and a message');
    }
    return this._respond(id, { error: { code: error.code, message: error.message,
      ...(error.data === undefined ? {} : { data: error.data }) } });
  }

  async _respond(id, body) {
    const session = this._session;
    if (!session || session.closed || session.stopRequested) throw new CodexBridgeError('NOT_READY', 'Codex is not connected');
    if (!isId(id) || !session.serverRequests.has(id)) {
      throw new CodexBridgeError('UNKNOWN_REQUEST', 'This Codex approval or request is no longer pending');
    }
    if (hasOwn(body, 'result') && body.result === undefined) body = { result: null };
    const encoded = this._encode({ id, ...body });
    session.serverRequests.delete(id);
    await this._writeEncoded(session, encoded);
  }

  _encode(message) {
    let encoded;
    try { encoded = JSON.stringify(message) + '\n'; }
    catch { throw new CodexBridgeError('INVALID_MESSAGE', 'The Codex message cannot be serialized as JSON'); }
    if (Buffer.byteLength(encoded) > this.options.maxLineBytes) {
      throw new CodexBridgeError('MESSAGE_TOO_LARGE', 'The Codex message exceeds the transport size limit');
    }
    return encoded;
  }

  async _write(session, message) { return this._writeEncoded(session, this._encode(message)); }

  _writeEncoded(session, encoded) {
    return new Promise((resolve, reject) => {
      const stream = session.child.stdin;
      if (session.closed || stream.destroyed || stream.writableEnded) {
        reject(new CodexBridgeError('PROCESS_EXITED', 'Codex is no longer running')); return;
      }
      if (stream.writableLength + Buffer.byteLength(encoded) > this.options.maxBufferedWriteBytes) {
        reject(new CodexBridgeError('WRITE_BUFFER_FULL', 'Codex is receiving messages too slowly')); return;
      }
      try {
        stream.write(encoded, 'utf8', (error) => error
          ? reject(new CodexBridgeError('WRITE_FAILED', error.message)) : resolve());
      } catch (error) { reject(new CodexBridgeError('WRITE_FAILED', error.message)); }
    });
  }

  _readStdout(session, input) {
    if (session.closed || session.fault || session.stopRequested) return;
    const chunk = Buffer.isBuffer(input) ? input : Buffer.from(input);
    let offset = 0;
    while (offset < chunk.length && !session.fault) {
      const newline = chunk.indexOf(10, offset);
      const end = newline === -1 ? chunk.length : newline;
      const part = chunk.subarray(offset, end);
      session.bufferedBytes += part.length;
      if (session.bufferedBytes > this.options.maxLineBytes) {
        this._abortSession(session, new CodexBridgeError('MESSAGE_TOO_LARGE', 'Codex sent a message larger than the transport limit')); return;
      }
      if (part.length) session.fragments.push(part);
      if (session.fragments.length > 128) {
        session.fragments = [Buffer.concat(session.fragments, session.bufferedBytes)];
      }
      if (newline === -1) return;
      const line = Buffer.concat(session.fragments, session.bufferedBytes);
      session.fragments = []; session.bufferedBytes = 0;
      this._parseLine(session, line);
      offset = newline + 1;
    }
  }

  _parseLine(session, buffer) {
    const text = buffer.toString('utf8').trim();
    if (!text) return;
    let message;
    try { message = JSON.parse(text); }
    catch { this._abortSession(session, new CodexBridgeError('INVALID_JSON', 'Codex sent an invalid JSON message')); return; }
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      this._abortSession(session, new CodexBridgeError('INVALID_MESSAGE', 'Codex sent an invalid protocol message')); return;
    }
    const withId = hasOwn(message, 'id');
    if (withId && !isId(message.id)) {
      this._abortSession(session, new CodexBridgeError('INVALID_MESSAGE', 'Codex sent an invalid request ID')); return;
    }
    if (typeof message.method === 'string') {
      if (!withId) {
        if (message.method === 'serverRequest/resolved' &&
          message.params && hasOwn(message.params, 'requestId')) {
          session.serverRequests.delete(message.params.requestId);
        }
        this.emit('notification', { method: message.method, params: message.params });
        return;
      }
      if (session.serverRequests.has(message.id)) {
        this._abortSession(session, new CodexBridgeError('DUPLICATE_REQUEST', 'Codex reused a pending server request ID')); return;
      }
      if (session.serverRequests.size >= this.options.maxServerRequests) {
        this._abortSession(session, new CodexBridgeError('TOO_MANY_SERVER_REQUESTS', 'Too many Codex approvals are pending')); return;
      }
      session.serverRequests.set(message.id, { method: message.method });
      if (this.listenerCount('serverRequest') === 0) {
        this.respondError(message.id, { code: -32601, message: 'This client has no handler for server requests' })
          .catch((error) => this._abortSession(session, error));
      } else this.emit('serverRequest', { id: message.id, method: message.method, params: message.params });
      return;
    }
    if (!withId || hasOwn(message, 'result') === hasOwn(message, 'error')) {
      this._abortSession(session, new CodexBridgeError('INVALID_MESSAGE', 'Codex sent an invalid RPC response')); return;
    }
    const pending = session.pending.get(message.id);
    if (!pending) {
      this.emit('diagnostic', { code: 'UNMATCHED_RESPONSE', message: 'Ignored a late or unknown Codex response' }); return;
    }
    session.pending.delete(message.id); clearTimeout(pending.timer);
    if (hasOwn(message, 'error')) {
      const remote = message.error;
      pending.reject(new CodexBridgeError(remote?.code ?? 'RPC_ERROR',
        typeof remote?.message === 'string' ? remote.message : 'Codex reported a request error', remote?.data));
    } else pending.resolve(message.result);
  }

  _rejectPending(session, error) {
    for (const pending of session.pending.values()) {
      clearTimeout(pending.timer); pending.reject(error);
    }
    session.pending.clear(); session.serverRequests.clear();
  }

  _abortSession(session, error) {
    if (session.closed || session.fault || session.stopRequested) return;
    session.fault = error;
    this._rejectPending(session, error);
    if (this._session === session) this._setStatus('error', { error: { code: error.code, message: error.message } });
    this._terminateSession(session).catch((terminationError) => this.emit('diagnostic', {
      code: 'STOP_FAILED', message: terminationError.message,
    }));
  }

  _onClose(session, code, signal) {
    if (session.closed) return;
    session.closed = true;
    const error = session.fault || new CodexBridgeError(session.stopRequested ? 'STOPPED' : 'PROCESS_EXITED',
      session.stopRequested ? 'Codex was stopped' : `Codex exited unexpectedly (${signal || (code ?? 'unknown')})`);
    this._rejectPending(session, error);
    session.fragments = []; session.bufferedBytes = 0;
    session.resolveExit({ code, signal });
    if (this._session === session) {
      this._session = null;
      this._setStatus(session.stopRequested ? 'stopped' : 'error', {
        pid: null, error: session.stopRequested ? null : { code: error.code, message: error.message },
      });
      this.emit('exit', { code, signal });
    }
  }

  async _waitForExit(session, timeoutMs) {
    if (session.closed) return true;
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); });
    const exited = await Promise.race([session.exitPromise.then(() => true), timeout]);
    clearTimeout(timer);
    return exited;
  }

  async _killProcessTree(session, force) {
    const pid = session.child.pid;
    if (!pid || session.closed) return;
    if (process.platform === 'win32') {
      const systemRoot = envValue(process.env, 'SystemRoot') || 'C:\\Windows';
      await new Promise((resolve) => {
        const killer = spawn(path.win32.join(systemRoot, 'System32', 'taskkill.exe'),
          ['/pid', String(pid), '/t', '/f'], { shell: false, windowsHide: true, stdio: 'ignore' });
        let settled = false;
        const finish = () => {
          if (settled) return; settled = true; clearTimeout(timer); resolve();
        };
        const timer = setTimeout(() => { killer.kill(); finish(); }, this.options.killTimeoutMs);
        killer.once('error', () => { try { session.child.kill(); } catch { /* Already exited. */ } finish(); });
        killer.once('close', finish);
      });
    } else {
      try { process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM'); }
      catch { try { session.child.kill(force ? 'SIGKILL' : 'SIGTERM'); } catch { /* Already exited. */ } }
    }
  }

  _terminateSession(session) {
    if (session.terminatePromise) return session.terminatePromise;
    session.terminatePromise = (async () => {
      if (session.closed) return;
      try { session.child.stdin.end(); } catch { /* It may have closed already. */ }
      if (await this._waitForExit(session, this.options.stopTimeoutMs)) return;
      await this._killProcessTree(session, false);
      if (await this._waitForExit(session, this.options.killTimeoutMs)) return;
      await this._killProcessTree(session, true);
      if (await this._waitForExit(session, this.options.killTimeoutMs)) return;
      throw new CodexBridgeError('STOP_FAILED', 'Codex did not exit after termination was requested');
    })();
    return session.terminatePromise;
  }

  stop() {
    if (this._stopPromise) return this._stopPromise;
    ++this._generation;
    const session = this._session;
    if (session) {
      session.stopRequested = true;
      this._rejectPending(session, new CodexBridgeError('STOPPED', 'Codex was stopped'));
    }
    this._setStatus('stopping');
    const promise = (async () => {
      try {
        if (session) await this._terminateSession(session);
        if (this._startPromise) await this._startPromise.catch(() => {});
        this._setStatus('stopped', { pid: null, error: null });
        return this.status;
      } catch (error) {
        this._setStatus('error', { error: { code: error.code || 'STOP_FAILED', message: error.message } });
        throw error;
      }
    })();
    this._stopPromise = promise;
    const clear = () => { if (this._stopPromise === promise) this._stopPromise = null; };
    promise.then(clear, clear);
    return promise;
  }
}

module.exports = { CodexBridge, CodexBridgeError, resolveCodexExecutable,
  _testing: { buildSpawnSpec } };
