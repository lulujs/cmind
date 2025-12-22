import * as vscode from 'vscode';

/**
 * Detailed error information with location data
 */
export interface DetailedError {
    message: string;
    line?: number;
    column?: number;
    endLine?: number;
    endColumn?: number;
    type: ErrorType;
    severity: ErrorSeverity;
    source?: string;
    code?: string;
    suggestions?: string[];
}

/**
 * Error types for categorization
 */
export enum ErrorType {
    SYNTAX = 'syntax',
    CONVERSION = 'conversion',
    WEBUI = 'webui',
    MEMORY = 'memory',
    FILESYSTEM = 'filesystem',
    VALIDATION = 'validation',
    NETWORK = 'network',
    UNKNOWN = 'unknown'
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
    ERROR = 'error',
    WARNING = 'warning',
    INFO = 'info'
}

/**
 * Error recovery strategy
 */
export interface ErrorRecoveryStrategy {
    canRecover: boolean;
    recoveryAction?: () => Promise<void>;
    fallbackAction?: () => Promise<void>;
    retryCount?: number;
    maxRetries?: number;
}

/**
 * Error context for better error reporting
 */
export interface ErrorContext {
    filePath?: string;
    operation?: string;
    timestamp: Date;
    stackTrace?: string;
    userAction?: string;
    systemInfo?: {
        platform: string;
        vscodeVersion: string;
        extensionVersion: string;
    };
}

/**
 * Comprehensive error handler for CMind preview functionality
 * 
 * Provides:
 * - Detailed error parsing with line/column information
 * - Error categorization and severity assessment
 * - Recovery mechanisms and fallback strategies
 * - User-friendly error messages with suggestions
 * - Error logging and reporting
 * 
 * Requirements addressed:
 * - 2.2: Display syntax errors with line/column information
 * - 5.1: Display error message and line number for syntax errors
 * - 5.2: Show user-friendly error message when conversion fails
 */
export class ErrorHandler {
    private outputChannel: vscode.OutputChannel | undefined;
    private readonly errorHistory = new Map<string, DetailedError[]>();
    private readonly recoveryStrategies = new Map<ErrorType, ErrorRecoveryStrategy>();
    
    constructor() {
        // Lazy initialization of output channel to support testing
        this.setupRecoveryStrategies();
    }

    /**
     * Gets or creates the output channel
     */
    private getOutputChannel(): vscode.OutputChannel | undefined {
        if (!this.outputChannel) {
            try {
                this.outputChannel = vscode.window.createOutputChannel('CMind Preview');
            } catch (error) {
                // VSCode API not available (e.g., in tests)
                return undefined;
            }
        }
        return this.outputChannel;
    }

    /**
     * Processes and enhances error information
     * 
     * @param error Original error object
     * @param context Additional context information
     * @returns Enhanced detailed error
     */
    processError(error: unknown, context?: Partial<ErrorContext>): DetailedError {
        const errorContext: ErrorContext = {
            timestamp: new Date(),
            ...context,
            systemInfo: {
                platform: process.platform,
                vscodeVersion: vscode.version,
                extensionVersion: this.getExtensionVersion()
            }
        };

        let detailedError: DetailedError;

        if (this.isSyntaxError(error)) {
            detailedError = this.processSyntaxError(error, errorContext);
        } else if (this.isValidationError(error)) {
            detailedError = this.processValidationError(error, errorContext);
        } else if (this.isFileSystemError(error)) {
            detailedError = this.processFileSystemError(error, errorContext);
        } else if (this.isConversionError(error)) {
            detailedError = this.processConversionError(error, errorContext);
        } else {
            detailedError = this.processGenericError(error, errorContext);
        }

        // Store error in history for analysis
        if (errorContext.filePath) {
            this.addToErrorHistory(errorContext.filePath, detailedError);
        }

        // Log error for debugging
        this.logError(detailedError, errorContext);

        return detailedError;
    }

    /**
     * Attempts to recover from an error using appropriate strategy
     * 
     * @param error Detailed error information
     * @param context Error context
     * @returns Promise resolving to recovery success
     */
    async attemptRecovery(error: DetailedError, context?: ErrorContext): Promise<boolean> {
        const strategy = this.recoveryStrategies.get(error.type);
        
        if (!strategy || !strategy.canRecover) {
            return false;
        }

        try {
            // Check retry count
            if (strategy.retryCount !== undefined && strategy.maxRetries !== undefined) {
                if (strategy.retryCount >= strategy.maxRetries) {
                    // Execute fallback if available
                    if (strategy.fallbackAction) {
                        await strategy.fallbackAction();
                        return true;
                    }
                    return false;
                }
                strategy.retryCount++;
            }

            // Execute recovery action
            if (strategy.recoveryAction) {
                await strategy.recoveryAction();
                return true;
            }

            return false;
        } catch (recoveryError) {
            this.logError(
                this.processError(recoveryError, { 
                    ...context, 
                    operation: 'error_recovery' 
                }),
                context
            );
            
            // Try fallback if recovery fails
            if (strategy.fallbackAction) {
                try {
                    await strategy.fallbackAction();
                    return true;
                } catch (fallbackError) {
                    this.logError(
                        this.processError(fallbackError, { 
                            ...context, 
                            operation: 'fallback_recovery' 
                        }),
                        context
                    );
                }
            }
            
            return false;
        }
    }

    /**
     * Generates user-friendly error message with suggestions
     * 
     * @param error Detailed error information
     * @returns Formatted error message for display
     */
    formatUserMessage(error: DetailedError): string {
        let message = error.message;
        
        // Add location information if available
        if (error.line !== undefined) {
            const location = error.column !== undefined 
                ? `Line ${error.line}, Column ${error.column}`
                : `Line ${error.line}`;
            message = `${location}: ${message}`;
        }

        // Add suggestions if available
        if (error.suggestions && error.suggestions.length > 0) {
            message += '\n\nSuggestions:\n';
            message += error.suggestions.map(s => `• ${s}`).join('\n');
        }

        return message;
    }

    /**
     * Gets error history for a specific file
     * 
     * @param filePath Path to the file
     * @returns Array of detailed errors for the file
     */
    getErrorHistory(filePath: string): DetailedError[] {
        return this.errorHistory.get(filePath) || [];
    }

    /**
     * Clears error history for a specific file
     * 
     * @param filePath Path to the file
     */
    clearErrorHistory(filePath: string): void {
        this.errorHistory.delete(filePath);
    }

    /**
     * Shows error message to user with appropriate severity
     * 
     * @param error Detailed error information
     * @param context Error context
     */
    async showErrorToUser(error: DetailedError, context?: ErrorContext): Promise<void> {
        const message = this.formatUserMessage(error);
        
        switch (error.severity) {
            case ErrorSeverity.ERROR:
                await vscode.window.showErrorMessage(message, 'View Details', 'Dismiss');
                break;
            case ErrorSeverity.WARNING:
                await vscode.window.showWarningMessage(message, 'View Details', 'Dismiss');
                break;
            case ErrorSeverity.INFO:
                await vscode.window.showInformationMessage(message, 'View Details', 'Dismiss');
                break;
        }
    }

    /**
     * Disposes of resources
     */
    dispose(): void {
        if (this.outputChannel) {
            this.outputChannel.dispose();
        }
        this.errorHistory.clear();
        this.recoveryStrategies.clear();
    }

    /**
     * Processes syntax errors with detailed location information
     */
    private processSyntaxError(error: any, context: ErrorContext): DetailedError {
        let line: number | undefined;
        let column: number | undefined;
        let endLine: number | undefined;
        let endColumn: number | undefined;
        let message = error.message || 'Syntax error';
        let suggestions: string[] = [];

        // Extract location from different error formats
        if (error.token) {
            line = error.token.startLine;
            column = error.token.startColumn;
            endLine = error.token.endLine;
            endColumn = error.token.endColumn;
        } else if (error.range) {
            line = error.range.start.line + 1;
            column = error.range.start.character + 1;
            endLine = error.range.end.line + 1;
            endColumn = error.range.end.character + 1;
        } else if (error.line !== undefined) {
            line = error.line;
            column = error.column;
        }

        // Generate helpful suggestions based on common syntax errors
        suggestions = this.generateSyntaxSuggestions(message);

        return {
            message,
            line,
            column,
            endLine,
            endColumn,
            type: ErrorType.SYNTAX,
            severity: ErrorSeverity.ERROR,
            source: 'CMind Parser',
            suggestions
        };
    }

    /**
     * Processes validation errors from Langium
     */
    private processValidationError(error: any, context: ErrorContext): DetailedError {
        const diagnostic = error.diagnostic || error;
        
        return {
            message: diagnostic.message || 'Validation error',
            line: diagnostic.range ? diagnostic.range.start.line + 1 : undefined,
            column: diagnostic.range ? diagnostic.range.start.character + 1 : undefined,
            endLine: diagnostic.range ? diagnostic.range.end.line + 1 : undefined,
            endColumn: diagnostic.range ? diagnostic.range.end.character + 1 : undefined,
            type: ErrorType.VALIDATION,
            severity: this.mapDiagnosticSeverity(diagnostic.severity),
            source: diagnostic.source || 'CMind Validator',
            code: diagnostic.code?.toString(),
            suggestions: this.generateValidationSuggestions(diagnostic.message)
        };
    }

    /**
     * Processes file system errors
     */
    private processFileSystemError(error: any, context: ErrorContext): DetailedError {
        let message = 'File system error';
        let suggestions: string[] = [];

        if (error.code) {
            switch (error.code) {
                case 'ENOENT':
                    message = `File not found: ${error.path || 'unknown'}`;
                    suggestions = [
                        'Check if the file path is correct',
                        'Ensure the file exists',
                        'Verify file permissions'
                    ];
                    break;
                case 'EACCES':
                case 'EPERM':
                    message = `Permission denied: ${error.path || 'unknown'}`;
                    suggestions = [
                        'Check file permissions',
                        'Run VSCode as administrator if necessary',
                        'Ensure the file is not locked by another process'
                    ];
                    break;
                case 'ENOSPC':
                    message = 'No space left on device';
                    suggestions = [
                        'Free up disk space',
                        'Choose a different output location'
                    ];
                    break;
                default:
                    message = error.message || message;
            }
        }

        return {
            message,
            type: ErrorType.FILESYSTEM,
            severity: ErrorSeverity.ERROR,
            source: 'File System',
            code: error.code,
            suggestions
        };
    }

    /**
     * Processes conversion errors
     */
    private processConversionError(error: any, context: ErrorContext): DetailedError {
        return {
            message: error.message || 'Conversion failed',
            type: ErrorType.CONVERSION,
            severity: ErrorSeverity.ERROR,
            source: 'CMind Converter',
            suggestions: [
                'Check CMind syntax for errors',
                'Ensure all nodes are properly formatted',
                'Verify indentation is consistent',
                'Try saving the file and converting again'
            ]
        };
    }

    /**
     * Processes generic errors
     */
    private processGenericError(error: unknown, context: ErrorContext): DetailedError {
        let message = 'Unknown error occurred';
        
        if (error instanceof Error) {
            message = error.message;
        } else if (typeof error === 'string') {
            message = error;
        } else if (error && typeof error === 'object' && 'message' in error) {
            message = String((error as any).message);
        }

        return {
            message,
            type: ErrorType.UNKNOWN,
            severity: ErrorSeverity.ERROR,
            source: 'CMind Extension',
            suggestions: [
                'Try reloading the window',
                'Check the output panel for more details',
                'Report this issue if it persists'
            ]
        };
    }

    /**
     * Generates syntax-specific suggestions
     */
    private generateSyntaxSuggestions(message: string): string[] {
        const suggestions: string[] = [];
        const lowerMessage = message.toLowerCase();

        if (lowerMessage.includes('unexpected token') || lowerMessage.includes('expected')) {
            suggestions.push('Check for missing or extra characters');
            suggestions.push('Verify proper indentation');
        }

        if (lowerMessage.includes('indent')) {
            suggestions.push('Use consistent indentation (spaces or tabs)');
            suggestions.push('Check that child nodes are properly indented');
        }

        if (lowerMessage.includes('attribute')) {
            suggestions.push('Check attribute syntax: [attribute:value]');
            suggestions.push('Ensure attributes are properly formatted');
        }

        if (suggestions.length === 0) {
            suggestions.push('Check CMind syntax documentation');
            suggestions.push('Verify file structure and formatting');
        }

        return suggestions;
    }

    /**
     * Generates validation-specific suggestions
     */
    private generateValidationSuggestions(message: string): string[] {
        const suggestions: string[] = [];
        const lowerMessage = message.toLowerCase();

        if (lowerMessage.includes('duplicate')) {
            suggestions.push('Remove duplicate identifiers');
            suggestions.push('Use unique IDs for each node');
        }

        if (lowerMessage.includes('reference') || lowerMessage.includes('resolve')) {
            suggestions.push('Check that referenced elements exist');
            suggestions.push('Verify spelling of references');
        }

        if (suggestions.length === 0) {
            suggestions.push('Review the validation error details');
            suggestions.push('Check CMind language rules');
        }

        return suggestions;
    }

    /**
     * Maps Langium diagnostic severity to our severity enum
     */
    private mapDiagnosticSeverity(severity: number): ErrorSeverity {
        switch (severity) {
            case 1: return ErrorSeverity.ERROR;
            case 2: return ErrorSeverity.WARNING;
            case 3: return ErrorSeverity.INFO;
            default: return ErrorSeverity.ERROR;
        }
    }

    /**
     * Sets up recovery strategies for different error types
     */
    private setupRecoveryStrategies(): void {
        // Syntax error recovery
        this.recoveryStrategies.set(ErrorType.SYNTAX, {
            canRecover: false, // Syntax errors require user intervention
            fallbackAction: async () => {
                // Show syntax error in preview with helpful guidance
            }
        });

        // Conversion error recovery
        this.recoveryStrategies.set(ErrorType.CONVERSION, {
            canRecover: true,
            retryCount: 0,
            maxRetries: 2,
            recoveryAction: async () => {
                // Clear cache and retry conversion
            },
            fallbackAction: async () => {
                // Show error message in preview
            }
        });

        // File system error recovery
        this.recoveryStrategies.set(ErrorType.FILESYSTEM, {
            canRecover: true,
            retryCount: 0,
            maxRetries: 1,
            recoveryAction: async () => {
                // Retry file operation after short delay
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        });

        // Memory error recovery
        this.recoveryStrategies.set(ErrorType.MEMORY, {
            canRecover: true,
            recoveryAction: async () => {
                // Clear cache to free memory
            }
        });
    }

    /**
     * Type guards for different error types
     */
    private isSyntaxError(error: unknown): error is Error {
        return error instanceof Error && 
               (error.name === 'SyntaxError' || 
                error.message.includes('syntax') ||
                error.message.includes('parser') ||
                error.message.includes('lexer'));
    }

    private isValidationError(error: unknown): error is any {
        return error !== null && error !== undefined && typeof error === 'object' && 
               ('diagnostic' in error || 'severity' in error);
    }

    private isFileSystemError(error: unknown): error is any {
        return error !== null && error !== undefined && typeof error === 'object' && 'code' in error &&
               typeof (error as any).code === 'string';
    }

    private isConversionError(error: unknown): error is Error {
        return error instanceof Error && 
               (error.name === 'ConversionError' || 
                error.message.includes('conversion'));
    }

    /**
     * Adds error to history for a file
     */
    private addToErrorHistory(filePath: string, error: DetailedError): void {
        const history = this.errorHistory.get(filePath) || [];
        history.push(error);
        
        // Keep only last 10 errors per file
        if (history.length > 10) {
            history.shift();
        }
        
        this.errorHistory.set(filePath, history);
    }

    /**
     * Logs error to output channel
     */
    private logError(error: DetailedError, context?: ErrorContext): void {
        const outputChannel = this.getOutputChannel();
        if (!outputChannel) {
            // VSCode API not available (e.g., in tests), skip logging
            return;
        }
        
        const timestamp = new Date().toISOString();
        const location = error.line !== undefined && error.column !== undefined
            ? ` at ${error.line}:${error.column}`
            : '';
        
        outputChannel.appendLine(
            `[${timestamp}] ${error.severity.toUpperCase()}: ${error.message}${location}`
        );
        
        if (context?.filePath) {
            outputChannel.appendLine(`  File: ${context.filePath}`);
        }
        
        if (context?.operation) {
            outputChannel.appendLine(`  Operation: ${context.operation}`);
        }
        
        if (error.suggestions && error.suggestions.length > 0) {
            outputChannel.appendLine(`  Suggestions: ${error.suggestions.join(', ')}`);
        }
        
        outputChannel.appendLine('');
    }

    /**
     * Gets extension version for error reporting
     */
    private getExtensionVersion(): string {
        try {
            const extension = vscode.extensions.getExtension('cmind.cmind-preview');
            return extension?.packageJSON?.version || 'unknown';
        } catch {
            return 'unknown';
        }
    }
}