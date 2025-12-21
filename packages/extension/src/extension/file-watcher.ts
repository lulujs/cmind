import * as vscode from 'vscode';
import * as path from 'node:path';
import { ConversionService, ConversionResult } from './conversion-service.js';
import { NotificationService } from './notification-service.js';

/**
 * FileWatcher monitors file save events for automatic conversion of CMind files.
 * 
 * This class implements the auto-conversion feature by:
 * - Listening to onDidSaveTextDocument events
 * - Filtering for .cmind files
 * - Triggering conversion based on user settings
 * - Providing user feedback through notifications
 * 
 * Requirements addressed:
 * - 2.1: Trigger conversion service when user saves a CMind file
 * - 2.2: Convert file in background when auto-conversion is enabled
 * - 2.4: Respect user settings for auto-conversion (don't convert when disabled)
 */
export class FileWatcher {
    private readonly conversionService: ConversionService;
    private readonly notificationService: NotificationService;
    private disposables: vscode.Disposable[] = [];

    constructor(conversionService: ConversionService) {
        this.conversionService = conversionService;
        this.notificationService = conversionService.getNotificationService();
    }

    /**
     * Starts watching for file save events and registers the necessary event handlers
     * @param context The VSCode extension context for managing disposables
     */
    startWatching(context: vscode.ExtensionContext): void {
        // Register the file save event listener
        const saveListener = vscode.workspace.onDidSaveTextDocument(
            (document) => this.onFileSaved(document)
        );

        // Add to disposables for proper cleanup
        this.disposables.push(saveListener);
        context.subscriptions.push(saveListener);
    }

    /**
     * Handles file save events and triggers conversion for CMind files when appropriate
     * @param document The saved text document
     */
    async onFileSaved(document: vscode.TextDocument): Promise<void> {
        try {
            // Check if auto-conversion is enabled
            if (!this.conversionService.isConversionEnabled()) {
                return;
            }

            // Check if the saved file is a CMind file
            if (!this.isCmindFile(document)) {
                return;
            }

            const filePath = document.uri.fsPath;
            
            // Perform conversion in the background
            await this.performBackgroundConversion(filePath);

        } catch (error) {
            // Handle any unexpected errors during the save event processing
            const errorMessage = this.formatError(error);
            console.error('FileWatcher: Error processing file save event:', errorMessage);
            
            // Show error notification using the notification service
            await this.notificationService.showConversionError(
                document.uri.fsPath, 
                `Auto-conversion failed: ${errorMessage}`, 
                true
            );
        }
    }

    /**
     * Performs the actual conversion in the background without blocking the editor
     * @param filePath Path to the CMind file to convert
     */
    private async performBackgroundConversion(filePath: string): Promise<void> {
        try {
            // Trigger conversion using the conversion service
            const result: ConversionResult = await this.conversionService.convertFile(filePath);
            
            // Handle conversion result
            if (result.success) {
                await this.handleConversionSuccess(result, filePath);
            } else {
                await this.handleConversionError(result, filePath);
            }

        } catch (error) {
            // Handle conversion service errors
            const errorMessage = this.formatError(error);
            await this.handleConversionError(
                { success: false, error: errorMessage },
                filePath
            );
        }
    }

    /**
     * Handles successful conversion results
     * @param result The successful conversion result
     * @param filePath The source file path
     */
    private async handleConversionSuccess(result: ConversionResult, filePath: string): Promise<void> {
        // Show success notification using the notification service (Requirement 2.3)
        await this.notificationService.showConversionSuccess(filePath, result.outputPath!, true);
    }

    /**
     * Handles conversion errors
     * @param result The failed conversion result
     * @param filePath The source file path
     */
    private async handleConversionError(result: ConversionResult, filePath: string): Promise<void> {
        // Show error notification using the notification service (Requirement 2.5)
        const errorMessage = result.error || 'Unknown error occurred';
        await this.notificationService.showConversionError(filePath, errorMessage, true);
    }

    /**
     * Checks if a document is a CMind file based on its file extension
     * @param document The text document to check
     * @returns true if the document is a CMind file, false otherwise
     */
    private isCmindFile(document: vscode.TextDocument): boolean {
        // Check file extension
        const fileExtension = path.extname(document.uri.fsPath);
        return fileExtension === '.cmind';
    }

    /**
     * Formats error messages for user display
     * @param error The error to format
     * @returns A formatted error message string
     */
    private formatError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }

    /**
     * Stops watching for file events and cleans up resources
     */
    dispose(): void {
        // Dispose of all registered event listeners
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
    }
}