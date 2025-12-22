import * as path from 'node:path';
import * as fs from 'node:fs';
import type { MindMap } from 'cmind-language';
import { createCmindServices } from 'cmind-language';
import { NodeFileSystem } from 'langium/node';
import { URI } from 'langium';
import { ConfigurationManager } from './configuration-manager.js';
import { NotificationService } from './notification-service.js';
import { ErrorHandler, DetailedError } from './error-handler.js';

// Import CLI functionality - we'll need to access these from the CLI package
// For now, we'll implement the core functionality directly to avoid complex import issues

/**
 * Custom error class for syntax-related errors in CMind files
 */
export class SyntaxError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SyntaxError';
    }
}

/**
 * Custom error class for file system related errors
 */
export class FileSystemError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FileSystemError';
    }
}

/**
 * Result of a conversion operation
 */
export interface ConversionResult {
    success: boolean;
    outputPath?: string;
    error?: string;
    detailedError?: DetailedError;
}

/**
 * Service that handles CMind to KityMinder KM conversion
 * Integrates with the existing CLI generator functionality
 */
export class ConversionService {
    private readonly services = createCmindServices(NodeFileSystem).Cmind;
    private readonly configManager: ConfigurationManager;
    private readonly notificationService: NotificationService;
    private readonly errorHandler: ErrorHandler;

    constructor(configManager?: ConfigurationManager) {
        this.configManager = configManager || new ConfigurationManager();
        this.notificationService = new NotificationService(this.configManager);
        this.errorHandler = new ErrorHandler();
    }

    /**
     * Converts a CMind file to KityMinder KM format
     * @param filePath Path to the CMind file to convert
     * @param outputDir Optional output directory (defaults to configured directory or same directory as source)
     * @returns Promise resolving to conversion result
     */
    async convertFile(filePath: string, outputDir?: string): Promise<ConversionResult> {
        try {
            // Validate input file exists and has correct extension
            try {
                await fs.promises.access(filePath, fs.constants.R_OK);
            } catch (error) {
                const detailedError = this.errorHandler.processError(error, {
                    filePath,
                    operation: 'file_access_check'
                });
                
                return {
                    success: false,
                    error: `Cannot access file: ${filePath}. ${this.formatFileSystemError(error)}`,
                    detailedError
                };
            }

            const fileExtension = path.extname(filePath);
            if (fileExtension !== '.cmind') {
                const detailedError = this.errorHandler.processError(
                    new Error(`Invalid file extension. Expected .cmind, got ${fileExtension}`),
                    { filePath, operation: 'file_validation' }
                );
                
                return {
                    success: false,
                    error: `Invalid file extension. Expected .cmind, got ${fileExtension}`,
                    detailedError
                };
            }

            // Parse the CMind file using existing CLI functionality
            const model = await this.parseFile(filePath);
            
            // Use provided outputDir or get from configuration
            const resolvedOutputDir = outputDir || this.configManager.getResolvedOutputDirectory(filePath);
            
            // Generate KityMinder KM file
            const outputPath = await this.generateOutput(model, filePath, resolvedOutputDir);
            
            return {
                success: true,
                outputPath
            };

        } catch (error) {
            // Process error with enhanced error handler
            const detailedError = this.errorHandler.processError(error, {
                filePath,
                operation: 'file_conversion'
            });

            // Attempt recovery if possible
            const recovered = await this.errorHandler.attemptRecovery(detailedError, {
                filePath,
                operation: 'file_conversion',
                timestamp: new Date()
            });

            if (recovered) {
                // Retry conversion after recovery
                try {
                    const model = await this.parseFile(filePath);
                    const resolvedOutputDir = outputDir || this.configManager.getResolvedOutputDirectory(filePath);
                    const outputPath = await this.generateOutput(model, filePath, resolvedOutputDir);
                    
                    return {
                        success: true,
                        outputPath
                    };
                } catch (retryError) {
                    const retryDetailedError = this.errorHandler.processError(retryError, {
                        filePath,
                        operation: 'file_conversion_retry',
                        timestamp: new Date()
                    });
                    
                    return {
                        success: false,
                        error: this.errorHandler.formatUserMessage(retryDetailedError),
                        detailedError: retryDetailedError
                    };
                }
            }

            return {
                success: false,
                error: this.errorHandler.formatUserMessage(detailedError),
                detailedError
            };
        }
    }

    /**
     * Checks if auto-conversion is enabled in user settings
     */
    isConversionEnabled(): boolean {
        return this.configManager.isAutoConvertEnabled();
    }

    /**
     * Gets the configured output directory from user settings
     */
    getOutputDirectory(): string | undefined {
        return this.configManager.getOutputDirectory();
    }

    /**
     * Checks if notifications should be shown
     */
    shouldShowNotifications(): boolean {
        return this.configManager.shouldShowNotifications();
    }

    /**
     * Gets the configuration manager instance
     */
    getConfigurationManager(): ConfigurationManager {
        return this.configManager;
    }

    /**
     * Gets the notification service instance
     */
    getNotificationService(): NotificationService {
        return this.notificationService;
    }

    /**
     * Gets the error handler instance
     */
    getErrorHandler(): ErrorHandler {
        return this.errorHandler;
    }

    /**
     * Disposes of resources
     */
    dispose(): void {
        this.errorHandler.dispose();
    }

    /**
     * Parses a CMind file and returns the AST model
     * Adapted from CLI extractAstNode functionality
     * Enhanced with detailed error reporting including line numbers and locations
     * Fixed: Force reload document content to avoid caching issues
     */
    private async parseFile(filePath: string): Promise<MindMap> {
        try {
            // Check file extension
            const extensions = this.services.LanguageMetaData.fileExtensions;
            if (!extensions.includes(path.extname(filePath))) {
                const error = new SyntaxError(`Invalid file extension. Expected one of: ${extensions.join(', ')}, but got: ${path.extname(filePath)}`);
                const processedError = this.errorHandler.processError(error, {
                    filePath,
                    operation: 'file_extension_validation',
                    timestamp: new Date()
                });
                throw new SyntaxError(this.errorHandler.formatUserMessage(processedError));
            }

            // Check file exists and is readable
            try {
                await fs.promises.access(filePath, fs.constants.R_OK);
            } catch (error) {
                const processedError = this.errorHandler.processError(error, {
                    filePath,
                    operation: 'file_access_validation',
                    timestamp: new Date()
                });
                throw new FileSystemError(this.errorHandler.formatUserMessage(processedError));
            }

            // Create URI
            const uri = URI.file(path.resolve(filePath));
            
            // CRITICAL FIX: Force reload the document content to avoid caching issues
            // The Langium document manager caches documents, which causes stale content
            // to be used even after the file has been modified on disk.
            const documents = this.services.shared.workspace.LangiumDocuments;
            
            // Remove any existing cached document for this URI
            const existingDocument = documents.getDocument(uri);
            if (existingDocument) {
                documents.deleteDocument(uri);
            }
            
            // Read the file content directly from disk to ensure we get the latest version
            const fileContent = await fs.promises.readFile(filePath, 'utf-8');
            
            // Create a new document with the fresh content
            const document = documents.createDocument(uri, fileContent);
            
            // Build the document with validation
            await this.services.shared.workspace.DocumentBuilder.build([document], { validation: true });

            // Check for lexer errors with detailed location information
            const lexerErrors = document.parseResult?.lexerErrors ?? [];
            if (lexerErrors.length > 0) {
                const detailedErrors = lexerErrors.map(error => {
                    return this.errorHandler.processError(error, {
                        filePath,
                        operation: 'lexical_analysis',
                        timestamp: new Date()
                    });
                });
                
                const combinedMessage = detailedErrors.map(e => this.errorHandler.formatUserMessage(e)).join('\n');
                throw new SyntaxError(`Lexer errors found:\n${combinedMessage}`);
            }

            // Check for parser errors with detailed location information
            const parserErrors = document.parseResult?.parserErrors ?? [];
            if (parserErrors.length > 0) {
                const detailedErrors = parserErrors.map(error => {
                    return this.errorHandler.processError(error, {
                        filePath,
                        operation: 'syntax_parsing',
                        timestamp: new Date()
                    });
                });
                
                const combinedMessage = detailedErrors.map(e => this.errorHandler.formatUserMessage(e)).join('\n');
                throw new SyntaxError(`Parser errors found:\n${combinedMessage}`);
            }

            // Check for validation errors with detailed location information
            const validationErrors = (document.diagnostics ?? []).filter(e => e.severity === 1);
            if (validationErrors.length > 0) {
                const detailedErrors = validationErrors.map(error => {
                    return this.errorHandler.processError(error, {
                        filePath,
                        operation: 'semantic_validation',
                        timestamp: new Date()
                    });
                });
                
                const combinedMessage = detailedErrors.map(e => this.errorHandler.formatUserMessage(e)).join('\n');
                throw new SyntaxError(`Validation errors found:\n${combinedMessage}`);
            }

            const parseResult = document.parseResult?.value;
            if (!parseResult) {
                const error = new SyntaxError('Failed to parse document: No parse result available');
                const processedError = this.errorHandler.processError(error, {
                    filePath,
                    operation: 'parse_result_extraction',
                    timestamp: new Date()
                });
                throw new SyntaxError(this.errorHandler.formatUserMessage(processedError));
            }

            return parseResult as MindMap;
        } catch (error) {
            // Re-throw processed errors to preserve their enhanced information
            if (error instanceof Error && error.name === 'DetailedError') {
                throw error;
            }
            
            // Process and re-throw other errors
            const processedError = this.errorHandler.processError(error, {
                filePath,
                operation: 'file_parsing',
                timestamp: new Date()
            });
            
            throw new Error(this.errorHandler.formatUserMessage(processedError));
        }
    }

    /**
     * Generates the KityMinder KM output file
     * Adapted from CLI generator functionality
     * Enhanced with comprehensive file system error handling
     */
    private async generateOutput(model: MindMap, filePath: string, outputDir: string): Promise<string> {
        try {
            // Determine output file name
            const baseName = path.basename(filePath, path.extname(filePath));
            const outputPath = path.join(outputDir, `${baseName}.km`);
            
            // Create output directory if it doesn't exist (Requirement 5.3)
            try {
                await fs.promises.mkdir(outputDir, { recursive: true });
            } catch (error) {
                const processedError = this.errorHandler.processError(error, {
                    filePath,
                    operation: 'output_directory_creation',
                    timestamp: new Date()
                });
                throw new FileSystemError(this.errorHandler.formatUserMessage(processedError));
            }

            // Check if we can write to the output directory
            try {
                await fs.promises.access(outputDir, fs.constants.W_OK);
            } catch (error) {
                const processedError = this.errorHandler.processError(error, {
                    filePath,
                    operation: 'output_directory_access',
                    timestamp: new Date()
                });
                throw new FileSystemError(this.errorHandler.formatUserMessage(processedError));
            }

            // Generate KityMinder KM content
            const kityMinderJson = this.generateKityMinderJson(model);
            const content = JSON.stringify(kityMinderJson, null, 4);
            
            // Write to temporary file first to avoid corrupting existing files on failure (Requirement 5.4)
            const tempPath = `${outputPath}.tmp`;
            try {
                await fs.promises.writeFile(tempPath, content, 'utf-8');
                
                // Atomic move from temp to final location
                await fs.promises.rename(tempPath, outputPath);
                
                return outputPath;
            } catch (error) {
                // Clean up temp file if it exists
                try {
                    await fs.promises.unlink(tempPath);
                } catch {
                    // Ignore cleanup errors
                }
                
                const processedError = this.errorHandler.processError(error, {
                    filePath,
                    operation: 'output_file_write',
                    timestamp: new Date()
                });
                throw new FileSystemError(this.errorHandler.formatUserMessage(processedError));
            }
            
        } catch (error) {
            // Re-throw FileSystemError as-is, process others
            if (error instanceof FileSystemError) {
                throw error;
            }
            
            const processedError = this.errorHandler.processError(error, {
                filePath,
                operation: 'output_generation',
                timestamp: new Date()
            });
            throw new Error(this.errorHandler.formatUserMessage(processedError));
        }
    }

    /**
     * Generates KityMinder KM content from a parsed MindMap AST
     * Adapted from CLI generator functionality
     */
    private generateKityMinderJson(model: MindMap): any {
        return {
            root: this.convertRootNode(model.root),
            template: this.getTemplate(model.metadata),
            theme: this.getTheme(model.metadata),
            version: '1.4.43'
        };
    }

    /**
     * Converts a RootNode to KityMinder node format
     */
    private convertRootNode(root: any): any {
        const flatNodes = this.flattenChildNodes(root.children);
        const children = this.buildTreeFromFlatNodes(flatNodes);

        const rootId = root.idAttr?.value || this.generateId();

        return {
            data: {
                id: rootId,
                created: Date.now(),
                text: root.text.trim(),
            },
            children,
        };
    }

    /**
     * Flattens child nodes and rebuilds tree based on indentation
     */
    private flattenChildNodes(nodes: any[]): any[] {
        const result: any[] = [];
        
        const collectNodes = (nodeList: any[]): void => {
            for (const node of nodeList) {
                result.push({
                    text: node.text,
                    attributes: node.attributes,
                    indentLevel: this.getIndentLevel(node),
                    explicitId: this.getExplicitId(node.attributes),
                });
                if (node.children && node.children.length > 0) {
                    collectNodes(node.children);
                }
            }
        };
        
        collectNodes(nodes);
        return result;
    }

    /**
     * Builds tree structure from flat nodes based on indentation
     */
    private buildTreeFromFlatNodes(flatNodes: any[]): any[] {
        if (flatNodes.length === 0) {
            return [];
        }

        const result: any[] = [];
        const stack: Array<{ level: number; node: any }> = [];

        for (const flatNode of flatNodes) {
            const kmNode = this.convertFlatNode(flatNode);
            const level = flatNode.indentLevel;

            while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                stack.pop();
            }

            if (stack.length === 0) {
                result.push(kmNode);
            } else {
                stack[stack.length - 1].node.children.push(kmNode);
            }

            stack.push({ level, node: kmNode });
        }

        return result;
    }

    /**
     * Converts a flat node to KityMinder node format
     */
    private convertFlatNode(flatNode: any): any {
        const attributeData = this.mapAttributes(flatNode.attributes);
        
        return {
            data: {
                id: flatNode.explicitId || this.generateId(),
                created: Date.now(),
                text: flatNode.text.trim(),
                ...attributeData,
            },
            children: [],
        };
    }

    /**
     * Maps AST attributes to KityMinder node data fields
     */
    private mapAttributes(attributes: any[]): any {
        const result: any = {};
        
        for (const attr of attributes) {
            if (attr.$type === 'PriorityAttribute') {
                result.priority = String(attr.value);
            } else if (attr.$type === 'ProgressAttribute') {
                result.progress = attr.value;
            } else if (attr.$type === 'BoldAttribute') {
                result['font-weight'] = 'bold';
            } else if (attr.$type === 'ItalicAttribute') {
                result['font-style'] = 'italic';
            }
        }
        
        return result;
    }

    /**
     * Gets indentation level from node CST information
     */
    private getIndentLevel(node: any): number {
        const cstNode = node.$cstNode;
        if (!cstNode) {
            return 1;
        }

        const document = cstNode.root;
        const text = document.text;
        
        const startOffset = cstNode.offset;
        const lineStart = text.lastIndexOf('\n', startOffset - 1) + 1;
        const lineEnd = text.indexOf('\n', startOffset);
        const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
        
        const leadingWhitespace = line.match(/^[\t ]*/)?.[0] || '';
        const spaces = (leadingWhitespace.match(/ /g) || []).length;
        const tabs = (leadingWhitespace.match(/\t/g) || []).length;
        
        return Math.floor(spaces / 2) + tabs;
    }

    /**
     * Extracts explicit ID from attributes
     */
    private getExplicitId(attributes: any[]): string | undefined {
        for (const attr of attributes) {
            if (attr.$type === 'IdAttribute') {
                return attr.value;
            }
        }
        return undefined;
    }

    /**
     * Extracts template from metadata
     */
    private getTemplate(metadata: any[]): string {
        for (const meta of metadata) {
            if (meta.$type === 'TemplateMetadata') {
                return meta.value;
            }
        }
        return 'right';
    }

    /**
     * Extracts theme from metadata
     */
    private getTheme(metadata: any[]): string {
        for (const meta of metadata) {
            if (meta.$type === 'ThemeMetadata') {
                return meta.value;
            }
        }
        return 'fresh-blue';
    }

    /**
     * Generates a random ID similar to KityMinder format
     */
    private generateId(): string {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 12; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Formats error messages for user display
     */
    private formatError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }

    /**
     * Formats file system error messages with more user-friendly descriptions
     */
    private formatFileSystemError(error: unknown): string {
        if (error && typeof error === 'object' && 'code' in error) {
            const fsError = error as { code: string; path?: string };
            switch (fsError.code) {
                case 'ENOENT':
                    return `File or directory not found${fsError.path ? `: ${fsError.path}` : ''}`;
                case 'EACCES':
                case 'EPERM':
                    return `Permission denied${fsError.path ? ` for: ${fsError.path}` : ''}`;
                case 'ENOSPC':
                    return 'No space left on device';
                case 'EMFILE':
                case 'ENFILE':
                    return 'Too many open files';
                case 'ENOTDIR':
                    return `Not a directory${fsError.path ? `: ${fsError.path}` : ''}`;
                case 'EISDIR':
                    return `Is a directory${fsError.path ? `: ${fsError.path}` : ''}`;
                case 'EEXIST':
                    return `File already exists${fsError.path ? `: ${fsError.path}` : ''}`;
                default:
                    return this.formatError(error);
            }
        }
        return this.formatError(error);
    }
}