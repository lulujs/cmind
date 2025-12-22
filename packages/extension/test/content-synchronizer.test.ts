import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContentSynchronizer, type ContentChangeEvent } from '../src/extension/content-synchronizer.js';

// Mock vscode module
vi.mock('vscode', () => {
    const mockDisposable = { dispose: vi.fn() };
    const mockDocument = {
        uri: { fsPath: '/test/file.cmind' },
        languageId: 'cmind',
        fileName: '/test/file.cmind',
        getText: vi.fn(() => 'test content')
    };
    const mockEditor = {
        document: mockDocument
    };

    return {
        workspace: {
            onDidChangeTextDocument: vi.fn(() => mockDisposable),
            onDidCloseTextDocument: vi.fn(() => mockDisposable)
        },
        window: {
            onDidChangeActiveTextEditor: vi.fn(() => mockDisposable),
            onDidChangeVisibleTextEditors: vi.fn(() => mockDisposable),
            activeTextEditor: mockEditor,
            visibleTextEditors: [mockEditor]
        }
    };
});

describe('ContentSynchronizer', () => {
    let contentSynchronizer: ContentSynchronizer;
    let mockCallback: vi.MockedFunction<(event: ContentChangeEvent) => Promise<void>>;
    const mockContext = {
        subscriptions: [] as any[]
    };

    beforeEach(() => {
        contentSynchronizer = new ContentSynchronizer({
            updateDelay: 100, // Shorter delay for testing
            autoUpdate: true
        });
        mockCallback = vi.fn().mockResolvedValue(undefined);
        vi.clearAllMocks();
    });

    afterEach(() => {
        contentSynchronizer.dispose();
    });

    describe('constructor', () => {
        it('should initialize with default configuration', () => {
            const synchronizer = new ContentSynchronizer();
            const config = synchronizer.getConfiguration();
            
            expect(config.updateDelay).toBe(500);
            expect(config.autoUpdate).toBe(true);
        });

        it('should initialize with custom configuration', () => {
            const synchronizer = new ContentSynchronizer({
                updateDelay: 1000,
                autoUpdate: false
            });
            const config = synchronizer.getConfiguration();
            
            expect(config.updateDelay).toBe(1000);
            expect(config.autoUpdate).toBe(false);
        });
    });

    describe('startWatching', () => {
        it('should register event listeners', async () => {
            const { workspace, window } = await import('vscode');
            
            contentSynchronizer.startWatching(mockContext);
            
            expect(workspace.onDidChangeTextDocument).toHaveBeenCalled();
            expect(window.onDidChangeActiveTextEditor).toHaveBeenCalled();
            expect(window.onDidChangeVisibleTextEditors).toHaveBeenCalled();
            expect(workspace.onDidCloseTextDocument).toHaveBeenCalled();
        });
    });

    describe('onContentChanged', () => {
        it('should set the callback function', () => {
            contentSynchronizer.onContentChanged(mockCallback);
            
            // Verify callback is set by triggering a debounced update
            contentSynchronizer.debounceUpdate('/test/file.cmind', 'test content');
            
            // Wait for debounce timeout
            return new Promise<void>((resolve) => {
                setTimeout(() => {
                    expect(mockCallback).toHaveBeenCalledWith({
                        filePath: '/test/file.cmind',
                        content: 'test content',
                        contentHash: expect.any(String),
                        timestamp: expect.any(Date)
                    });
                    resolve();
                }, 150);
            });
        });
    });

    describe('debounceUpdate', () => {
        it('should debounce multiple rapid updates', () => {
            contentSynchronizer.onContentChanged(mockCallback);
            
            // Trigger multiple rapid updates
            contentSynchronizer.debounceUpdate('/test/file.cmind', 'content 1');
            contentSynchronizer.debounceUpdate('/test/file.cmind', 'content 2');
            contentSynchronizer.debounceUpdate('/test/file.cmind', 'content 3');
            
            // Wait for debounce timeout
            return new Promise<void>((resolve) => {
                setTimeout(() => {
                    // Should only be called once with the last content
                    expect(mockCallback).toHaveBeenCalledTimes(1);
                    expect(mockCallback).toHaveBeenCalledWith({
                        filePath: '/test/file.cmind',
                        content: 'content 3',
                        contentHash: expect.any(String),
                        timestamp: expect.any(Date)
                    });
                    resolve();
                }, 150);
            });
        });

        it('should not trigger update when auto-update is disabled', () => {
            const synchronizer = new ContentSynchronizer({ autoUpdate: false });
            synchronizer.onContentChanged(mockCallback);
            
            synchronizer.debounceUpdate('/test/file.cmind', 'test content');
            
            return new Promise<void>((resolve) => {
                setTimeout(() => {
                    expect(mockCallback).not.toHaveBeenCalled();
                    resolve();
                }, 150);
            });
        });
    });

    describe('pauseUpdates and resumeUpdates', () => {
        it('should pause and resume updates for a file', () => {
            contentSynchronizer.onContentChanged(mockCallback);
            
            // Pause updates
            contentSynchronizer.pauseUpdates('/test/file.cmind');
            expect(contentSynchronizer.isUpdatesPaused('/test/file.cmind')).toBe(true);
            
            // Try to trigger update while paused
            contentSynchronizer.debounceUpdate('/test/file.cmind', 'paused content');
            
            return new Promise<void>((resolve) => {
                setTimeout(() => {
                    expect(mockCallback).not.toHaveBeenCalled();
                    
                    // Resume updates
                    contentSynchronizer.resumeUpdates('/test/file.cmind');
                    expect(contentSynchronizer.isUpdatesPaused('/test/file.cmind')).toBe(false);
                    
                    resolve();
                }, 150);
            });
        });
    });

    describe('updateConfiguration', () => {
        it('should update configuration settings', () => {
            contentSynchronizer.updateConfiguration({
                updateDelay: 1000,
                autoUpdate: false
            });
            
            const config = contentSynchronizer.getConfiguration();
            expect(config.updateDelay).toBe(1000);
            expect(config.autoUpdate).toBe(false);
        });
    });

    describe('dispose', () => {
        it('should clean up resources', () => {
            const mockDisposable = { dispose: vi.fn() };
            
            contentSynchronizer.startWatching(mockContext);
            
            // Add some active files and timers
            contentSynchronizer.debounceUpdate('/test/file1.cmind', 'content 1');
            contentSynchronizer.debounceUpdate('/test/file2.cmind', 'content 2');
            
            // Dispose should clean everything up
            contentSynchronizer.dispose();
            
            expect(contentSynchronizer.getActiveFiles().size).toBe(0);
        });
    });
});