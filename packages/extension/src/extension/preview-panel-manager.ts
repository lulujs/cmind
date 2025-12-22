import * as vscode from 'vscode';
import * as path from 'node:path';
import { KityMinderData } from './memory-cache-service.js';
import { WebUIIntegrationService } from './webui-integration-service.js';
import { ErrorHandler, DetailedError, ErrorType } from './error-handler.js';
import { LoadingStateService, LoadingState, LoadingProgress, PlaceholderConfig } from './loading-state-service.js';

/**
 * Preview state for tracking individual file previews
 */
export interface PreviewState {
    filePath: string;
    isActive: boolean;
    lastUpdate: Date;
    contentHash: string;
    errorState?: PreviewError;
}

/**
 * Preview error information
 */
export interface PreviewError {
    message: string;
    line?: number;
    column?: number;
    type: 'syntax' | 'conversion' | 'webui' | 'memory';
    severity?: 'error' | 'warning' | 'info';
    suggestions?: string[];
}

/**
 * Preview panel configuration
 */
export interface PreviewConfiguration {
    autoUpdate: boolean;
    updateDelay: number;
    maxMemoryUsage: number;
    enableInteraction: boolean;
    theme: string;
}

/**
 * Panel lifecycle state for persistence
 */
export interface PanelLifecycleState {
    filePath: string;
    isVisible: boolean;
    viewColumn: vscode.ViewColumn;
    lastActiveTime: number;
    scrollPosition?: { x: number; y: number };
    zoomLevel?: number;
}

/**
 * Manages preview panel lifecycle and tab-based navigation for CMind files
 * 
 * Provides webview panels in VSCode's bottom panel area with tab-based navigation
 * for multiple open previews. Handles panel visibility, focus management, and
 * integrates with VSCode's panel management system.
 * 
 * Requirements addressed:
 * - 1.1: Provide "Open Preview" command for CMind files
 * - 1.2: Open preview panel in bottom panel area with dedicated tab
 * - 1.3: Display tabs for each file allowing easy switching
 * - 1.4: Switch to show file's mind map when tab is clicked
 * - 1.5: Remove corresponding tab when CMind file is closed
 * - 1.6: Hide panel automatically when all CMind files with previews are closed
 * - 1.7: Highlight corresponding tab to show current focus
 */
export class PreviewPanelManager {
    private readonly panels = new Map<string, vscode.WebviewPanel>();
    private readonly previewStates = new Map<string, PreviewState>();
    private readonly lifecycleStates = new Map<string, PanelLifecycleState>();
    private readonly disposables: vscode.Disposable[] = [];
    private activePreviewPath: string | undefined;
    private readonly configuration: PreviewConfiguration;
    private readonly context: vscode.ExtensionContext;
    private readonly webUIService: WebUIIntegrationService;
    private readonly errorHandler: ErrorHandler;
    private readonly loadingStateService: LoadingStateService;
    private isDisposed = false;
    private onVisibilityChangedCallback?: (filePath: string, isVisible: boolean) => void;

    constructor(configuration: PreviewConfiguration, context: vscode.ExtensionContext) {
        this.configuration = configuration;
        this.context = context;
        this.webUIService = new WebUIIntegrationService(context);
        this.errorHandler = new ErrorHandler();
        this.loadingStateService = new LoadingStateService();
        this.setupEventListeners();
        this.restorePanelStates();
        this.configureWebUIService();
    }

    /**
     * Creates a new preview panel for the specified file
     * 
     * @param filePath Path to the CMind file
     * @returns Promise resolving to the created webview panel
     */
    async createPreviewPanel(filePath: string): Promise<vscode.WebviewPanel> {
        // Close existing panel for this file if it exists
        if (this.panels.has(filePath)) {
            this.closePreview(filePath);
        }

        const fileName = path.basename(filePath, '.cmind');
        
        // Determine view column from saved state or default
        const savedState = this.lifecycleStates.get(filePath);
        const viewColumn = savedState?.viewColumn || vscode.ViewColumn.Beside;
        
        const panel = vscode.window.createWebviewPanel(
            'cmindPreview',
            `Preview: ${fileName}`,
            {
                viewColumn,
                preserveFocus: true
            },
            {
                enableScripts: true,
                enableForms: false,
                enableCommandUris: false,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(__dirname, '..', '..', 'webui'))
                ]
            }
        );

        // Set panel icon
        panel.iconPath = {
            light: vscode.Uri.file(path.join(__dirname, '..', '..', 'resources', 'preview-light.svg')),
            dark: vscode.Uri.file(path.join(__dirname, '..', '..', 'resources', 'preview-dark.svg'))
        };

        // Handle panel creation lifecycle
        this.handlePanelCreation(filePath, panel);

        return panel;
    }

    /**
     * Shows preview for the specified file, creating panel if necessary
     * 
     * @param filePath Path to the CMind file
     */
    async showPreview(filePath: string): Promise<void> {
        let panel = this.panels.get(filePath);
        
        if (!panel) {
            panel = await this.createPreviewPanel(filePath);
        } else {
            // Reveal existing panel
            panel.reveal(vscode.ViewColumn.Beside, true);
            this.setActivePreview(filePath);
        }

        // Update panel state
        const state = this.previewStates.get(filePath);
        if (state) {
            state.isActive = true;
            state.lastUpdate = new Date();
        }
    }

    /**
     * Updates preview content for the specified file
     * 
     * @param filePath Path to the CMind file
     * @param content KityMinder data to display or error information
     * @param contentHash Hash of the source content
     */
    async updatePreviewContent(
        filePath: string, 
        content: KityMinderData | PreviewError | DetailedError, 
        contentHash: string
    ): Promise<void> {
        const panel = this.panels.get(filePath);
        if (!panel) {
            return; // Panel doesn't exist
        }

        const state = this.previewStates.get(filePath);
        if (!state) {
            return; // State doesn't exist
        }

        // Clear loading state since we're updating with actual content
        this.clearLoadingState(filePath);

        // Update state
        state.lastUpdate = new Date();
        state.contentHash = contentHash;

        if (this.isDetailedError(content)) {
            // Handle DetailedError from error handler
            const previewError = this.convertDetailedErrorToPreviewError(content);
            state.errorState = previewError;
            this.loadingStateService.setLoadingState(filePath, LoadingState.ERROR);
            panel.webview.html = this.generateErrorHtml(previewError, content);
        } else if (this.isPreviewError(content)) {
            // Handle legacy PreviewError
            state.errorState = content;
            this.loadingStateService.setLoadingState(filePath, LoadingState.ERROR);
            panel.webview.html = this.generateErrorHtml(content);
        } else {
            // Handle successful content
            state.errorState = undefined;
            this.loadingStateService.setLoadingState(filePath, LoadingState.SUCCESS);
            panel.webview.html = this.webUIService.createWebviewContent(content, filePath, panel.webview);
        }
    }

    /**
     * Shows loading indicator for the specified file
     * 
     * @param filePath Path to the CMind file
     * @param progress Optional progress information
     */
    async showLoading(filePath: string, progress?: LoadingProgress): Promise<void> {
        const panel = this.panels.get(filePath);
        if (!panel) {
            return; // Panel doesn't exist
        }

        this.loadingStateService.setLoadingState(filePath, LoadingState.LOADING, progress);
        panel.webview.html = this.loadingStateService.generateLoadingHtml(filePath, progress);
    }

    /**
     * Updates loading progress for the specified file
     * 
     * @param filePath Path to the CMind file
     * @param progress Progress information
     */
    async updateLoadingProgress(filePath: string, progress: LoadingProgress): Promise<void> {
        const panel = this.panels.get(filePath);
        if (!panel) {
            return; // Panel doesn't exist
        }

        if (this.loadingStateService.isLoading(filePath)) {
            this.loadingStateService.updateProgress(filePath, progress);
            panel.webview.html = this.loadingStateService.generateLoadingHtml(filePath, progress);
        }
    }

    /**
     * Shows empty placeholder for the specified file
     * 
     * @param filePath Path to the CMind file
     * @param config Optional placeholder configuration
     */
    async showEmptyPlaceholder(filePath: string, config?: PlaceholderConfig): Promise<void> {
        const panel = this.panels.get(filePath);
        if (!panel) {
            return; // Panel doesn't exist
        }

        this.loadingStateService.setLoadingState(filePath, LoadingState.EMPTY);
        panel.webview.html = this.loadingStateService.generateEmptyPlaceholderHtml(filePath, config);
    }

    /**
     * Shows general placeholder for the specified file
     * 
     * @param filePath Path to the CMind file
     * @param config Placeholder configuration
     */
    async showPlaceholder(filePath: string, config: PlaceholderConfig): Promise<void> {
        const panel = this.panels.get(filePath);
        if (!panel) {
            return; // Panel doesn't exist
        }

        panel.webview.html = this.loadingStateService.generatePlaceholderHtml(config);
    }

    /**
     * Clears loading state for the specified file
     * 
     * @param filePath Path to the CMind file
     */
    clearLoadingState(filePath: string): void {
        this.loadingStateService.clearLoadingState(filePath);
    }

    /**
     * Checks if the specified file is currently loading
     * 
     * @param filePath Path to the CMind file
     * @returns True if file is loading
     */
    isLoading(filePath: string): boolean {
        return this.loadingStateService.isLoading(filePath);
    }

    /**
     * Gets current loading state for the specified file
     * 
     * @param filePath Path to the CMind file
     * @returns Current loading state
     */
    getLoadingState(filePath: string): LoadingState {
        return this.loadingStateService.getLoadingState(filePath);
    }

    /**
     * Closes preview for the specified file
     * 
     * @param filePath Path to the CMind file
     */
    closePreview(filePath: string): void {
        const panel = this.panels.get(filePath);
        if (panel) {
            // Save state before disposal
            this.savePanelState(filePath);
            panel.dispose();
        } else {
            // Clean up state even if panel doesn't exist
            this.cleanupPanelState(filePath);
        }
    }

    /**
     * Switches to the specified preview tab
     * 
     * @param filePath Path to the CMind file
     */
    switchToTab(filePath: string): void {
        const panel = this.panels.get(filePath);
        if (panel) {
            panel.reveal(vscode.ViewColumn.Beside, true);
            this.setActivePreview(filePath);
        }
    }

    /**
     * Checks if preview is open for the specified file
     * 
     * @param filePath Path to the CMind file
     * @returns true if preview is open, false otherwise
     */
    isPreviewOpen(filePath: string): boolean {
        return this.panels.has(filePath);
    }

    /**
     * Gets the current active preview file path
     * 
     * @returns Path to the active preview file, or undefined if none
     */
    getActivePreviewPath(): string | undefined {
        return this.activePreviewPath;
    }

    /**
     * Gets all open preview file paths
     * 
     * @returns Array of file paths with open previews
     */
    getOpenPreviewPaths(): string[] {
        return Array.from(this.panels.keys());
    }

    /**
     * Gets preview state for the specified file
     * 
     * @param filePath Path to the CMind file
     * @returns Preview state or undefined if not found
     */
    getPreviewState(filePath: string): PreviewState | undefined {
        return this.previewStates.get(filePath);
    }

    /**
     * Gets lifecycle state for the specified file
     * 
     * @param filePath Path to the CMind file
     * @returns Lifecycle state or undefined if not found
     */
    getLifecycleState(filePath: string): PanelLifecycleState | undefined {
        return this.lifecycleStates.get(filePath);
    }

    /**
     * Gets the error handler instance
     * 
     * @returns Error handler instance
     */
    getErrorHandler(): ErrorHandler {
        return this.errorHandler;
    }

    /**
     * Sets zoom level for the specified preview
     * 
     * @param filePath Path to the CMind file
     * @param zoomLevel Zoom level (1.0 = 100%)
     */
    setZoomLevel(filePath: string, zoomLevel: number): void {
        this.webUIService.setZoomLevel(filePath, zoomLevel);
    }

    /**
     * Fits the mind map to view for the specified preview
     * 
     * @param filePath Path to the CMind file
     */
    fitToView(filePath: string): void {
        this.webUIService.fitToView(filePath);
    }

    /**
     * Centers the view for the specified preview
     * 
     * @param filePath Path to the CMind file
     */
    centerView(filePath: string): void {
        this.webUIService.centerView(filePath);
    }

    /**
     * Resets the view for the specified preview
     * 
     * @param filePath Path to the CMind file
     */
    resetView(filePath: string): void {
        this.webUIService.resetView(filePath);
    }

    /**
     * Updates the theme for all previews
     * 
     * @param theme Theme name or configuration
     */
    updateTheme(theme: string): void {
        this.webUIService.updateTheme(theme);
    }

    /**
     * Updates interactive features for all previews
     * 
     * @param enabled Whether interactive features should be enabled
     */
    updateInteractiveFeatures(enabled: boolean): void {
        this.webUIService.enableInteraction(enabled);
    }

    /**
     * Sets the callback function to be called when panel visibility changes
     * 
     * @param callback Function to handle visibility change events
     */
    onVisibilityChanged(callback: (filePath: string, isVisible: boolean) => void): void {
        this.onVisibilityChangedCallback = callback;
    }

    /**
     * Checks if a preview panel is currently visible
     * 
     * @param filePath Path to the CMind file
     * @returns True if the panel is visible, false otherwise
     */
    isPreviewVisible(filePath: string): boolean {
        const panel = this.panels.get(filePath);
        return panel ? panel.visible : false;
    }

    /**
     * Saves panel state for persistence across sessions
     * 
     * @param filePath Path to the CMind file
     */
    private savePanelState(filePath: string): void {
        const panel = this.panels.get(filePath);
        const state = this.previewStates.get(filePath);
        
        if (!panel || !state) {
            return;
        }

        const lifecycleState: PanelLifecycleState = {
            filePath,
            isVisible: panel.visible,
            viewColumn: panel.viewColumn || vscode.ViewColumn.Beside,
            lastActiveTime: Date.now()
        };

        this.lifecycleStates.set(filePath, lifecycleState);
        this.persistLifecycleStates();
    }

    /**
     * Persists lifecycle states to extension context
     */
    private persistLifecycleStates(): void {
        if (this.isDisposed) {
            return;
        }

        const states = Array.from(this.lifecycleStates.values());
        this.context.workspaceState.update('cmind.preview.lifecycleStates', states);
    }

    /**
     * Restores panel states from previous session
     */
    private restorePanelStates(): void {
        const savedStates = this.context.workspaceState.get<PanelLifecycleState[]>(
            'cmind.preview.lifecycleStates',
            []
        );

        for (const state of savedStates) {
            this.lifecycleStates.set(state.filePath, state);
        }
    }

    /**
     * Cleans up panel state when panel is destroyed
     * 
     * @param filePath Path to the CMind file
     */
    private cleanupPanelState(filePath: string): void {
        this.panels.delete(filePath);
        this.previewStates.delete(filePath);
        this.lifecycleStates.delete(filePath);
        this.persistLifecycleStates();

        if (this.activePreviewPath === filePath) {
            this.updateActivePreview();
        }

        if (this.panels.size === 0) {
            vscode.commands.executeCommand('setContext', 'cmindPreviewActive', false);
        }
    }

    /**
     * Handles panel creation lifecycle
     * 
     * @param filePath Path to the CMind file
     * @param panel The created webview panel
     */
    private handlePanelCreation(filePath: string, panel: vscode.WebviewPanel): void {
        // Store panel and initialize state
        this.panels.set(filePath, panel);
        this.previewStates.set(filePath, {
            filePath,
            isActive: true,
            lastUpdate: new Date(),
            contentHash: ''
        });

        // Save initial lifecycle state
        this.savePanelState(filePath);

        // Set up panel event handlers
        this.setupPanelEventHandlers(panel, filePath);

        // Set active preview
        this.setActivePreview(filePath);

        // Set context for command availability
        vscode.commands.executeCommand('setContext', 'cmindPreviewActive', true);
    }

    /**
     * Handles panel destruction lifecycle
     * 
     * @param filePath Path to the CMind file
     */
    private handlePanelDestruction(filePath: string): void {
        // Notify WebUI service to clean up webview
        this.webUIService.removeWebview(filePath);
        this.cleanupPanelState(filePath);
    }

    /**
     * Handles panel visibility changes
     * 
     * @param filePath Path to the CMind file
     * @param isVisible Whether the panel is visible
     */
    private handlePanelVisibilityChange(filePath: string, isVisible: boolean): void {
        const state = this.previewStates.get(filePath);
        if (state) {
            state.isActive = isVisible;
        }

        const lifecycleState = this.lifecycleStates.get(filePath);
        if (lifecycleState) {
            lifecycleState.isVisible = isVisible;
            lifecycleState.lastActiveTime = Date.now();
            this.persistLifecycleStates();
        }

        // Pause/resume updates based on visibility (Requirement 6.3)
        this.handleUpdatePausingForVisibility(filePath, isVisible);
    }

    /**
     * Handles update pausing/resuming based on panel visibility
     * 
     * @param filePath Path to the CMind file
     * @param isVisible Whether the panel is visible
     */
    private handleUpdatePausingForVisibility(filePath: string, isVisible: boolean): void {
        // Emit visibility change event for content synchronizer
        if (this.onVisibilityChangedCallback) {
            this.onVisibilityChangedCallback(filePath, isVisible);
        }
    }

    /**
     * Updates configuration settings and applies them to the preview system
     * 
     * @param newConfig New configuration values
     */
    updateConfiguration(newConfig: Partial<PreviewConfiguration>): void {
        // Update internal configuration
        Object.assign(this.configuration, newConfig);
        
        // Apply theme changes if specified
        if (newConfig.theme !== undefined) {
            this.updateTheme(newConfig.theme);
        }
        
        // Apply interaction changes if specified
        if (newConfig.enableInteraction !== undefined) {
            this.updateInteractiveFeatures(newConfig.enableInteraction);
        }
        
        // Reconfigure WebUI service with new settings
        this.configureWebUIService();
        
        console.log('PreviewPanelManager configuration updated:', newConfig);
    }

    /**
     * Gets the current configuration
     * 
     * @returns Current configuration object
     */
    getConfiguration(): PreviewConfiguration {
        return { ...this.configuration };
    }

    /**
     * Disposes of all resources and closes all previews
     */
    dispose(): void {
        if (this.isDisposed) {
            return;
        }

        console.log('PreviewPanelManager: Starting disposal process');
        this.isDisposed = true;

        try {
            // Save all panel states before disposal
            console.log(`PreviewPanelManager: Saving states for ${this.panels.size} panels`);
            for (const filePath of this.panels.keys()) {
                this.savePanelState(filePath);
            }

            // Close all panels and clean up webviews
            console.log(`PreviewPanelManager: Disposing ${this.panels.size} webview panels`);
            for (const [filePath, panel] of this.panels.entries()) {
                try {
                    // Notify WebUI service to clean up webview resources
                    this.webUIService.removeWebview(filePath);
                    
                    // Dispose the panel
                    panel.dispose();
                } catch (error) {
                    console.error(`Error disposing panel for ${filePath}:`, error);
                }
            }
            
            // Clear collections
            this.panels.clear();
            this.previewStates.clear();
            
            // Clear loading states
            console.log('PreviewPanelManager: Clearing loading states');
            for (const filePath of Array.from(this.lifecycleStates.keys())) {
                this.clearLoadingState(filePath);
            }
            
            // Dispose WebUI service
            console.log('PreviewPanelManager: Disposing WebUI service');
            this.webUIService.dispose();
            
            // Dispose error handler
            console.log('PreviewPanelManager: Disposing error handler');
            this.errorHandler.dispose();
            
            // Dispose loading state service
            console.log('PreviewPanelManager: Disposing loading state service');
            this.loadingStateService.dispose();
            
            // Dispose event listeners
            console.log(`PreviewPanelManager: Disposing ${this.disposables.length} event listeners`);
            for (const disposable of this.disposables) {
                try {
                    disposable.dispose();
                } catch (error) {
                    console.error('Error disposing event listener:', error);
                }
            }
            this.disposables.length = 0;

            // Clear context and reset state
            this.activePreviewPath = undefined;
            this.onVisibilityChangedCallback = undefined;
            
            // Clear VSCode context
            vscode.commands.executeCommand('setContext', 'cmindPreviewActive', false);
            
            console.log('PreviewPanelManager: Disposal completed successfully');
            
        } catch (error) {
            console.error('Error during PreviewPanelManager disposal:', error);
        }
    }

    /**
     * Sets up event listeners for file system and editor events
     */
    private setupEventListeners(): void {
        // Listen for file deletions and renames
        const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.cmind');
        
        fileWatcher.onDidDelete((uri) => {
            this.closePreview(uri.fsPath);
        });

        fileWatcher.onDidChange((uri) => {
            // File change will be handled by ContentSynchronizer
            // This is just for cleanup if needed
        });

        this.disposables.push(fileWatcher);

        // Listen for active editor changes to update focus
        const editorChangeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && editor.document.languageId === 'cmind') {
                const filePath = editor.document.uri.fsPath;
                if (this.isPreviewOpen(filePath)) {
                    this.setActivePreview(filePath);
                }
            }
        });

        this.disposables.push(editorChangeListener);
    }

    /**
     * Sets up event handlers for a specific panel
     * 
     * @param panel The webview panel
     * @param filePath Path to the associated CMind file
     */
    private setupPanelEventHandlers(panel: vscode.WebviewPanel, filePath: string): void {
        // Handle panel disposal
        panel.onDidDispose(() => {
            this.handlePanelDestruction(filePath);
        });

        // Handle panel visibility changes
        panel.onDidChangeViewState((e) => {
            const isVisible = e.webviewPanel.visible;
            const isActive = e.webviewPanel.active;
            
            this.handlePanelVisibilityChange(filePath, isVisible);
            
            const state = this.previewStates.get(filePath);
            if (state) {
                state.isActive = isActive;
                
                if (isActive) {
                    this.setActivePreview(filePath);
                }
            }
        });

        // Handle messages from webview
        panel.webview.onDidReceiveMessage((message) => {
            this.handleWebviewMessage(message, filePath);
        });
    }

    /**
     * Sets the active preview and updates highlighting
     * 
     * @param filePath Path to the CMind file to set as active
     */
    private setActivePreview(filePath: string): void {
        this.activePreviewPath = filePath;
        
        // Update all panel titles to reflect active state
        for (const [panelPath, panel] of this.panels.entries()) {
            const fileName = path.basename(panelPath, '.cmind');
            const isActive = panelPath === filePath;
            panel.title = isActive ? `● Preview: ${fileName}` : `Preview: ${fileName}`;
        }
    }

    /**
     * Updates active preview when current active is closed
     */
    private updateActivePreview(): void {
        if (this.panels.size > 0) {
            // Set first available panel as active
            const firstPath = this.panels.keys().next().value as string;
            if (firstPath) {
                this.setActivePreview(firstPath);
            }
        } else {
            this.activePreviewPath = undefined;
        }
    }

    /**
     * Handles messages received from webview
     * 
     * @param message Message from webview
     * @param filePath Path to the associated CMind file
     */
    private handleWebviewMessage(message: any, filePath: string): void {
        // Delegate to WebUI service for handling
        this.webUIService.handleWebviewMessage(message, filePath);
        
        // Handle panel-specific messages
        switch (message.type) {
            case 'ready':
                // Webview is ready, can send initial data
                break;
            case 'error':
                // Handle webview errors
                console.error(`Preview error for ${filePath}:`, message.error);
                break;
            case 'interaction':
                // Handle user interactions (zoom, pan, etc.)
                break;
            default:
                console.warn(`Unknown message type from preview: ${message.type}`);
        }
    }

    /**
     * Configures the WebUI service with current settings
     */
    private configureWebUIService(): void {
        // Update theme
        this.webUIService.updateTheme(this.configuration.theme);
        
        // Update interactive features
        this.webUIService.enableInteraction(this.configuration.enableInteraction);
    }

    /**
     * Type guard to check if content is a detailed error
     * 
     * @param content Content to check
     * @returns true if content is DetailedError, false otherwise
     */
    private isDetailedError(content: KityMinderData | PreviewError | DetailedError): content is DetailedError {
        return content && typeof content === 'object' && 
               'type' in content && 'severity' in content && 'message' in content &&
               Object.values(ErrorType).includes((content as any).type);
    }

    /**
     * Type guard to check if content is a preview error
     * 
     * @param content Content to check
     * @returns true if content is PreviewError, false otherwise
     */
    private isPreviewError(content: KityMinderData | PreviewError | DetailedError): content is PreviewError {
        return content && typeof content === 'object' && 
               'message' in content && 'type' in content &&
               !this.isDetailedError(content);
    }

    /**
     * Converts DetailedError to PreviewError for backward compatibility
     * 
     * @param detailedError DetailedError to convert
     * @returns PreviewError
     */
    private convertDetailedErrorToPreviewError(detailedError: DetailedError): PreviewError {
        let type: PreviewError['type'];
        
        switch (detailedError.type) {
            case ErrorType.SYNTAX:
            case ErrorType.VALIDATION:
                type = 'syntax';
                break;
            case ErrorType.CONVERSION:
                type = 'conversion';
                break;
            case ErrorType.WEBUI:
                type = 'webui';
                break;
            case ErrorType.MEMORY:
                type = 'memory';
                break;
            default:
                type = 'conversion';
        }

        return {
            message: detailedError.message,
            line: detailedError.line,
            column: detailedError.column,
            type,
            severity: detailedError.severity,
            suggestions: detailedError.suggestions
        };
    }

    /**
     * Generates HTML content for error display
     * 
     * @param error Preview error information
     * @param detailedError Optional detailed error for additional information
     * @returns HTML string for webview
     */
    private generateErrorHtml(error: PreviewError, detailedError?: DetailedError): string {
        const locationInfo = error.line !== undefined && error.column !== undefined 
            ? ` (Line ${error.line}, Column ${error.column})` 
            : '';
            
        const severity = error.severity || 'error';
        const severityIcon = severity === 'error' ? '⚠️' : severity === 'warning' ? '⚠️' : 'ℹ️';
        const severityColor = severity === 'error' ? 'var(--vscode-errorForeground)' : 
                             severity === 'warning' ? 'var(--vscode-warningForeground)' : 
                             'var(--vscode-infoForeground)';
        
        const suggestions = error.suggestions || (detailedError?.suggestions) || [];
        const suggestionsHtml = suggestions.length > 0 
            ? `<div class="error-help">
                <strong>Suggestions:</strong><br>
                ${suggestions.map(s => `• ${s}`).join('<br>')}
               </div>`
            : `<div class="error-help">
                <strong>Troubleshooting:</strong><br>
                • Check your CMind syntax for errors<br>
                • Ensure all nodes are properly formatted<br>
                • Verify that indentation is consistent<br>
                • Save the file and try again
               </div>`;
            
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CMind Preview Error</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        
        .error-container {
            max-width: 600px;
            margin: 0 auto;
        }
        
        .error-header {
            display: flex;
            align-items: center;
            margin-bottom: 16px;
            color: ${severityColor};
        }
        
        .error-icon {
            margin-right: 8px;
            font-size: 18px;
        }
        
        .error-title {
            font-size: 16px;
            font-weight: 600;
        }
        
        .error-message {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            border-radius: 4px;
            padding: 16px;
            margin-bottom: 16px;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            line-height: 1.4;
            white-space: pre-wrap;
        }
        
        .error-location {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            margin-top: 8px;
        }
        
        .error-help {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            padding: 12px 16px;
            margin-top: 16px;
            font-size: 13px;
            line-height: 1.4;
        }
        
        .error-details {
            margin-top: 16px;
            padding: 12px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
            font-size: 12px;
        }
        
        .error-details summary {
            cursor: pointer;
            font-weight: 600;
            margin-bottom: 8px;
        }
        
        .error-details code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 4px;
            border-radius: 2px;
            font-family: var(--vscode-editor-font-family);
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-header">
            <span class="error-icon">${severityIcon}</span>
            <span class="error-title">Preview ${severity.charAt(0).toUpperCase() + severity.slice(1)}</span>
        </div>
        
        <div class="error-message">
            ${error.message}
            ${locationInfo ? `<div class="error-location">${locationInfo}</div>` : ''}
        </div>
        
        ${suggestionsHtml}
        
        ${detailedError ? `
        <details class="error-details">
            <summary>Technical Details</summary>
            <div>
                <strong>Error Type:</strong> <code>${detailedError.type}</code><br>
                <strong>Source:</strong> <code>${detailedError.source || 'Unknown'}</code><br>
                ${detailedError.code ? `<strong>Code:</strong> <code>${detailedError.code}</code><br>` : ''}
                <strong>Timestamp:</strong> <code>${new Date().toLocaleString()}</code>
            </div>
        </details>
        ` : ''}
    </div>
</body>
</html>`;
    }
}