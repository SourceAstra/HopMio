import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('yaha', {
  desktop: true,
  call: (method: string, params: unknown = {}) => ipcRenderer.invoke('yaha:call', method, params),
  save: (assetId: string) => ipcRenderer.invoke('yaha:save', assetId),
  openStudio: (assetId: string) => ipcRenderer.invoke('yaha:studio', assetId),
});
