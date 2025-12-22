import * as vscode from 'vscode';
import { MemoryCacheService } from './memory-cache-service.js';

/**
 * Interface for content change events
 */
export interface ContentChangeEvent {
    filePath: string;
    content: string;
    contentHash: string;
    timestamp: Date;
}

/**
 * Interface for content synchronizer configuration
 */
export interface ContentSynchronizerConfig {
    updateDelay: number;
    autoUpdate: boolean;
}

/**
 * Content synchronizer that manages real-time updates between editor and preview
 * 
 * Handles:
 * - Document change events with debouncing
 * - Editor focus changes and file switching
 * - Update pausing/resuming based on preview visibility
 * - Integration with memory cache for content hashing
 * 
 * Requirements addressed:
 * - 2.1: Real-time updates within 500ms
 * - 2.3: Updates when switching between files
 * - 2.4: Background updates when preview loses focus
 * - 6.2: Debouncing to prevent excessive re-rendering
 */
export class ContentSynchronizer {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly updateTimers = new Map<string, NodeJS.Timeout>();
    private readonly pausedFiles = new Set<string>();
    private readonly activeFiles = new Set<string>();
    
    private config: ContentSynchronizerConfig;
    private onContentChangedCallback?: (event: ContentChangeEvent) => Promise<void>;
    
    /**
     * Creates a new ContentSynchronizer instance
     * @param config Configuration for update behavior
     */
    constructor(config?: Partial<ContentSynchronizerConfig>) {
        this.config = {
            updateDelay: config?.updateDelay ?? 500,
            autoUpdate: config?.autoUpdate ?? true
        };
    }

    /**
     * Starts watching for content changes and editor events
     * 
     * @param context VSCode extension context for managing disposables
     */
    startWatching(context: vscode.ExtensionContext): void {
        // Listen to document changes
        const documentChangeDisposable = vscode.workspace.onDidChangeTextDocument(
            this.handleDocumentChange.bind(this)
        );
        this.disposables.push(documentChangeDisposable);
        context.subscriptions.push(documentChangeDisposable);

        // Listen to active editor changes (file switching)
        const activeEditorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(
            this.handleActiveEditorChange.bind(this)
        );
        this.disposables.push(activeEditorChangeDisposable);
        context.subscriptions.push(activeEditorChangeDisposable);

        // Listen to visible editors changes (for multi-editor scenarios)
        const visibleEditorsChangeDisposable = vscode.window.onDidChangeVisibleTextEditors(
            this.handleVisibleEditorsChange.bind(this)
        );
        this.disposables.push(visibleEditorsChangeDisposable);
        context.subscriptions.push(visibleEditorsChangeDisposable);

        // Listen to document close events
        const documentCloseDisposable = vscode.workspace.onDidCloseTextDocument(
            this.handleDocumentClose.bind(this)
        );
        this.disposables.push(documentCloseDisposable);
        context.subscriptions.push(documentCloseDisposable);

        // Initialize with currently active editor if it's a CMind file
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && this.isCMindFile(activeEditor.document)) {
            this.activeFiles.add(activeEditor.document.uri.fsPath);
        }
    }

    /**
     * Sets the callback function to be called when content changes
     * 
     * @param callback Function to handle content change events
     */
    onContentChanged(callback: (event: ContentChangeEvent) => Promise<void>): void {
        this.onContentChangedCallback = callback;
    }

    /**
     * Debounces update for a specific file
     * 
     * @param filePath Path to the file
     * @param content Current file content
     */
    debounceUpdate(filePath: string, content: string): void {
        // Clear existing timer for this file
        const existingTimer = this.updateTimers.get(filePath);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Set new timer with configured delay
        const timer = setTimeout(async () => {
            this.updateTimers.delete(filePath);
            
            // Skip update if file is paused or auto-update is disabled
            if (this.pausedFiles.has(filePath) || !this.config.autoUpdate) {
                return;
            }

            // Generate content hash and trigger update
            const contentHash = MemoryCacheService.generateContentHash(content);
            const event: ContentChangeEvent = {
                filePath,
                content,
                contentHash,
                timestamp: new Date()
            };

            if (this.onContentChangedCallback) {
                try {
                    await this.onContentChangedCallback(event);
                } catch (error) {
                    console.error(`Error processing content change for ${filePath}:`, error);
                }
            }
        }, this.config.updateDelay);

        this.updateTimers.set(filePath, timer);
    }

    /**
     * Pauses updates for a specific file
     * 
     * @param filePath Path to the file to pause updates for
     */
    pauseUpdates(filePath: string): void {
        this.pausedFiles.add(filePath);
        
        // Clear any pending timer for this file
        const timer = this.updateTimers.get(filePath);
        if (timer) {
            clearTimeout(timer);
            this.updateTimers.delete(filePath);
        }
    }

    /**
     * Resumes updates for a specific file
     * 
     * @param filePath Path to the file to resume updates for
     */
    resumeUpdates(filePath: string): void {
        this.pausedFiles.delete(filePath);
        
        // Trigger immediate update if file is currently active
        if (this.activeFiles.has(filePath)) {
            const editor = this.findEditorForFile(filePath);
            if (editor) {
                this.debounceUpdate(filePath, editor.document.getText());
            }
        }
    }

    /**
     * Updates configuration settings
     * 
     * @param newConfig New configuration values
     */
    updateConfiguration(newConfig: Partial<ContentSynchronizerConfig>): void {
        this.config = {
            ...this.config,
            ...newConfig
        };
    }

    /**
     * Gets the current configuration
     * 
     * @returns Current configuration object
     */
    getConfiguration(): ContentSynchronizerConfig {
        return { ...this.config };
    }

    /**
     * Checks if updates are paused for a specific file
     * 
     * @param filePath Path to check
     * @returns True if updates are paused for the file
     */
    isUpdatesPaused(filePath: string): boolean {
        return this.pausedFiles.has(filePath);
    }

    /**
     * Gets the set of currently active files
     * 
     * @returns Set of active file paths
     */
    getActiveFiles(): Set<string> {
        return new Set(this.activeFiles);
    }

    /**
     * Disposes of all event listeners and clears timers
     */
    dispose(): void {
        console.log('ContentSynchronizer: Starting disposal process');
        
        try {
            // Clear all pending timers
            console.log(`ContentSynchronizer: Clearing ${this.updateTimers.size} pending timers`);
            for (const [filePath, timer] of this.updateTimers.entries()) {
                try {
                    clearTimeout(timer);
                } catch (error) {
                    console.error(`Error clearing timer for ${filePath}:`, error);
                }
            }
            this.updateTimers.clear();

            // Dispose of all event listeners
            console.log(`ContentSynchronizer: Disposing ${this.disposables.length} event listeners`);
            for (const disposable of this.disposables) {
                try {
                    disposable.dispose();
                } catch (error) {
                    console.error('Error disposing event listener:', error);
                }
            }
            this.disposables.length = 0;

            // Clear state collections
            console.log(`ContentSynchronizer: Clearing state for ${this.pausedFiles.size} paused files and ${this.activeFiles.size} active files`);
            this.pausedFiles.clear();
            this.activeFiles.clear();
            
            // Clear callback reference
            this.onContentChangedCallback = undefined;
            
            console.log('ContentSynchronizer: Disposal completed successfully');
            
        } catch (error) {
            console.error('Error during ContentSynchronizer disposal:', error);
        }
    }

    /**
     * Handles document change events
     * 
     * @param event VSCode document change event
     */
    private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
        const document = event.document;
        
        // Only process CMind files
        if (!this.isCMindFile(document)) {
            return;
        }

        const filePath = document.uri.fsPath;
        
        // Add to active files if not already tracked
        this.activeFiles.add(filePath);
        
        // Debounce the update
        this.debounceUpdate(filePath, document.getText());
    }

    /**
     * Handles active editor change events (file switching)
     * 
     * @param editor New active text editor
     */
    private handleActiveEditorChange(editor: vscode.TextEditor | undefined): void {
        if (!editor || !this.isCMindFile(editor.document)) {
            return;
        }

        const filePath = editor.document.uri.fsPath;
        
        // Add to active files
        this.activeFiles.add(filePath);
        
        // Trigger immediate update for the newly active file
        // This ensures the preview switches to show the active file's content
        this.debounceUpdate(filePath, editor.document.getText());
    }

    /**
     * Handles visible editors change events
     * 
     * @param editors Array of visible text editors
     */
    private handleVisibleEditorsChange(editors: readonly vscode.TextEditor[]): void {
        // Update active files set based on visible editors
        const newActiveFiles = new Set<string>();
        
        for (const editor of editors) {
            if (this.isCMindFile(editor.document)) {
                newActiveFiles.add(editor.document.uri.fsPath);
            }
        }
        
        // Remove files that are no longer visible
        for (const filePath of this.activeFiles) {
            if (!newActiveFiles.has(filePath)) {
                this.activeFiles.delete(filePath);
                
                // Clear any pending timer for files that are no longer visible
                const timer = this.updateTimers.get(filePath);
                if (timer) {
                    clearTimeout(timer);
                    this.updateTimers.delete(filePath);
                }
            }
        }
        
        // Add newly visible files
        for (const filePath of newActiveFiles) {
            this.activeFiles.add(filePath);
        }
    }

    /**
     * Handles document close events
     * 
     * @param document Closed text document
     */
    private handleDocumentClose(document: vscode.TextDocument): void {
        if (!this.isCMindFile(document)) {
            return;
        }

        const filePath = document.uri.fsPath;
        
        // Remove from active files
        this.activeFiles.delete(filePath);
        
        // Remove from paused files
        this.pausedFiles.delete(filePath);
        
        // Clear any pending timer
        const timer = this.updateTimers.get(filePath);
        if (timer) {
            clearTimeout(timer);
            this.updateTimers.delete(filePath);
        }
    }

    /**
     * Checks if a document is a CMind file
     * 
     * @param document VSCode text document
     * @returns True if the document is a CMind file
     */
    private isCMindFile(document: vscode.TextDocument): boolean {
        return document.languageId === 'cmind' || document.fileName.endsWith('.cmind');
    }

    /**
     * Finds the text editor for a specific file path
     * 
     * @param filePath Path to find editor for
     * @returns Text editor if found, undefined otherwise
     */
    private findEditorForFile(filePath: string): vscode.TextEditor | undefined {
        return vscode.window.visibleTextEditors.find(
            editor => editor.document.uri.fsPath === filePath
        );
    }
}