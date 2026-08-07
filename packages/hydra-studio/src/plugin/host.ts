/**
 * Kontrakt edytora, do którego podłącza się ta wtyczka.
 *
 * Deklaracje odwzorowują `IPluginAPI` z pakietu `@mhersztowski/texteditor`.
 * Powtarzamy je tutaj strukturalnie, zamiast importować, z jednego powodu:
 * pakiet Studia jest budowany w innym repozytorium niż edytor i nie może
 * wymagać jego obecności, żeby się skompilować. TypeScript sprawdza zgodność
 * po kształcie, więc podstawienie prawdziwego API zadziała bez rzutowania —
 * ale jeśli kontrakt po tamtej stronie się zmieni, dowiemy się dopiero przy
 * integracji. Stąd komplet w jednym pliku: łatwo porównać.
 */

import type { ComponentType } from 'react';

export interface IDisposable {
    dispose(): void;
}

export interface HostEditorApi {
    onDidOpenDocument(cb: (uri: string, text: string) => void): IDisposable;
    onDidChangeModel(cb: (uri: string) => void): IDisposable;
    onDidChangeContent(cb: (text: string) => void): IDisposable;
    onDidSaveDocument(cb: (uri: string) => void): IDisposable;
}

export interface HostCommandsApi {
    register(id: string, handler: (...args: unknown[]) => unknown): IDisposable;
    execute(id: string, ...args: unknown[]): Promise<unknown>;
}

export interface StatusBarHandle extends IDisposable {
    update(patch: Partial<{ text: string; tooltip: string; color: string }>): void;
}

export interface HostUiApi {
    toolbar: { register(item: {
        id: string; label: string; icon: string; command: string;
        group?: string; order?: number;
    }): IDisposable };
    statusbar: { register(item: {
        id: string; text: string; alignment: 'left' | 'right';
        tooltip?: string; priority?: number; command?: string;
    }): StatusBarHandle };
    commandpalette: { register(item: {
        command: string; title: string; category?: string;
    }): IDisposable };
    sidebar: { register(panel: {
        id: string; title: string; icon: string; component: ComponentType; order?: number;
    }): IDisposable };
    openSidebarPanel(panelId: string): void;
}

export interface HostLoggerApi {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
}

export interface HostApi {
    readonly pluginId: string;
    readonly editor: HostEditorApi;
    readonly commands: HostCommandsApi;
    readonly ui: HostUiApi;
    readonly logger: HostLoggerApi;
    openEditorTab(opts: {
        uri: string; title: string; component: ComponentType; toSide?: boolean;
    }): void;
}

export interface HostPluginManifest {
    id: string;
    name: string;
    version: string;
    description?: string;
    contributes: ('toolbar' | 'statusbar' | 'contextmenu' | 'commandpalette' | 'sidebar')[];
}

export interface HostPlugin {
    readonly manifest: HostPluginManifest;
    activate(api: HostApi): void | Promise<void>;
    deactivate?(): void | Promise<void>;
}

/**
 * Dostęp do plików projektu.
 *
 * Edytor przekazuje go przy tworzeniu wtyczki — tak samo jak robią to wtyczki
 * języków w tamtym repozytorium. Wtyczka nie sięga do systemu plików sama, bo
 * w przeglądarce żadnego nie ma.
 */
export interface FileProvider {
    readFile(path: string): Promise<string | Uint8Array>;
    writeFile?(path: string, content: string | Uint8Array,
               options?: { create?: boolean; overwrite?: boolean }): Promise<void>;
}
