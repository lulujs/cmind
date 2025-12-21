import * as vscode from 'vscode';
import * as path from 'node:path';
import { ConversionService } from './conversion-service.js';
import { NotificationService, NotificationType } from './notification-service.js';

/**
 * Handles VSCode commands for manual conversion via context menu.
 * Manages command registration, execution, and user feedback through notifications.
 * 
 * Requirements addressed:
 * - 3.1: Display "Convert to KityMinder KM" option in context menu for CMind files
 * - 3.2: Trigger conversion service when user selects the convert option
 * - 3.3: Display success notification with output file path when conversion completes
 */
export class CommandHandler {
    private static readonly CONVERT_COMMAND = 'cmind.convertToKityMinder';
    
    private readonly conversionService: ConversionService;
    private readonly notificationService: NotificationService;

    constructor(conversionService: ConversionService) {
        this.conversionService = conversionService;
        this.notificationService = conversionService.getNotificationService();
    }

    /**
     * Registers all commands with the VSCode extension context
     * @param context The extension context for command registration
     */
    registerCommands(context: vscode.ExtensionContext): void {
        // Register the convert to KityMinder command
        const convertCommand = vscode.commands.registerCommand(
            CommandHandler.CONVERT_COMMAND,
            (uri?: vscode.Uri) => this.executeConvertCommand(uri)
        );

        context.subscriptions.push(convertCommand);
    }

    /**
     * Executes the convert to KityMinder KM command
     * @param uri Optional URI of the file to convert (from context menu or command palette)
     */
    async executeConvertCommand(uri?: vscode.Uri): Promise<void> {
        try {
            // Determine the file to convert
            const targetFile = await this.getTargetFile(uri);
            if (!targetFile) {
                return; // User cancelled or no valid file
            }

            // Validate file extension
            if (!this.isValidCmindFile(targetFile)) {
                await this.notificationService.showCriticalNotification({
                    type: NotificationType.Error,
                    message: 'Invalid file type. Please select a .cmind file to convert.'
                });
                return;
            }

            // Show progress indicator during conversion
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Converting CMind file to KityMinder KM...',
                    cancellable: false
                },
                async (progress) => {
                    progress.report({ increment: 0, message: 'Starting conversion...' });
                    
                    // Perform the conversion
                    const result = await this.conversionService.convertFile(targetFile);
                    
                    progress.report({ increment: 100, message: 'Conversion complete' });
                    
                    // Handle the result
                    await this.handleConversionResult(result, targetFile);
                }
            );

        } catch (error) {
            await this.notificationService.showCriticalNotification({
                type: NotificationType.Error,
                message: `Unexpected error during conversion: ${this.formatError(error)}`
            });
        }
    }

    /**
     * Determines the target file for conversion
     * @param uri Optional URI from command invocation
     * @returns Path to the file to convert, or undefined if cancelled/invalid
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
            title: 'Select CMind file to convert'
        });

        if (fileUris && fileUris.length > 0) {
            return fileUris[0].fsPath;
        }

        return undefined; // User cancelled
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
     * Handles the result of a conversion operation
     * @param result The conversion result from the service
     * @param sourceFile Path to the source file that was converted
     */
    private async handleConversionResult(result: any, sourceFile: string): Promise<void> {
        if (result.success) {
            await this.notificationService.showConversionSuccess(sourceFile, result.outputPath, false);
        } else {
            await this.notificationService.showConversionError(sourceFile, result.error || 'Unknown error', false);
        }
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
     * Gets the command ID for the convert command
     * @returns The command ID string
     */
    static getConvertCommandId(): string {
        return CommandHandler.CONVERT_COMMAND;
    }
}