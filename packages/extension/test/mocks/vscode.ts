// Mock implementation of vscode module for testing

export const workspace = {
    getConfiguration: (section?: string) => ({
        get: <T>(key: string, defaultValue?: T): T => {
            // Return default values for configuration
            if (key === 'autoConvertOnSave') return true as T;
            if (key === 'outputDirectory') return '' as T;
            if (key === 'showNotifications') return true as T;
            return defaultValue as T;
        }
    })
};

export const window = {
    showInformationMessage: (message: string) => Promise.resolve(),
    showErrorMessage: (message: string) => Promise.resolve(),
    showWarningMessage: (message: string) => Promise.resolve()
};

export const commands = {
    registerCommand: (command: string, callback: (...args: any[]) => any) => ({
        dispose: () => {}
    })
};

export const languages = {
    registerDocumentFormattingEditProvider: () => ({ dispose: () => {} }),
    registerDocumentRangeFormattingEditProvider: () => ({ dispose: () => {} })
};

export interface ExtensionContext {
    subscriptions: any[];
    asAbsolutePath: (relativePath: string) => string;
}

export interface Uri {
    fsPath: string;
    path: string;
    scheme: string;
}

export const Uri = {
    file: (path: string): Uri => ({
        fsPath: path,
        path: path,
        scheme: 'file'
    })
};

export interface TextDocument {
    uri: Uri;
    fileName: string;
    languageId: string;
    getText: () => string;
}

export interface TextDocumentChangeEvent {
    document: TextDocument;
}

export const Disposable = {
    from: (...disposables: any[]) => ({
        dispose: () => disposables.forEach(d => d.dispose?.())
    })
};