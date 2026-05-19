const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectPrivateKey: () => ipcRenderer.invoke('select-private-key'),
  generateLicense: (params) => ipcRenderer.invoke('generate-license', params),
  saveLicense: (params) => ipcRenderer.invoke('save-license', params)
});