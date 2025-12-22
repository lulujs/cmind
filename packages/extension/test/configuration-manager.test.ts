import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigurationManager } from '../src/extension/configuration-manager.js';

// Mock vscode module
vi.mock('vscode', () => ({
    workspace: {
        getConfiguration: vi.fn(() => ({
            get: vi.fn((key: string, defaultValue?: any) => {
                // Return default values for configuration
                if (key === 'autoConvertOnSave') return true;
                if (key === 'outputDirectory') return '';
                if (key === 'showNotifications') return true;
                if (key === 'preview.autoUpdate') return true;
                if (key === 'preview.updateDelay') return 500;
                if (key === 'preview.maxMemoryUsage') return 50;
                if (key === 'preview.enableInteraction') return true;
                if (key === 'preview.theme') return 'default';
                return defaultValue;
            }),
            update: vi.fn()
        })),
        getWorkspaceFolder: vi.fn(),
        onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() }))
    },
    ConfigurationTarget: {
        Global: 1,
        Workspace: 2,
        WorkspaceFolder: 3
    },
    Uri: {
        file: (path: string) => ({ fsPath: path })
    }
}));

describe('ConfigurationManager', () => {
    let configManager: ConfigurationManager;

    beforeEach(() => {
        configManager = new ConfigurationManager();
        vi.clearAllMocks();
    });

    describe('isAutoConvertEnabled', () => {
        it('should return true by default', () => {
            expect(configManager.isAutoConvertEnabled()).toBe(true);
        });
    });

    describe('getOutputDirectory', () => {
        it('should return undefined for empty string', () => {
            expect(configManager.getOutputDirectory()).toBeUndefined();
        });
    });

    describe('shouldShowNotifications', () => {
        it('should return true by default', () => {
            expect(configManager.shouldShowNotifications()).toBe(true);
        });
    });

    describe('getResolvedOutputDirectory', () => {
        it('should return source file directory when no output directory configured', () => {
            const sourceFile = '/path/to/source/file.cmind';
            const result = configManager.getResolvedOutputDirectory(sourceFile);
            expect(result).toBe('/path/to/source');
        });
    });

    describe('getExtensionConfig', () => {
        it('should return complete configuration object', () => {
            const config = configManager.getExtensionConfig();
            expect(config).toEqual({
                autoConvertOnSave: true,
                outputDirectory: undefined,
                showNotifications: true,
                preview: {
                    autoUpdate: true,
                    updateDelay: 500,
                    maxMemoryUsage: 50,
                    enableInteraction: true,
                    theme: 'default'
                }
            });
        });
    });

    describe('validateConfiguration', () => {
        it('should return empty array for valid configuration', () => {
            const errors = configManager.validateConfiguration();
            expect(errors).toEqual([]);
        });
    });
});