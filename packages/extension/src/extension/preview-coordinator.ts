import * as vscode from 'vscode';
import * as fs from 'node:fs';
import { ContentSynchronizer, ContentChangeEvent } from './content-synchronizer.js';
import { PreviewPanelManager } from './preview-panel-manager.js';
import { ConversionService } from './conversion-service.js';
import { MemoryCacheService } from './memory-cache-service.js';

/**
 * Coordinates between content synchronizer, preview panel manager, and conversion service
 * to provide seamless loading states and error handling for preview functionality.
 * 
 * Handles:
 * - Loading indicators during conversion
 * - Empty file detection and placeholder display
 * - Error state management
 * - Progress tracking for conversion operations
 * 
 * Requirements addressed:
 * - 5.3: Show loading indicator during conversion
 * - 5.4: Display helpful placeholder message for empty files
 */
export class PreviewCoordinator {
    private readonly contentSynchronizer: ContentSynchronizer;
    private readonly previewPanelManager: PreviewPanelManager;
    private readonly conversionService: ConversionService;
    private readonly memoryCacheService: MemoryCacheService;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        contentSynchronizer: ContentSynchronizer,
        previewPanelManager: PreviewPanelManager,
        conversionService: ConversionService,
        memoryCacheService: MemoryCacheService
    ) {
        this.contentSynchronizer = contentSynchronizer;
        this.previewPanelManager = previewPanelManager;
        this.conversionService = conversionService;
        this.memoryCacheService = memoryCacheService;
        
        this.setupContentSynchronization();
        this.setupVisibilityHandling();
    }

    /**
     * Sets up content synchronization between editor and preview
     */
    private setupContentSynchronization(): void {
        this.contentSynchronizer.onContentChanged(async (event: ContentChangeEvent) => {
            await this.handleContentChange(event);
        });
    }

    /**
     * Sets up visibility change handling to pause/resume updates
     * 
     * Implements Requirement 6.3: Pause automatic updates when preview is not visible
     */
    private setupVisibilityHandling(): void {
        this.previewPanelManager.onVisibilityChanged((filePath: string, isVisible: boolean) => {
            if (isVisible) {
                // Resume updates when panel becomes visible
                this.contentSynchronizer.resumeUpdates(filePath);
            } else {
                // Pause updates when panel is hidden
                this.contentSynchronizer.pauseUpdates(filePath);
            }
        });
    }

    /**
     * Handles content change events from the content synchronizer
     * 
     * @param event Content change event
     */
    private async handleContentChange(event: ContentChangeEvent): Promise<void> {
        const { filePath, content, contentHash } = event;

        try {
            // Check if preview panel exists for this file
            if (!this.previewPanelManager.isPreviewOpen(filePath)) {
                return; // No preview to update
            }

            // Check if content is empty
            if (this.isEmptyContent(content)) {
                await this.previewPanelManager.showEmptyPlaceholder(filePath);
                return;
            }

            // Check cache first
            const cachedData = this.memoryCacheService.get(filePath, contentHash);
            if (cachedData) {
                await this.previewPanelManager.updatePreviewContent(filePath, cachedData, contentHash);
                return;
            }

            // Show loading indicator
            await this.previewPanelManager.showLoading(filePath, {
                message: 'Converting CMind file...',
                stage: 'Parsing syntax'
            });

            // Update progress - parsing stage
            await this.previewPanelManager.updateLoadingProgress(filePath, {
                message: 'Converting CMind file...',
                stage: 'Parsing syntax',
                percentage: 25
            });

            // Convert content using memory-based conversion
            const conversionResult = await this.convertContentInMemory(filePath, content);

            if (conversionResult.success && conversionResult.data) {
                // Update progress - caching stage
                await this.previewPanelManager.updateLoadingProgress(filePath, {
                    message: 'Converting CMind file...',
                    stage: 'Caching result',
                    percentage: 75
                });

                // Cache the result
                this.memoryCacheService.set(filePath, contentHash, conversionResult.data);

                // Update progress - rendering stage
                await this.previewPanelManager.updateLoadingProgress(filePath, {
                    message: 'Converting CMind file...',
                    stage: 'Rendering mind map',
                    percentage: 90
                });

                // Update preview with successful content
                await this.previewPanelManager.updatePreviewContent(filePath, conversionResult.data, contentHash);
            } else {
                // Handle conversion error
                const error = conversionResult.detailedError || {
                    message: conversionResult.error || 'Conversion failed',
                    type: 'conversion' as const,
                    severity: 'error' as const
                };

                await this.previewPanelManager.updatePreviewContent(filePath, error, contentHash);
            }

        } catch (error) {
            // Handle unexpected errors
            const processedError = this.conversionService.getErrorHandler().processError(error, {
                filePath,
                operation: 'preview_update'
            });

            await this.previewPanelManager.updatePreviewContent(filePath, processedError, contentHash);
        }
    }

    /**
     * Converts content in memory without writing to disk
     * 
     * @param filePath Original file path for context
     * @param content File content to convert
     * @returns Conversion result with KityMinder data
     */
    private async convertContentInMemory(filePath: string, content: string): Promise<{
        success: boolean;
        data?: any;
        error?: string;
        detailedError?: any;
    }> {
        try {
            // Create a temporary file for conversion with .cmind extension
            // Note: This is a simplified approach - in a real implementation,
            // we would want to convert directly from memory without temp files
            const tempFilePath = `${filePath}.preview.cmind`;
            
            try {
                await fs.promises.writeFile(tempFilePath, content, 'utf-8');
                
                // Use existing conversion service
                const result = await this.conversionService.convertFile(tempFilePath);
                
                if (result.success && result.outputPath) {
                    // Read the converted content
                    const kmContent = await fs.promises.readFile(result.outputPath, 'utf-8');
                    const kmData = JSON.parse(kmContent);
                    
                    // Clean up temp files
                    await fs.promises.unlink(tempFilePath);
                    await fs.promises.unlink(result.outputPath);
                    
                    return {
                        success: true,
                        data: kmData
                    };
                } else {
                    // Clean up temp file
                    try {
                        await fs.promises.unlink(tempFilePath);
                    } catch {
                        // Ignore cleanup errors
                    }
                    
                    return {
                        success: false,
                        error: result.error,
                        detailedError: result.detailedError
                    };
                }
            } catch (error) {
                // Clean up temp file
                try {
                    await fs.promises.unlink(tempFilePath);
                } catch {
                    // Ignore cleanup errors
                }
                throw error;
            }
            
        } catch (error) {
            const processedError = this.conversionService.getErrorHandler().processError(error, {
                filePath,
                operation: 'memory_conversion'
            });
            
            return {
                success: false,
                error: this.conversionService.getErrorHandler().formatUserMessage(processedError),
                detailedError: processedError
            };
        }
    }

    /**
     * Checks if content is effectively empty
     * 
     * @param content File content to check
     * @returns True if content is empty or only whitespace
     */
    private isEmptyContent(content: string): boolean {
        return !content || content.trim().length === 0;
    }

    /**
     * Handles preview panel creation for a file
     * 
     * @param filePath Path to the CMind file
     */
    async handlePreviewCreated(filePath: string): Promise<void> {
        // Get current content from active editor
        const editor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.fsPath === filePath
        );

        if (editor) {
            const content = editor.document.getText();
            const contentHash = MemoryCacheService.generateContentHash(content);
            
            // Trigger content change handling
            await this.handleContentChange({
                filePath,
                content,
                contentHash,
                timestamp: new Date()
            });
        } else {
            // Show placeholder if no editor is available
            await this.previewPanelManager.showPlaceholder(filePath, {
                title: 'Preview Ready',
                message: 'Open a CMind file to see the preview.',
                icon: '📄'
            });
        }
    }

    /**
     * Handles preview panel closure for a file
     * 
     * @param filePath Path to the CMind file
     */
    handlePreviewClosed(filePath: string): void {
        // Clear loading state
        this.previewPanelManager.clearLoadingState(filePath);
        
        // Remove from cache
        this.memoryCacheService.remove(filePath);
    }

    /**
     * Forces refresh of preview for a file
     * 
     * @param filePath Path to the CMind file
     */
    async refreshPreview(filePath: string): Promise<void> {
        // Clear cache to force regeneration
        this.memoryCacheService.remove(filePath);
        
        // Get current content and trigger update
        const editor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.fsPath === filePath
        );

        if (editor) {
            const content = editor.document.getText();
            const contentHash = MemoryCacheService.generateContentHash(content);
            
            await this.handleContentChange({
                filePath,
                content,
                contentHash,
                timestamp: new Date()
            });
        }
    }

    /**
     * Disposes of all resources
     */
    dispose(): void {
        console.log('PreviewCoordinator: Starting disposal process');
        
        try {
            // Dispose of event listeners
            console.log(`PreviewCoordinator: Disposing ${this.disposables.length} event listeners`);
            for (const disposable of this.disposables) {
                try {
                    disposable.dispose();
                } catch (error) {
                    console.error('Error disposing event listener:', error);
                }
            }
            this.disposables.length = 0;
            
            console.log('PreviewCoordinator: Disposal completed successfully');
            
        } catch (error) {
            console.error('Error during PreviewCoordinator disposal:', error);
        }
    }
}