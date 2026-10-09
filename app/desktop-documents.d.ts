export {};

declare global {
  type StoaDesktopWorkspace =
    | "ancient-greek"
    | "latin"
    | "classical-chinese"
    | "omni";

  interface StoaDesktopWorkspaceState {
    workspace: StoaDesktopWorkspace;
    filePath: string | null;
    displayName: string;
    revision: string | null;
    savedRevision: string | null;
    dirty: boolean;
  }

  interface StoaDesktopRecentFile {
    filePath: string;
    displayName: string;
  }

  interface StoaDesktopDocumentState {
    runtime: "desktop";
    platform: string;
    firstLaunch: boolean;
    activeWorkspace: StoaDesktopWorkspace;
    workspaces: Record<StoaDesktopWorkspace, StoaDesktopWorkspaceState>;
    recentFiles: StoaDesktopRecentFile[];
  }

  type StoaDesktopDocumentCommand = {
    id: string;
    workspace?: StoaDesktopWorkspace;
  } & (
    | { type: "startup-first-launch" }
    | { type: "new-document"; kind: "blank" | "sample" }
    | {
        type: "open-project";
        filePath: string;
        displayName: string;
        contents: string;
      }
    | { type: "close-document" }
    | { type: "undo" }
    | { type: "redo" }
    | { type: "export-project" }
    | { type: "show-help" }
  );

  interface StoaDesktopSerializeRequest {
    id: string;
    workspace: StoaDesktopWorkspace;
  }

  interface StoaDesktopDocumentsBridge {
    getState(): Promise<StoaDesktopDocumentState>;
    rendererReady(): Promise<StoaDesktopDocumentState>;
    setActiveWorkspace(workspace: StoaDesktopWorkspace): Promise<StoaDesktopDocumentState>;
    updateWorkspaceState(state: {
      workspace: StoaDesktopWorkspace;
      revision: string;
      dirty: boolean;
      displayName?: string;
    }): Promise<StoaDesktopWorkspaceState>;
    newDocument(
      workspace?: StoaDesktopWorkspace,
      kind?: "blank" | "sample",
    ): Promise<Record<string, unknown>>;
    openDocument(): Promise<Record<string, unknown>>;
    openRecent(filePath: string): Promise<Record<string, unknown>>;
    saveDocument(
      workspace?: StoaDesktopWorkspace,
      saveAs?: boolean,
    ): Promise<Record<string, unknown>>;
    closeDocument(workspace?: StoaDesktopWorkspace): Promise<Record<string, unknown>>;
    getRecentFiles(): Promise<StoaDesktopRecentFile[]>;
    clearRecentFiles(): Promise<StoaDesktopRecentFile[]>;
    onStateChanged(
      listener: (state: StoaDesktopDocumentState) => void,
    ): () => void;
    onCommand(
      handler: (command: StoaDesktopDocumentCommand) =>
        | Record<string, unknown>
        | Promise<Record<string, unknown>>,
    ): () => void;
    onSerializeRequest(
      handler: (request: StoaDesktopSerializeRequest) =>
        | Record<string, unknown>
        | Promise<Record<string, unknown>>,
    ): () => void;
  }

  interface Window {
    stoaDesktopDocuments?: StoaDesktopDocumentsBridge;
  }
}

