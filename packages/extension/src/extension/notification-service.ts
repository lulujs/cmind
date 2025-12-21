import * as vscode from 'vscode';
import * as path from 'node:path';
import { ConfigurationManager } from './configuration-manager.js';

/**
 * Types of notifications that can be displayed
 */
export enum NotificationType {
    Success = 'success',
    Error = 'error',
    Warning = 'warning',
    Info = 'info'
}

/**
 * Configuration for notification display
 */
export interface NotificationConfig {
    type: NotificationType;
    message: string;
    details?: string;
    actions?: NotificationAction[];
    respectUserPreference?: boolean;
}

/**
 * Action that can be taken from a notification
 */
export interface NotificationAction {
    title: string;
    action: () => Promise<void> | void;
}

/**
 * Service that manages all notifications for the CMind extension.
 * Provides consistent notification display with user preference respect.
 * 
 * Requirements addressed:
 * - 2.3: Display success notifications for auto-conversion
 * - 2.5: Display error notifications with details for auto-conversion failures
 * - 3.3: Display success notification with output file path for manual conversion
 * - Respect user notification preferences from settings
 */
export class NotificationService {
    private readonly configManager: ConfigurationManager;

    constructor(configManager: ConfigurationManager) {
        this.configManager = configManager;
    }

    /**
     * Shows a success notification for successful conversion
     * @param sourceFile Path to the source CMind file
     * @param outputFile Path to the generated output file
     * @param isAutoConversion Whether this was triggered by auto-conversion
     */
    async showConversionSuccess(
        sourceFile: string, 
        outputFile: string, 
        isAutoConversion: boolean = false
    ): Promise<void> {
        const sourceFileName = path.basename(sourceFile);
        const outputFileName = path.basename(outputFile);
        
        const message = isAutoConversion 
            ? `Auto-converted: ${sourceFileName} → ${outputFileName}`
            : `Successfully converted to KityMinder JSON: ${outputFileName}`;

        const actions: NotificationAction[] = [
            {
                title: 'Open File',
                action: () => this.openFile(outputFile)
            },
            {
                title: 'Show in Explorer',
                action: () => this.revealInExplorer(outputFile)
            }
        ];

        await this.showNotification({
            type: NotificationType.Success,
            message,
            details: `Output: ${outputFile}`,
            actions,
            respectUserPreference: true
        });
    }

    /**
     * Shows an error notification for conversion failures
     * @param sourceFile Path to the source CMind file that failed to convert
     * @param error The error message or details
     * @param isAutoConversion Whether this was triggered by auto-conversion
     */
    async showConversionError(
        sourceFile: string, 
        error: string, 
        isAutoConversion: boolean = false
    ): Promise<void> {
        const sourceFileName = path.basename(sourceFile);
        
        const message = isAutoConversion
            ? `Auto-conversion failed for ${sourceFileName}`
            : `Conversion failed for ${sourceFileName}`;

        const actions: NotificationAction[] = [
            {
                title: 'Show Details',
                action: () => this.showErrorDetails(error, sourceFile)
            }
        ];

        // For syntax errors, add an action to open the file
        if (error.toLowerCase().includes('syntax') || error.toLowerCase().includes('parser') || error.toLowerCase().includes('validation')) {
            actions.unshift({
                title: 'Open File',
                action: () => this.openFile(sourceFile)
            });
        }

        await this.showNotification({
            type: NotificationType.Error,
            message,
            details: error,
            actions,
            respectUserPreference: true
        });
    }

    /**
     * Shows a warning notification
     * @param message The warning message
     * @param details Optional additional details
     */
    async showWarning(message: string, details?: string): Promise<void> {
        await this.showNotification({
            type: NotificationType.Warning,
            message,
            details,
            respectUserPreference: true
        });
    }

    /**
     * Shows an info notification
     * @param message The info message
     * @param details Optional additional details
     */
    async showInfo(message: string, details?: string): Promise<void> {
        await this.showNotification({
            type: NotificationType.Info,
            message,
            details,
            respectUserPreference: true
        });
    }

    /**
     * Shows a notification that always displays regardless of user preferences
     * Used for critical errors or important system messages
     * @param config The notification configuration
     */
    async showCriticalNotification(config: Omit<NotificationConfig, 'respectUserPreference'>): Promise<void> {
        await this.showNotification({
            ...config,
            respectUserPreference: false
        });
    }

    /**
     * Core notification display method
     * @param config The notification configuration
     */
    private async showNotification(config: NotificationConfig): Promise<void> {
        // Check if notifications are enabled (unless it's a critical notification)
        if (config.respectUserPreference && !this.configManager.shouldShowNotifications()) {
            return;
        }

        const actionTitles = config.actions?.map(action => action.title) || [];
        let selectedAction: string | undefined;

        // Display the appropriate notification type
        switch (config.type) {
            case NotificationType.Success:
                selectedAction = await vscode.window.showInformationMessage(
                    config.message,
                    ...actionTitles
                );
                break;
            case NotificationType.Error:
                selectedAction = await vscode.window.showErrorMessage(
                    config.message,
                    ...actionTitles
                );
                break;
            case NotificationType.Warning:
                selectedAction = await vscode.window.showWarningMessage(
                    config.message,
                    ...actionTitles
                );
                break;
            case NotificationType.Info:
                selectedAction = await vscode.window.showInformationMessage(
                    config.message,
                    ...actionTitles
                );
                break;
        }

        // Execute the selected action if any
        if (selectedAction && config.actions) {
            const action = config.actions.find(a => a.title === selectedAction);
            if (action) {
                try {
                    await action.action();
                } catch (error) {
                    // Show error for failed actions, but don't respect user preference for this
                    await vscode.window.showErrorMessage(
                        `Failed to execute action "${selectedAction}": ${this.formatError(error)}`
                    );
                }
            }
        }
    }

    /**
     * Opens a file in VSCode
     * @param filePath Path to the file to open
     */
    private async openFile(filePath: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document);
        } catch (error) {
            throw new Error(`Failed to open file: ${this.formatError(error)}`);
        }
    }

    /**
     * Reveals a file in the system file explorer
     * @param filePath Path to the file to reveal
     */
    private async revealInExplorer(filePath: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            await vscode.commands.executeCommand('revealFileInOS', uri);
        } catch (error) {
            throw new Error(`Failed to show file in explorer: ${this.formatError(error)}`);
        }
    }

    /**
     * Shows detailed error information in the output channel
     * @param error The error details
     * @param sourceFile The source file that caused the error
     */
    private async showErrorDetails(error: string, sourceFile: string): Promise<void> {
        // Get or create the CMind output channel
        const outputChannel = vscode.window.createOutputChannel('CMind Conversion');
        
        // Format the error details
        const timestamp = new Date().toLocaleString();
        const details = [
            `[${timestamp}] Conversion Error Details`,
            `Source File: ${sourceFile}`,
            `Error: ${error}`,
            '---'
        ].join('\n');
        
        // Show the details in the output channel
        outputChannel.appendLine(details);
        outputChannel.show(true);
    }

    /**
     * Formats error messages for display
     * @param error The error to format
     * @returns Formatted error message
     */
    private formatError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }
}