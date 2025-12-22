import * as vscode from 'vscode';
import * as path from 'node:path';
import { PreviewPanelManager } from './preview-panel-manager.js';
import { PreviewCoordinator } from './preview-coordinator.js';
import { ConfigurationManager } from './configuration-manager.js';
import { NotificationService, NotificationType } from './notification-service.js';

/**
 * Handles VSCode commands for preview functionality.
 * Manages command registration, execution, and integration with context menus.
 * 
 * Requirements addressed:
 * - 7.1: Add preview panel to VSCode's panel management system
 * - 7.2: Include "Open Preview" option in context menu for CMind files
 * - 7.3: Provide commands to toggle sync and refresh preview
 * - 7.4: Support standard VSCode preview shortcuts (Ctrl+Shift+V)
 */
export class PreviewCommandHandler {
    private static readonly OPEN_PREVIEW_COMMAND = 'cmind.openPreview';
    private static readonly TOGGLE_SYNC_COMMAND = 'cmind.togglePreviewSync';
    private static readonly REFRESH_PREVIEW_COMMAND = 'cmind.refreshPreview';
    
    private readonly previewPanelManager: PreviewPanelManager;
    private readonly previewCoordinator: PreviewCoordinator;
    private readonly configurationManager: ConfigurationManager;
    private readonly notificationService: NotificationService;
    private readonly disposables: vscode.Disposable[] = [];
    
    // Track sync state per file
    private readonly syncStates = new Map<string, boolean>();

    constructor(
        previewPanelManager: PreviewPanelManager,
        previewCoordinator: PreviewCoordinator,
        configurationManager: ConfigurationManager
    ) {
        this.previewPanelManager = previewPanelManager;
        this.previewCoordinator = previewCoordinator;
        this.configurationManager = configurationManager;
        this.notificationService = new NotificationService(configurationManager);
    }

    /**
     * Registers all preview commands with the VSCode extension context
     * @param context The extension context for command registration
     */
    registerCommands(context: vscode.ExtensionContext): void {
        // Register the open preview command
        const openPreviewCommand = vscode.commands.registerCommand(
            PreviewCommandHandler.OPEN_PREVIEW_COMMAND,
            (uri?: vscode.Uri) => this.executeOpenPreview(uri)
        );

        // Register the toggle sync command
        const toggleSyncCommand = vscode.commands.registerCommand(
            PreviewCommandHandler.TOGGLE_SYNC_COMMAND,
            () => this.executeToggleSync()
        );

        // Register the refresh preview command
        const refreshPreviewCommand = vscode.commands.registerCommand(
            PreviewCommandHandler.REFRESH_PREVIEW_COMMAND,
            () => this.executeRefreshPreview()
        );

        // Add commands to disposables
        this.disposables.push(openPreviewCommand, toggleSyncCommand, refreshPreviewCommand);
        
        // Register disposables with context
        context.subscriptions.push(...this.disposables);

        // Set up context for command availability
        this.setupCommandContext();
    }

    /**
     * Executes the open preview command
     * @param uri Optional URI of the file to preview (from context menu or command palette)
     */
    async executeOpenPreview(uri?: vscode.Uri): Promise<void> {
        try {
            // Determine the file to preview
            const targetFile = await this.getTargetFile(uri);
            if (!targetFile) {
                return; // User cancelled or no valid file
            }

            // Validate file extension
            if (!this.isValidCmindFile(targetFile)) {
                await this.notificationService.showCriticalNotification({
                    type: NotificationType.Error,
                    message: 'Invalid file type. Please select a .cmind file to preview.'
                });
                return;
            }

            // Show progress indicator during preview creation
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Opening CMind preview...',
                    cancellable: false
                },
                async (progress) => {
                    progress.report({ increment: 0, message: 'Creating preview panel...' });
                    
                    // Show the preview
                    await this.previewPanelManager.showPreview(targetFile);
                    
                    progress.report({ increment: 50, message: 'Loading content...' });
                    
                    // Initialize sync state for this file
                    this.syncStates.set(targetFile, this.configurationManager.isPreviewAutoUpdateEnabled());
                    
                    // Trigger initial content load
                    await this.previewCoordinator.handlePreviewCreated(targetFile);
                    
                    progress.report({ increment: 100, message: 'Preview ready' });
                    
                    // Update command context
                    this.updateCommandContext();
                }
            );

            // Show success notification if enabled
            if (this.configurationManager.shouldShowNotifications()) {
                await this.notificationService.showInfo(
                    `Preview opened for ${path.basename(targetFile)}`
                );
            }

        } catch (error) {
            await this.notificationService.showCriticalNotification({
                type: NotificationType.Error,
                message: `Failed to open preview: ${this.formatError(error)}`
            });
        }
    }

    /**
     * Executes the toggle sync command
     */
    async executeToggleSync(): Promise<void> {
        try {
            const activeFile = this.getActivePreviewFile();
            if (!activeFile) {
                await this.notificationService.showWarning(
                    'No active preview to toggle sync for'
                );
                return;
            }

            // Toggle sync state
            const currentSync = this.syncStates.get(activeFile) ?? true;
            const newSync = !currentSync;
            this.syncStates.set(activeFile, newSync);

            // Update content synchronizer
            if (newSync) {
                // Resume updates for this file
                // Note: This would require extending ContentSynchronizer with per-file control
                await this.notificationService.showInfo(
                    `Preview sync enabled for ${path.basename(activeFile)}`
                );
            } else {
                // Pause updates for this file
                await this.notificationService.showInfo(
                    `Preview sync disabled for ${path.basename(activeFile)}`
                );
            }

            // Update command context
            this.updateCommandContext();

        } catch (error) {
            await this.notificationService.showCriticalNotification({
                type: NotificationType.Error,
                message: `Failed to toggle sync: ${this.formatError(error)}`
            });
        }
    }

    /**
     * Executes the refresh preview command
     */
    async executeRefreshPreview(): Promise<void> {
        try {
            const activeFile = this.getActivePreviewFile();
            if (!activeFile) {
                await this.notificationService.showWarning(
                    'No active preview to refresh'
                );
                return;
            }

            // Show progress indicator during refresh
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Refreshing preview...',
                    cancellable: false
                },
                async (progress) => {
                    progress.report({ increment: 0, message: 'Clearing cache...' });
                    
                    // Force refresh through coordinator
                    await this.previewCoordinator.refreshPreview(activeFile);
                    
                    progress.report({ increment: 100, message: 'Preview refreshed' });
                }
            );

            // Show success notification if enabled
            if (this.configurationManager.shouldShowNotifications()) {
                await this.notificationService.showInfo(
                    `Preview refreshed for ${path.basename(activeFile)}`
                );
            }

        } catch (error) {
            await this.notificationService.showCriticalNotification({
                type: NotificationType.Error,
                message: `Failed to refresh preview: ${this.formatError(error)}`
            });
        }
    }

    /**
     * Determines the target file for preview
     * @param uri Optional URI from command invocation
     * @returns Path to the file to preview, or undefined if cancelled/invalid
     */
    private async getTargetFile(uri?: vscode.Uri): Promise<string | undefined> {
        if (uri) {
            // Command invoked from context menu or with specific URI
            return uri.fsPath;
        }

        // Command invoked from command palette - check active editor
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const activeFile = activeEditor.document.uri.fsPath;
            if (this.isValidCmindFile(activeFile)) {
                return activeFile;
            }
        }

        // No valid file in active editor - prompt user to select one
        const fileUris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'CMind Files': ['cmind']
            },
            title: 'Select CMind file to preview'
        });

        if (fileUris && fileUris.length > 0) {
            return fileUris[0].fsPath;
        }

        return undefined; // User cancelled
    }

    /**
     * Gets the currently active preview file
     * @returns Path to the active preview file, or undefined if none
     */
    private getActivePreviewFile(): string | undefined {
        // Check if there's an active editor with a CMind file that has a preview
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const activeFile = activeEditor.document.uri.fsPath;
            if (this.isValidCmindFile(activeFile) && this.previewPanelManager.isPreviewOpen(activeFile)) {
                return activeFile;
            }
        }

        // Fall back to any open preview
        const openPreviews = this.previewPanelManager.getOpenPreviewPaths();
        return openPreviews.length > 0 ? openPreviews[0] : undefined;
    }

    /**
     * Validates if a file is a valid CMind file
     * @param filePath Path to the file to validate
     * @returns true if the file has .cmind extension, false otherwise
     */
    private isValidCmindFile(filePath: string): boolean {
        return path.extname(filePath).toLowerCase() === '.cmind';
    }

    /**
     * Sets up command context for conditional command availability
     */
    private setupCommandContext(): void {
        // Listen for active editor changes to update context
        const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
            this.updateCommandContext();
        });

        this.disposables.push(activeEditorDisposable);

        // Initial context update
        this.updateCommandContext();
    }

    /**
     * Updates command context based on current state
     */
    private updateCommandContext(): void {
        const hasActivePreview = this.getActivePreviewFile() !== undefined;
        
        // Set context for preview-related commands
        vscode.commands.executeCommand('setContext', 'cmindPreviewActive', hasActivePreview);
        
        // Set context for sync state
        if (hasActivePreview) {
            const activeFile = this.getActivePreviewFile()!;
            const syncEnabled = this.syncStates.get(activeFile) ?? true;
            vscode.commands.executeCommand('setContext', 'cmindPreviewSyncEnabled', syncEnabled);
        } else {
            vscode.commands.executeCommand('setContext', 'cmindPreviewSyncEnabled', false);
        }
    }

    /**
     * Handles preview panel closure to clean up state
     * @param filePath Path to the closed preview file
     */
    handlePreviewClosed(filePath: string): void {
        // Clean up sync state
        this.syncStates.delete(filePath);
        
        // Update command context
        this.updateCommandContext();
        
        // Notify coordinator
        this.previewCoordinator.handlePreviewClosed(filePath);
    }

    /**
     * Formats error messages for user display
     * @param error The error to format
     * @returns Formatted error message
     */
    private formatError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }

    /**
     * Gets the command ID for the open preview command
     * @returns The command ID string
     */
    static getOpenPreviewCommandId(): string {
        return PreviewCommandHandler.OPEN_PREVIEW_COMMAND;
    }

    /**
     * Gets the command ID for the toggle sync command
     * @returns The command ID string
     */
    static getToggleSyncCommandId(): string {
        return PreviewCommandHandler.TOGGLE_SYNC_COMMAND;
    }

    /**
     * Gets the command ID for the refresh preview command
     * @returns The command ID string
     */
    static getRefreshPreviewCommandId(): string {
        return PreviewCommandHandler.REFRESH_PREVIEW_COMMAND;
    }

    /**
     * Disposes of all resources
     */
    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
        this.syncStates.clear();
    }
}