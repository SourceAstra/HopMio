const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yaha', {
  desktop: true,
  call: (method, params) => ipcRenderer.invoke('yaha:call', method, params),
  save: (id) => ipcRenderer.invoke('yaha:save', id),
  openStudio: (id) => ipcRenderer.invoke('yaha:open-studio', id),
});
