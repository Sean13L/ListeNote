// The only bridge between the window and the operating system. The page gets
// this fixed list of functions and nothing else: no Node, no file system.

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

function on(channel, fn) {
  const wrapped = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('listenote', {
  platform: process.platform,

  loadAll: invoke('store:load'),
  saveLibrary: invoke('store:saveLibrary'),
  saveNote: invoke('store:saveNote'),
  deleteNote: invoke('store:deleteNote'),

  audioLoad: invoke('audio:load'),
  audioSave: invoke('audio:save'),
  audioDelete: invoke('audio:delete'),
  audioImport: invoke('audio:import'),
  audioFromUrl: invoke('audio:url'),
  docImport: invoke('doc:import'),
  attachPick: invoke('attach:pick'),
  attachSave: invoke('attach:save'),
  attachOpen: invoke('attach:open'),
  attachRead: invoke('attach:read'),
  lockStatus: invoke('lock:status'),
  lockSetPassword: invoke('lock:setPassword'),
  lockUnlock: invoke('lock:unlock'),
  openWindow: invoke('app:window'),
  materialsAdd: invoke('materials:add'),
  copyText: invoke('clipboard:write'),
  materialsLoad: invoke('materials:load'),
  materialsAttachPdf: invoke('materials:attachPdf'),
  materialsRemove: invoke('materials:remove'),
  syllabusRead: invoke('syllabus:read'),
  icsOpen: invoke('ics:open'),
  icsFetch: invoke('ics:fetch'),
  audioExport: invoke('audio:export'),
  recordBegin: invoke('record:begin'),
  recordAppend: invoke('record:append'),
  recordFinish: invoke('record:finish'),
  recordAbort: invoke('record:abort'),
  micAccess: invoke('mic:access'),

  exportText: invoke('export:text'),
  exportPdf: invoke('export:pdf'),

  llmDetect: invoke('llm:detect'),
  llmModels: invoke('llm:models'),
  llmAuth: invoke('llm:auth'),
  llmSignIn: invoke('llm:signin'),
  llmRun: invoke('llm:run'),
  llmCancel: invoke('llm:cancel'),
  onLlmDelta: (fn) => on('llm:delta', fn),

  transcribe: invoke('whisper:transcribe'),
  transcribeCancel: invoke('whisper:cancel'),
  onModelProgress: (fn) => on('whisper:model', fn),

  appInfo: invoke('app:info'),
  revealData: invoke('app:reveal'),
  wipeData: invoke('app:wipe'),
  setTheme: invoke('app:theme'),
  onMenu: (fn) => on('menu', fn),
});
