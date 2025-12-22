import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryCacheService, type KityMinderData } from '../src/extension/memory-cache-service.js';

describe('MemoryCacheService', () => {
    let cacheService: MemoryCacheService;
    
    const sampleData: KityMinderData = {
        root: {
            data: { id: 'root1', text: 'Root Node', created: Date.now() },
            children: []
        },
        template: 'right',
        theme: 'fresh-blue',
        version: '1.4.43'
    };

    beforeEach(() => {
        cacheService = new MemoryCacheService(1); // 1MB limit for testing
    });

    describe('basic cache operations', () => {
        it('should return null for non-existent cache entries', () => {
            const result = cacheService.get('/test/file.cmind', 'hash123');
            expect(result).toBeNull();
        });

        it('should store and retrieve cache entries', () => {
            const filePath = '/test/file.cmind';
            const contentHash = 'hash123';
            
            cacheService.set(filePath, contentHash, sampleData);
            const result = cacheService.get(filePath, contentHash);
            
            expect(result).toEqual(sampleData);
        });

        it('should return null for different content hash', () => {
            const filePath = '/test/file.cmind';
            
            cacheService.set(filePath, 'hash123', sampleData);
            const result = cacheService.get(filePath, 'hash456');
            
            expect(result).toBeNull();
        });
    });

    describe('file-based removal', () => {
        it('should remove all entries for a specific file', () => {
            const filePath = '/test/file.cmind';
            
            cacheService.set(filePath, 'hash1', sampleData);
            cacheService.set(filePath, 'hash2', sampleData);
            cacheService.set('/other/file.cmind', 'hash3', sampleData);
            
            cacheService.remove(filePath);
            
            expect(cacheService.get(filePath, 'hash1')).toBeNull();
            expect(cacheService.get(filePath, 'hash2')).toBeNull();
            expect(cacheService.get('/other/file.cmind', 'hash3')).toEqual(sampleData);
        });
    });

    describe('cache statistics', () => {
        it('should track hit and miss counts', () => {
            const filePath = '/test/file.cmind';
            const contentHash = 'hash123';
            
            // Miss
            cacheService.get(filePath, contentHash);
            
            // Set and hit
            cacheService.set(filePath, contentHash, sampleData);
            cacheService.get(filePath, contentHash);
            
            const stats = cacheService.getStatistics();
            expect(stats.hitCount).toBe(1);
            expect(stats.missCount).toBe(1);
            expect(stats.hitRate).toBe(0.5);
        });

        it('should track total entries and memory usage', () => {
            cacheService.set('/test/file1.cmind', 'hash1', sampleData);
            cacheService.set('/test/file2.cmind', 'hash2', sampleData);
            
            const stats = cacheService.getStatistics();
            expect(stats.totalEntries).toBe(2);
            expect(stats.totalMemoryUsage).toBeGreaterThan(0);
        });
    });

    describe('memory management', () => {
        it('should calculate memory usage', () => {
            cacheService.set('/test/file.cmind', 'hash123', sampleData);
            
            const memoryUsage = cacheService.getMemoryUsage();
            expect(memoryUsage).toBeGreaterThan(0);
        });

        it('should clear all cache data', () => {
            cacheService.set('/test/file1.cmind', 'hash1', sampleData);
            cacheService.set('/test/file2.cmind', 'hash2', sampleData);
            
            cacheService.clear();
            
            expect(cacheService.get('/test/file1.cmind', 'hash1')).toBeNull();
            expect(cacheService.get('/test/file2.cmind', 'hash2')).toBeNull();
            expect(cacheService.getMemoryUsage()).toBe(0);
            
            const stats = cacheService.getStatistics();
            expect(stats.totalEntries).toBe(0);
            // After clear, the get calls above will increment miss count
            expect(stats.hitCount).toBe(0);
            expect(stats.missCount).toBe(2); // Two get calls after clear
        });
    });

    describe('content hashing', () => {
        it('should generate consistent hashes for same content', () => {
            const content = 'test content';
            const hash1 = MemoryCacheService.generateContentHash(content);
            const hash2 = MemoryCacheService.generateContentHash(content);
            
            expect(hash1).toBe(hash2);
            expect(hash1).toHaveLength(64); // SHA-256 hex length
        });

        it('should generate different hashes for different content', () => {
            const hash1 = MemoryCacheService.generateContentHash('content1');
            const hash2 = MemoryCacheService.generateContentHash('content2');
            
            expect(hash1).not.toBe(hash2);
        });
    });

    describe('LRU eviction', () => {
        it('should evict least recently used entries when memory limit exceeded', () => {
            // Create a cache that can hold approximately 1.5 entries
            // Each entry is roughly 1KB, so we set limit to 1.5KB
            const smallCache = new MemoryCacheService(0.0015); // 1.5KB limit
            
            // Create data that will be approximately 1KB each
            const largeData1 = {
                ...sampleData,
                root: {
                    ...sampleData.root,
                    data: {
                        ...sampleData.root.data,
                        text: 'X'.repeat(200) // ~1KB after JSON stringification and overhead
                    }
                }
            };
            
            const largeData2 = {
                ...sampleData,
                root: {
                    ...sampleData.root,
                    data: {
                        ...sampleData.root.data,
                        text: 'Y'.repeat(200)
                    }
                }
            };
            
            // Add first entry
            smallCache.set('/test/file1.cmind', 'hash1', largeData1);
            
            // Add second entry - should trigger eviction of first
            smallCache.set('/test/file2.cmind', 'hash2', largeData2);
            
            // Check that eviction occurred
            const stats = smallCache.getStatistics();
            expect(stats.evictionCount).toBeGreaterThan(0);
            
            // First entry should be evicted, second should remain
            expect(smallCache.get('/test/file1.cmind', 'hash1')).toBeNull();
            expect(smallCache.get('/test/file2.cmind', 'hash2')).not.toBeNull();
        });

        it('should update access order when entries are accessed', () => {
            // Create a cache that can hold approximately 2 entries
            const smallCache = new MemoryCacheService(0.003); // 3KB limit
            
            const largeData1 = {
                ...sampleData,
                root: {
                    ...sampleData.root,
                    data: {
                        ...sampleData.root.data,
                        text: 'A'.repeat(200)
                    }
                }
            };
            
            const largeData2 = {
                ...sampleData,
                root: {
                    ...sampleData.root,
                    data: {
                        ...sampleData.root.data,
                        text: 'B'.repeat(200)
                    }
                }
            };
            
            const largeData3 = {
                ...sampleData,
                root: {
                    ...sampleData.root,
                    data: {
                        ...sampleData.root.data,
                        text: 'C'.repeat(200)
                    }
                }
            };
            
            // Add two entries (should fit in cache)
            smallCache.set('/test/file1.cmind', 'hash1', largeData1);
            smallCache.set('/test/file2.cmind', 'hash2', largeData2);
            
            // Both should be present
            expect(smallCache.get('/test/file1.cmind', 'hash1')).not.toBeNull();
            expect(smallCache.get('/test/file2.cmind', 'hash2')).not.toBeNull();
            
            // Access first entry again to make it more recently used
            smallCache.get('/test/file1.cmind', 'hash1');
            
            // Add third entry which should evict the second (least recently used)
            smallCache.set('/test/file3.cmind', 'hash3', largeData3);
            
            const stats = smallCache.getStatistics();
            expect(stats.evictionCount).toBeGreaterThan(0);
            
            // First and third should remain, second should be evicted
            expect(smallCache.get('/test/file1.cmind', 'hash1')).not.toBeNull();
            expect(smallCache.get('/test/file2.cmind', 'hash2')).toBeNull();
            expect(smallCache.get('/test/file3.cmind', 'hash3')).not.toBeNull();
        });
    });
});