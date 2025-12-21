import * as vscode from 'vscode';
import * as path from 'node:path';

/**
 * Configuration interface for the CMind extension
 */
export interface ExtensionConfig {
    autoConvertOnSave: boolean;
    outputDirectory?: string;
    showNotifications: boolean;
}

/**
 * Manages extension settings and user preferences for the CMind VSCode extension.
 * Provides type-safe access to configuration values with validation and default handling.
 * 
 * Requirements addressed:
 * - 4.1: Enable/disable auto-conversion on save
 * - 4.2: Specify output directory for generated files
 * - 4.3: Use same directory as source when output directory not specified
 * - 4.4: Show/hide conversion notifications
 */
export class ConfigurationManager {
    private static readonly CONFIGURATION_SECTION = 'cmind';
    
    /**
     * Gets the current configuration for the CMind extension
     */
    private getConfiguration(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(ConfigurationManager.CONFIGURATION_SECTION);
    }

    /**
     * Checks if auto-conversion on save is enabled
     * @returns true if auto-conversion is enabled, false otherwise
     */
    isAutoConvertEnabled(): boolean {
        const config = this.getConfiguration();
        return config.get<boolean>('autoConvertOnSave', true);
    }

    /**
     * Gets the configured output directory for generated files
     * @returns The output directory path, or undefined if not specified (use source directory)
     */
    getOutputDirectory(): string | undefined {
        const config = this.getConfiguration();
        const outputDir = config.get<string>('outputDirectory', '');
        
        // Return undefined for empty strings to indicate "use source directory"
        const trimmed = outputDir.trim();
        return trimmed === '' ? undefined : trimmed;
    }

    /**
     * Gets the resolved output directory for a given source file
     * @param sourceFilePath Path to the source CMind file
     * @returns The directory where output files should be placed
     */
    getResolvedOutputDirectory(sourceFilePath: string): string {
        const configuredDir = this.getOutputDirectory();
        
        if (configuredDir) {
            // If configured directory is relative, resolve it relative to workspace root
            if (path.isAbsolute(configuredDir)) {
                return configuredDir;
            } else {
                const workspaceFolder = this.getWorkspaceFolder(sourceFilePath);
                if (workspaceFolder) {
                    return path.resolve(workspaceFolder.uri.fsPath, configuredDir);
                } else {
                    // Fallback: resolve relative to source file directory
                    return path.resolve(path.dirname(sourceFilePath), configuredDir);
                }
            }
        }
        
        // Default: use same directory as source file
        return path.dirname(sourceFilePath);
    }

    /**
     * Checks if conversion notifications should be shown to the user
     * @returns true if notifications should be shown, false otherwise
     */
    shouldShowNotifications(): boolean {
        const config = this.getConfiguration();
        return config.get<boolean>('showNotifications', true);
    }

    /**
     * Gets the complete extension configuration as a typed object
     * @returns The current extension configuration
     */
    getExtensionConfig(): ExtensionConfig {
        return {
            autoConvertOnSave: this.isAutoConvertEnabled(),
            outputDirectory: this.getOutputDirectory(),
            showNotifications: this.shouldShowNotifications()
        };
    }

    /**
     * Validates the current configuration and returns any validation errors
     * @returns Array of validation error messages, empty if configuration is valid
     */
    validateConfiguration(): string[] {
        const errors: string[] = [];
        const config = this.getConfiguration();
        
        // Validate output directory if specified
        const outputDir = config.get<string>('outputDirectory', '');
        if (outputDir.trim() !== '') {
            try {
                // Check if the path contains invalid characters
                path.parse(outputDir);
                
                // Check if it's a valid directory path (not a file)
                if (path.extname(outputDir) !== '') {
                    errors.push('Output directory should be a directory path, not a file path');
                }
            } catch (error) {
                errors.push(`Invalid output directory path: ${outputDir}`);
            }
        }

        // Validate boolean settings
        const autoConvert = config.get('autoConvertOnSave');
        if (autoConvert !== undefined && typeof autoConvert !== 'boolean') {
            errors.push('autoConvertOnSave must be a boolean value');
        }

        const showNotifications = config.get('showNotifications');
        if (showNotifications !== undefined && typeof showNotifications !== 'boolean') {
            errors.push('showNotifications must be a boolean value');
        }

        return errors;
    }

    /**
     * Updates a configuration setting
     * @param key The configuration key to update
     * @param value The new value
     * @param target The configuration target (global, workspace, or workspace folder)
     */
    async updateConfiguration<T>(
        key: keyof ExtensionConfig, 
        value: T, 
        target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
    ): Promise<void> {
        const config = this.getConfiguration();
        await config.update(key, value, target);
    }

    /**
     * Resets all configuration settings to their default values
     * @param target The configuration target to reset
     */
    async resetConfiguration(target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace): Promise<void> {
        const config = this.getConfiguration();
        
        await config.update('autoConvertOnSave', undefined, target);
        await config.update('outputDirectory', undefined, target);
        await config.update('showNotifications', undefined, target);
    }

    /**
     * Gets the workspace folder for a given file path
     * @param filePath Path to the file
     * @returns The workspace folder containing the file, or undefined if not in a workspace
     */
    private getWorkspaceFolder(filePath: string): vscode.WorkspaceFolder | undefined {
        const uri = vscode.Uri.file(filePath);
        return vscode.workspace.getWorkspaceFolder(uri);
    }

    /**
     * Registers configuration change listeners
     * @param callback Function to call when configuration changes
     * @returns Disposable to unregister the listener
     */
    onConfigurationChanged(callback: (config: ExtensionConfig) => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration(ConfigurationManager.CONFIGURATION_SECTION)) {
                callback(this.getExtensionConfig());
            }
        });
    }
}