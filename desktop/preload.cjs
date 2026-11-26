"use strict";

/* eslint-disable @typescript-eslint/no-require-imports */

const { contextBridge, ipcRenderer } = require("electron");

const DOCUMENT_CHANNELS = Object.freeze({
  getState: "stoa:documents:state:get",
  rendererReady: "stoa:documents:renderer-ready",
  setActiveWorkspace: "stoa:documents:active-workspace:set",
  updateWorkspaceState: "stoa:documents:workspace-state:update",
  newDocument: "stoa:documents:new",
  openDocument: "stoa:documents:open",
  openRecent: "stoa:documents:open-recent",
  saveDocument: "stoa:documents:save",
  closeDocument: "stoa:documents:close",
  getRecentFiles: "stoa:documents:recent:get",
  clearRecentFiles: "stoa:documents:recent:clear",
  command: "stoa:documents:command",
  commandResult: "stoa:documents:command-result",
  serializeRequest: "stoa:documents:serialize-request",
  serializeResult: "stoa:documents:serialize-result",
  stateChanged: "stoa:documents:state-changed",
});

function exposeEvent(channel, listener) {
  if (typeof listener !== "function") {
    throw new TypeError("STOA desktop event listeners must be functions.");
  }
  const wrapped = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

function exposeRequestHandler(requestChannel, responseChannel, handler) {
  if (typeof handler !== "function") {
    throw new TypeError("STOA desktop request handlers must be functions.");
  }
  const wrapped = async (_event, request) => {
    const requestId = request?.id;
    if (typeof requestId !== "string") return;
    try {
      const result = await handler(request);
      ipcRenderer.send(responseChannel, requestId, result ?? { ok: true });
    } catch (error) {
      ipcRenderer.send(responseChannel, requestId, {
        ok: false,
        error: error instanceof Error ? error.message : "The desktop operation failed.",
      });
    }
  };
  ipcRenderer.on(requestChannel, wrapped);
  return () => ipcRenderer.removeListener(requestChannel, wrapped);
}

const documentBridge = Object.freeze({
  getState() {
    return ipcRenderer.invoke(DOCUMENT_CHANNELS.getState);
  },
  rendererReady() {
    return ipcRenderer.invoke(DOCUMENT_CHANNELS.rendererReady);
  },
  setActiveWorkspace(workspace) {
    return ipcRenderer.invoke(DOCUMENT_CHANNELS.setActiveWorkspace, workspace);
  },
  updateWorkspaceState(state) {
    return ipcRenderer.invoke(DOCUMENT_CHANNELS.updateWorkspaceState, state);
  },
  newDocument(workspace, kind = "blank") {
    return ipcRenderer.invoke(DOCUMENT_CHANNELS.newDocument, workspace, kind);
  },
  openDocument() {
    return ipcRenderer.invoke(DOCUMENT_CHANNELS.openDocument);
  },
  openRecent(filePath) {
    return ipcRenderer.invoke(DOCUMENT_CHANNELS.openRecent, filePath);
  },
  saveDocument(workspace, saveAs = false) {
    return ipcRenderer.invoke(DOCUMENT_CHANNELS.saveDocument, workspace, saveAs);
  },
  closeDocument(workspace) {
    return ipcRenderer.invoke(DOCUMENT_CHANNELS.closeDocument, workspace);
  },
  getRecentFiles() {
    return ipcRenderer.invoke(DOCUMENT_CHANNELS.getRecentFiles);
  },
  clearRecentFiles() {
    return ipcRenderer.invoke(DOCUMENT_CHANNELS.clearRecentFiles);
  },
  onStateChanged(listener) {
    return exposeEvent(DOCUMENT_CHANNELS.stateChanged, listener);
  },
  onCommand(handler) {
    return exposeRequestHandler(
      DOCUMENT_CHANNELS.command,
      DOCUMENT_CHANNELS.commandResult,
      handler,
    );
  },
  onSerializeRequest(handler) {
    return exposeRequestHandler(
      DOCUMENT_CHANNELS.serializeRequest,
      DOCUMENT_CHANNELS.serializeResult,
      handler,
    );
  },
});

contextBridge.exposeInMainWorld("stoaDesktopDocuments", documentBridge);
