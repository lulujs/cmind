import * as vscode from 'vscode';

/**
 * Loading state types
 */
export enum LoadingState {
    IDLE = 'idle',
    LOADING = 'loading',
    SUCCESS = 'success',
    ERROR = 'error',
    EMPTY = 'empty'
}

/**
 * Loading progress information
 */
export interface LoadingProgress {
    message: string;
    percentage?: number;
    stage?: string;
}

/**
 * Placeholder content configuration
 */
export interface PlaceholderConfig {
    title: string;
    message: string;
    icon?: string;
    actions?: PlaceholderAction[];
}

/**
 * Placeholder action button
 */
export interface PlaceholderAction {
    label: string;
    command: string;
    args?: any[];
    primary?: boolean;
}

/**
 * Service for managing loading indicators and placeholder states in preview panels
 * 
 * Provides:
 * - Loading indicators during conversion
 * - Helpful messages for empty files
 * - Error state visualization
 * - Progress tracking for long operations
 * 
 * Requirements addressed:
 * - 5.3: Show loading indicator during conversion
 * - 5.4: Display helpful placeholder message for empty files
 */
export class LoadingStateService {
    private readonly loadingStates = new Map<string, LoadingState>();
    private readonly loadingProgress = new Map<string, LoadingProgress>();
    private readonly loadingTimers = new Map<string, NodeJS.Timeout>();

    /**
     * Sets loading state for a specific file
     * 
     * @param filePath Path to the file
     * @param state Loading state to set
     * @param progress Optional progress information
     */
    setLoadingState(filePath: string, state: LoadingState, progress?: LoadingProgress): void {
        this.loadingStates.set(filePath, state);
        
        if (progress) {
            this.loadingProgress.set(filePath, progress);
        } else {
            this.loadingProgress.delete(filePath);
        }

        // Clear any existing timer for this file
        const existingTimer = this.loadingTimers.get(filePath);
        if (existingTimer) {
            clearTimeout(existingTimer);
            this.loadingTimers.delete(filePath);
        }

        // Set timeout for loading state to prevent stuck loading indicators
        if (state === LoadingState.LOADING) {
            const timer = setTimeout(() => {
                this.setLoadingState(filePath, LoadingState.ERROR, {
                    message: 'Loading timeout - operation took too long'
                });
            }, 30000); // 30 second timeout
            
            this.loadingTimers.set(filePath, timer);
        }
    }

    /**
     * Gets current loading state for a file
     * 
     * @param filePath Path to the file
     * @returns Current loading state
     */
    getLoadingState(filePath: string): LoadingState {
        return this.loadingStates.get(filePath) || LoadingState.IDLE;
    }

    /**
     * Gets current loading progress for a file
     * 
     * @param filePath Path to the file
     * @returns Loading progress information or undefined
     */
    getLoadingProgress(filePath: string): LoadingProgress | undefined {
        return this.loadingProgress.get(filePath);
    }

    /**
     * Generates HTML for loading indicator
     * 
     * @param filePath Path to the file
     * @param progress Optional progress information
     * @returns HTML string for loading indicator
     */
    generateLoadingHtml(filePath: string, progress?: LoadingProgress): string {
        const progressInfo = progress || this.loadingProgress.get(filePath);
        const message = progressInfo?.message || 'Converting CMind file...';
        const percentage = progressInfo?.percentage;
        const stage = progressInfo?.stage;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CMind Preview Loading</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        
        .loading-container {
            text-align: center;
            max-width: 400px;
            padding: 40px 20px;
        }
        
        .loading-spinner {
            width: 48px;
            height: 48px;
            margin: 0 auto 24px;
            border: 3px solid var(--vscode-progressBar-background);
            border-top: 3px solid var(--vscode-progressBar-foreground);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .loading-message {
            font-size: 16px;
            margin-bottom: 16px;
            color: var(--vscode-foreground);
        }
        
        .loading-stage {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 16px;
        }
        
        .progress-bar {
            width: 100%;
            height: 4px;
            background-color: var(--vscode-progressBar-background);
            border-radius: 2px;
            overflow: hidden;
            margin-bottom: 8px;
        }
        
        .progress-fill {
            height: 100%;
            background-color: var(--vscode-progressBar-foreground);
            transition: width 0.3s ease;
        }
        
        .progress-text {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        
        .loading-details {
            margin-top: 24px;
            padding: 12px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
            font-size: 12px;
            text-align: left;
        }
    </style>
</head>
<body>
    <div class="loading-container">
        <div class="loading-spinner"></div>
        <div class="loading-message">${message}</div>
        ${stage ? `<div class="loading-stage">${stage}</div>` : ''}
        
        ${percentage !== undefined ? `
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${percentage}%"></div>
        </div>
        <div class="progress-text">${percentage}% complete</div>
        ` : ''}
        
        <div class="loading-details">
            <strong>What's happening:</strong><br>
            • Parsing CMind syntax<br>
            • Validating structure<br>
            • Converting to KityMinder format<br>
            • Rendering mind map
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * Generates HTML for empty file placeholder
     * 
     * @param filePath Path to the file
     * @param config Optional placeholder configuration
     * @returns HTML string for empty placeholder
     */
    generateEmptyPlaceholderHtml(filePath: string, config?: PlaceholderConfig): string {
        const defaultConfig: PlaceholderConfig = {
            title: 'Empty CMind File',
            message: 'Start creating your mind map by adding content to the CMind file.',
            icon: '🧠',
            actions: [
                {
                    label: 'View Documentation',
                    command: 'vscode.open',
                    args: [vscode.Uri.parse('https://github.com/your-repo/cmind-docs')],
                    primary: false
                },
                {
                    label: 'Insert Sample Content',
                    command: 'cmind.insertSample',
                    args: [filePath],
                    primary: true
                }
            ]
        };

        const finalConfig = { ...defaultConfig, ...config };
        const actionsHtml = finalConfig.actions?.map(action => 
            `<button class="action-button ${action.primary ? 'primary' : ''}" 
                     onclick="executeCommand('${action.command}', ${JSON.stringify(action.args || [])})">
                ${action.label}
             </button>`
        ).join('') || '';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CMind Preview Empty</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        
        .placeholder-container {
            text-align: center;
            max-width: 500px;
            padding: 40px 20px;
        }
        
        .placeholder-icon {
            font-size: 64px;
            margin-bottom: 24px;
            opacity: 0.7;
        }
        
        .placeholder-title {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 16px;
            color: var(--vscode-foreground);
        }
        
        .placeholder-message {
            font-size: 16px;
            line-height: 1.5;
            margin-bottom: 32px;
            color: var(--vscode-descriptionForeground);
        }
        
        .placeholder-actions {
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        .action-button {
            padding: 8px 16px;
            border: 1px solid var(--vscode-button-border);
            border-radius: 4px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            font-family: var(--vscode-font-family);
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .action-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        .action-button.primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .action-button.primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .placeholder-help {
            margin-top: 32px;
            padding: 16px;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            border-radius: 4px;
            text-align: left;
            font-size: 13px;
            line-height: 1.4;
        }
        
        .placeholder-help h4 {
            margin: 0 0 8px 0;
            font-size: 14px;
            font-weight: 600;
        }
        
        .placeholder-help code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 4px;
            border-radius: 2px;
            font-family: var(--vscode-editor-font-family);
        }
    </style>
</head>
<body>
    <div class="placeholder-container">
        <div class="placeholder-icon">${finalConfig.icon}</div>
        <div class="placeholder-title">${finalConfig.title}</div>
        <div class="placeholder-message">${finalConfig.message}</div>
        
        ${actionsHtml ? `<div class="placeholder-actions">${actionsHtml}</div>` : ''}
        
        <div class="placeholder-help">
            <h4>Quick Start Guide</h4>
            Start with a simple mind map structure:<br><br>
            <code>Root Topic</code><br>
            <code>&nbsp;&nbsp;Subtopic 1</code><br>
            <code>&nbsp;&nbsp;&nbsp;&nbsp;Detail A</code><br>
            <code>&nbsp;&nbsp;&nbsp;&nbsp;Detail B</code><br>
            <code>&nbsp;&nbsp;Subtopic 2</code><br><br>
            Use indentation to create hierarchy and add attributes like <code>[priority:1]</code> for enhanced formatting.
        </div>
    </div>
    
    <script>
        function executeCommand(command, args) {
            if (typeof acquireVsCodeApi !== 'undefined') {
                const vscode = acquireVsCodeApi();
                vscode.postMessage({
                    type: 'command',
                    command: command,
                    args: args
                });
            }
        }
    </script>
</body>
</html>`;
    }

    /**
     * Generates HTML for general placeholder states
     * 
     * @param config Placeholder configuration
     * @returns HTML string for placeholder
     */
    generatePlaceholderHtml(config: PlaceholderConfig): string {
        const actionsHtml = config.actions?.map(action => 
            `<button class="action-button ${action.primary ? 'primary' : ''}" 
                     onclick="executeCommand('${action.command}', ${JSON.stringify(action.args || [])})">
                ${action.label}
             </button>`
        ).join('') || '';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CMind Preview</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        
        .placeholder-container {
            text-align: center;
            max-width: 500px;
            padding: 40px 20px;
        }
        
        .placeholder-icon {
            font-size: 48px;
            margin-bottom: 24px;
            opacity: 0.7;
        }
        
        .placeholder-title {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 16px;
            color: var(--vscode-foreground);
        }
        
        .placeholder-message {
            font-size: 14px;
            line-height: 1.5;
            margin-bottom: 24px;
            color: var(--vscode-descriptionForeground);
        }
        
        .placeholder-actions {
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        .action-button {
            padding: 8px 16px;
            border: 1px solid var(--vscode-button-border);
            border-radius: 4px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            font-family: var(--vscode-font-family);
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .action-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        .action-button.primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .action-button.primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="placeholder-container">
        ${config.icon ? `<div class="placeholder-icon">${config.icon}</div>` : ''}
        <div class="placeholder-title">${config.title}</div>
        <div class="placeholder-message">${config.message}</div>
        
        ${actionsHtml ? `<div class="placeholder-actions">${actionsHtml}</div>` : ''}
    </div>
    
    <script>
        function executeCommand(command, args) {
            if (typeof acquireVsCodeApi !== 'undefined') {
                const vscode = acquireVsCodeApi();
                vscode.postMessage({
                    type: 'command',
                    command: command,
                    args: args
                });
            }
        }
    </script>
</body>
</html>`;
    }

    /**
     * Clears loading state for a file
     * 
     * @param filePath Path to the file
     */
    clearLoadingState(filePath: string): void {
        this.loadingStates.delete(filePath);
        this.loadingProgress.delete(filePath);
        
        const timer = this.loadingTimers.get(filePath);
        if (timer) {
            clearTimeout(timer);
            this.loadingTimers.delete(filePath);
        }
    }

    /**
     * Checks if a file is currently in loading state
     * 
     * @param filePath Path to the file
     * @returns True if file is loading
     */
    isLoading(filePath: string): boolean {
        return this.getLoadingState(filePath) === LoadingState.LOADING;
    }

    /**
     * Updates loading progress for a file
     * 
     * @param filePath Path to the file
     * @param progress Progress information
     */
    updateProgress(filePath: string, progress: LoadingProgress): void {
        if (this.getLoadingState(filePath) === LoadingState.LOADING) {
            this.loadingProgress.set(filePath, progress);
        }
    }

    /**
     * Disposes of all resources
     */
    dispose(): void {
        // Clear all timers
        for (const timer of this.loadingTimers.values()) {
            clearTimeout(timer);
        }
        
        this.loadingStates.clear();
        this.loadingProgress.clear();
        this.loadingTimers.clear();
    }
}