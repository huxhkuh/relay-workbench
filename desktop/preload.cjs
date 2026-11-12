'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (name, ...args) => ipcRenderer.invoke(`boau:${name}`, ...args);
contextBridge.exposeInMainWorld('boau', Object.freeze({
  taskList:()=>invoke('taskList'),taskStart:value=>invoke('taskStart',value),taskStop:id=>invoke('taskStop',id),taskRespond:(id,requestId,accept)=>invoke('taskRespond',id,requestId,accept),taskOpen:id=>invoke('taskOpen',id),
  workbench: Object.freeze(Object.fromEntries(['listFiles','readFile','saveFile','searchFiles','previewFile','fileContext','gitOverview','gitStage','gitCommit','createWorktree','getProjectTools','saveProjectTools','listSkills','commandStart','commandList','commandStop','openProjectTerminal','getAgentCatalog','probeAgent','addAgent','chooseAgentExecutable','removeAgent','getRuntimeInfo','listLocalModels'].map(name=>[name,(...args)=>invoke(name,...args)]))),
  getAgents: threadId => invoke('getAgents', threadId),
  selectAgent: provider => invoke('selectAgent', provider),
  prepareHandoff: value => invoke('prepareHandoff', value),
  agentLoginStatus: provider => invoke('agentLoginStatus', provider),
  reopenAgentLogin: provider => invoke('reopenAgentLogin', provider),
  submitAgentLoginCode: (provider,code) => invoke('submitAgentLoginCode', provider,code),
  loginAgent: provider => invoke('loginAgent', provider),
  getProductivity: () => invoke('getProductivity'),
  saveProductivity: value => invoke('saveProductivity', value),
  inspectProject: id => invoke('inspectProject', id),
  listRecovery: id => invoke('listRecovery', id),
  deleteRecovery: (projectId, id) => invoke('deleteRecovery', projectId, id),
  createRecovery: id => invoke('createRecovery', id),
  restoreRecovery: (projectId, id) => invoke('restoreRecovery', projectId, id),
  exportDiagnostic: () => invoke('exportDiagnostic'),
  openRecoveryFolder: () => invoke('openRecoveryFolder'),
  installLocalUpdate: () => invoke('installLocalUpdate'),
  getStatus: () => invoke('getStatus'),
  getAppInfo: () => invoke('getAppInfo'),
  connect: (options = {}) => invoke('connect', options),
  disconnect: () => invoke('disconnect'),
  request: (method, params = {}) => invoke('request', method, params),
  respond: (id, result) => invoke('respond', id, result),
  chooseFolder: () => invoke('chooseFolder'),
  getProjects: () => invoke('getProjects'),
  removeProject: id => invoke('removeProject', id),
  getSettings: () => invoke('getSettings'),
  saveSettings: settings => invoke('saveSettings', settings),
  getGitDiff: projectId => invoke('getGitDiff', projectId),
  openExternal: url => invoke('openExternal', url),
  openElicitationURL: id => invoke('openElicitationURL', id),
  onEvent: callback => {
    if (typeof callback !== 'function') throw new TypeError('A callback is required');
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('boau:event', listener);
    return () => ipcRenderer.removeListener('boau:event', listener);
  },
}));
