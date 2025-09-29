import { 
  VectorSearchResult, 
  SearchOptions,
  RetrievalError,
  DimensionMismatchError 
} from '../types';
import { AbstractVectorStore, VectorStoreMetrics } from '../AbstractVectorStore';
import { VectorStoreConfig, VectorStorePerformanceConfig } from '../VectorStoreConfig';
import { SimilarityCalculator } from '../similarity';
import { DatabaseService } from '../../database/services/DatabaseService';
import type { DatabaseManager } from '../../database/core/DatabaseManager';

/**
 * 优化的SQLite向量存储实现
 * 提供高性能的向量存储和检索功能
 * 使用新的DatabaseService替代旧的队列系统
 */
export class OptimizedSQLiteVectorStore extends AbstractVectorStore {
  private dbManager!: DatabaseManager;
  private tableName: string;
  private indexName: string;
  private lastVacuumTime: number = 0;

  constructor(config: VectorStoreConfig, performanceConfig: VectorStorePerformanceConfig) {
    super(config, performanceConfig);
    this.tableName = config.sqlite?.tableName || 'vector_embeddings';
    this.indexName = `idx_${this.tableName}_optimized`;
  }

  protected async initializeStore(): Promise<void> {
    try {
      // 使用新的DatabaseService获取数据库管理器
      const dbService = DatabaseService.getInstance();
      this.dbManager = dbService.getDbManager();
      
      await this.setupDatabase();
      await this.createOptimizedTable();
      await this.createIndexes();
      await this.optimizePragmaSettings();
      console.log(`优化的SQLite向量存储已初始化: ${this.tableName}`);
    } catch (error) {
      throw new RetrievalError(
        `初始化SQLite向量存储失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }

  private async setupDatabase(): Promise<void> {
    const sqlite = this.config.sqlite!;
    
    try {
      // 使用DatabaseService的优化设置，这些设置已经在DatabaseManager中配置
      console.log('数据库并发参数已由DatabaseService配置');
      
      // 验证数据库连接
      const testResult = await this.dbManager.select('SELECT 1 as test');
      if (!testResult || testResult[0]?.test !== 1) {
        throw new Error('数据库连接验证失败');
      }
      
      console.log('向量存储数据库连接验证成功');
    } catch (error) {
      console.error('❌ 向量存储数据库设置失败:', error);
      throw error;
    }
  }

  private async optimizePragmaSettings(): Promise<void> {
    // DatabaseService已经设置了大部分优化参数
    // 这里只设置向量存储特有的优化
    try {
      console.log('SQLite性能优化已由DatabaseService配置');
    } catch (error) {
      console.warn('部分SQLite优化设置失败:', error);
      // 不抛出错误，因为这些是优化设置，失败不应阻止运行
    }
  }

  private async createOptimizedTable(): Promise<void> {
    await this.dbManager.execute(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding BLOB NOT NULL,
        metadata TEXT DEFAULT '{}',
        dimension INTEGER NOT NULL,
        norm REAL,
        content_hash TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        is_deleted INTEGER DEFAULT 0
      )
    `);

    // 添加触发器自动更新时间戳
    await this.dbManager.execute(`
      CREATE TRIGGER IF NOT EXISTS ${this.tableName}_update_timestamp
      AFTER UPDATE ON ${this.tableName}
      BEGIN
        UPDATE ${this.tableName} SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
      END
    `);
  }

  private async createIndexes(): Promise<void> {
    const optimization = this.config.sqlite!.indexOptimization;
    
    // 维度索引
    await this.dbManager.execute(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_dimension 
      ON ${this.tableName}(dimension) WHERE is_deleted = 0
    `);
    
    // 内容哈希索引（避免重复）
    await this.dbManager.execute(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_content_hash 
      ON ${this.tableName}(content_hash) WHERE is_deleted = 0
    `);
    
    // 时间戳索引
    await this.dbManager.execute(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_created_at 
      ON ${this.tableName}(created_at) WHERE is_deleted = 0
    `);

    // 元数据索引（如果启用B-Tree索引）
    if (optimization.enableBTreeIndex) {
      await this.dbManager.execute(`
        CREATE INDEX IF NOT EXISTS idx_${this.tableName}_metadata 
        ON ${this.tableName}(json_extract(metadata, '$.type')) WHERE is_deleted = 0
      `);
    }
    
    console.log('SQLite向量存储索引创建完成');
  }

  protected async performSearch(
    queryEmbedding: number[],
    options: SearchOptions
  ): Promise<VectorSearchResult[]> {
    const {
      topK = 10,
      threshold,
      filter,
      includeEmbeddings = false
    } = options;

    // 构建优化的查询
    let whereClause = 'dimension = ? AND is_deleted = 0';
    const params: any[] = [queryEmbedding.length];

    // 添加过滤条件
    if (filter) {
      for (const [key, value] of Object.entries(filter)) {
        if (Array.isArray(value)) {
          if (value.length > 0) {
            const placeholders = value.map(() => '?').join(', ');
            whereClause += ` AND json_extract(metadata, '$.${key}') IN (${placeholders})`;
            params.push(...value);
          }
        } else {
          whereClause += ` AND json_extract(metadata, '$.${key}') = ?`;
          params.push(value);
        }
      }
    }

    // 使用预过滤优化查询
    const maxCandidates = this.config.queryOptimization.maxCandidates;
    const query = `
      SELECT id, content, embedding, metadata, norm
      FROM ${this.tableName} 
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${maxCandidates}
    `;

    try {
      // 使用DatabaseService执行查询
      const rows = await this.executeWithRetry<any[]>(
        () => this.dbManager.select<any>(query, params),
        'vector_search_query'
      );

      console.log('[VectorStore] 数据库查询返回结果数量:', rows?.length || 0);
      if (rows && rows.length > 0) {
        console.log('[VectorStore] 第一个数据库结果样例:', {
          id: rows[0].id,
          contentLength: rows[0].content?.length || 0,
          hasEmbedding: !!rows[0].embedding,
          embeddingType: typeof rows[0].embedding,
          metadata: rows[0].metadata
        });
      }

      if (!rows || rows.length === 0) {
        console.log('[VectorStore] 数据库查询无结果，直接返回空数组');
        return [];
      }

      // 并行计算相似度
      const results = await this.computeSimilaritiesParallel(queryEmbedding, rows);
      console.log('[VectorStore] 相似度计算完成，结果数量:', results.length);
      if (results.length > 0) {
        const scores = results.map(r => r.score).sort((a, b) => b - a);
        console.log('[VectorStore] 相似度分数分布:', {
          max: Math.max(...scores),
          min: Math.min(...scores),
          avg: scores.reduce((a, b) => a + b, 0) / scores.length,
          scores: scores.slice(0, 5) // 显示前5个最高分数
        });
      }

      // 按相似度排序并应用阈值
      let filteredResults = results.sort((a, b) => b.score - a.score);
      console.log('[VectorStore] 排序后结果数量:', filteredResults.length);
      
      if (threshold !== undefined) {
        const beforeFilter = filteredResults.length;
        filteredResults = filteredResults.filter(r => r.score >= threshold);
        console.log(`[VectorStore] 阈值过滤 (>=${threshold}): ${beforeFilter} -> ${filteredResults.length}`);
      }

      // 返回前K个结果
      const finalResults = filteredResults.slice(0, topK);

      // 更新性能指标
      this.updateMetrics('searchLatency', Date.now() - Date.now());

      return finalResults.map(r => ({
        id: r.id,
        content: r.content,
        score: r.score,
        metadata: r.metadata,
        embedding: includeEmbeddings ? r.embedding : undefined
      }));

    } catch (error) {
      throw new RetrievalError(
        `向量搜索失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 5,
    baseDelay: number = 100
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const isRetryableError = this.isDatabaseLockError(error as Error) || 
                                this.isDatabaseTimeoutError(error as Error);

        if (!isRetryableError || isLastAttempt) {
          console.error(`❌ [Vector Store] ${operationName} 最终失败 (尝试 ${attempt}/${maxRetries}):`, error);
          throw error;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 100;
        console.warn(
          `⚠️ [Vector Store] ${operationName} 失败，${delay}ms后重试 (${attempt}/${maxRetries}):`,
          (error as Error).message
        );
        
        await this.sleep(delay);
      }
    }
    
    throw new Error(`${operationName} 在 ${maxRetries} 次重试后失败`);
  }

  private isDatabaseLockError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('database is locked') ||
           message.includes('database lock') ||
           message.includes('busy') ||
           message.includes('sqlite_busy') ||
           message.includes('lock');
  }

  private isDatabaseTimeoutError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('timeout') ||
           message.includes('lock timeout') ||
           message.includes('busy timeout');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected async performAddVectors(
    vectors: Array<{
      id: string;
      embedding: number[];
      content: string;
      metadata: Record<string, any>;
    }>
  ): Promise<void> {
    const batchSize = this.config.batchSize || 100;

    try {
      // 暂时使用简单的批量插入，避免复杂的事务管理
      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        
        for (const vector of batch) {
          const { id, embedding, content, metadata } = vector;
          
          // 自动设置维度（如果尚未设置）
          if (!this.config.dimension) {
            this.config.dimension = embedding.length;
            console.log(`自动设置向量维度: ${this.config.dimension}`);
          }
          
          // 验证维度
          if (embedding.length !== this.config.dimension) {
            throw new DimensionMismatchError(this.config.dimension, embedding.length);
          }

          // 序列化嵌入向量
          const embeddingBlob = this.serializeEmbedding(embedding);
          const norm = this.computeNorm(embedding);
          const contentHash = this.computeContentHash(content);
          const metadataJson = JSON.stringify(metadata);

          // 使用简单的数据库操作，避免事务复杂性
          await this.executeWithRetry(
            () => this.dbManager.execute(
              `INSERT OR REPLACE INTO ${this.tableName} 
               (id, content, embedding, metadata, dimension, norm, content_hash)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [id, content, embeddingBlob, metadataJson, embedding.length, norm, contentHash]
            ),
            'insert_vector'
          );
        }
      }

      // 更新性能指标
      this.updateMetrics('indexingThroughput', vectors.length);

      console.log(`成功添加 ${vectors.length} 个向量到向量存储`);

    } catch (error) {
      console.error(`❌ 添加向量失败:`, error);
      throw new RetrievalError(
        `添加向量失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }

  protected async performRemoveVectors(ids: string[]): Promise<void> {
    const query = `UPDATE ${this.tableName} SET is_deleted = 1 WHERE id IN (${ids.map(() => '?').join(',')})`;
    await this.executeWithRetry(
      () => this.dbManager.execute(query, ids),
      'remove_vectors'
    );
  }

  protected async performClear(): Promise<void> {
    await this.executeWithRetry(
      () => this.dbManager.execute(`DELETE FROM ${this.tableName}`),
      'clear_vectors'
    );
  }

  protected async performGetStats(): Promise<{
    totalVectors: number;
    dimension: number;
    indexSize: number;
  }> {
    const countResult = await this.executeWithRetry(
      () => this.dbManager.select<{ count: number }>(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE is_deleted = 0`),
      'get_vector_count'
    );

    const dimensionResult = await this.executeWithRetry(
      () => this.dbManager.select<{ dimension: number }>(`SELECT DISTINCT dimension FROM ${this.tableName} WHERE is_deleted = 0 LIMIT 1`),
      'get_dimension'
    );

    // 获取索引大小（估算）
    const sizeResult = await this.executeWithRetry(
      () => this.dbManager.select<{ size: number }>(`SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()`),
      'get_db_size'
    );

    return {
      totalVectors: countResult[0]?.count ?? 0,
      dimension: dimensionResult[0]?.dimension ?? this.config.dimension,
      indexSize: sizeResult[0]?.size ?? 0
    };
  }

  private serializeEmbedding(embedding: number[]): Uint8Array {
    const buffer = new ArrayBuffer(embedding.length * 4);
    const view = new Float32Array(buffer);
    view.set(embedding);
    return new Uint8Array(buffer);
  }

  private deserializeEmbedding(data: Uint8Array): number[] {
    const view = new Float32Array(data.buffer);
    return Array.from(view);
  }

  // 尝试从 JSON 字节数组还原为 Float32 向量
  private tryRecoverFloat32FromJsonBytes(bytesArray: number[], targetDimension: number): number[] | null {
    if (!Array.isArray(bytesArray)) return null;
    if (bytesArray.length !== targetDimension * 4) return null;

    // 简单校验：是否看起来是字节数组（0~255）
    let sampleCount = 0;
    for (let i = 0; i < bytesArray.length && sampleCount < 32; i += Math.max(1, Math.floor(bytesArray.length / 32))) {
      const v = bytesArray[i];
      if (typeof v !== 'number' || v < 0 || v > 255) return null;
      sampleCount++;
    }

    try {
      const u8 = Uint8Array.from(bytesArray as number[]);
      const f32 = new Float32Array(u8.buffer);
      if (f32.length !== targetDimension) return null;
      return Array.from(f32);
    } catch {
      return null;
    }
  }

  private computeNorm(embedding: number[]): number {
    return Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  }

  private computeContentHash(content: string): string {
    // 简单哈希函数
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return hash.toString(36);
  }

  private async performMaintenance(): Promise<void> {
    const now = Date.now();
    const maintenanceInterval = 24 * 60 * 60 * 1000; // 24小时
    
    if (now - this.lastVacuumTime > maintenanceInterval) {
      await this.optimizeDatabase();
      this.lastVacuumTime = now;
    }
  }

  private async optimizeDatabase(): Promise<void> {
    try {
      await this.executeWithRetry(
        () => this.dbManager.execute('VACUUM'),
        'database_vacuum'
      );
      
      await this.executeWithRetry(
        () => this.dbManager.execute('ANALYZE'),
        'database_analyze'
      );
      
      console.log('向量存储数据库优化完成');
    } catch (error) {
      console.warn('⚠️ 向量存储数据库优化失败:', error);
    }
  }

  async addVectorsBatch(
    vectors: Array<{
      id: string;
      embedding: number[];
      content: string;
      metadata: Record<string, any>;
    }>[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<void> {
    const total = vectors.length;
    for (let i = 0; i < total; i++) {
      await this.addVectors(vectors[i]);
      onProgress?.(i + 1, total);
    }
  }

  async compactMemory(): Promise<void> {
    await this.executeWithRetry(
      () => this.dbManager.execute('PRAGMA shrink_memory'),
      'compact_memory'
    );
  }

  async getDetailedMetrics(): Promise<VectorStoreMetrics & {
    dbSize: number;
    cacheHits: number;
    queriesExecuted: number;
    indexEfficiency: number;
  }> {
    const baseMetrics = this.getMetrics();
    const stats = await this.performGetStats();
    
    return {
      ...baseMetrics,
      dbSize: stats.indexSize,
      cacheHits: 0, // DatabaseService管理缓存统计
      queriesExecuted: (this.metrics as any).searchCount ?? 0,
      indexEfficiency: (this.metrics as any).searchCount > 0 ?
        ((this.metrics as any).vectorCount / (this.metrics as any).searchCount) : 0
    };
  }

  private async computeSimilaritiesParallel(
    queryEmbedding: number[],
    rows: any[]
  ): Promise<Array<{
    id: string;
    content: string;
    score: number;
    metadata: any;
    embedding?: number[];
  }>> {
    const chunkSize = (this.performanceConfig as any).batchSize ?? 100;
    const chunks: any[][] = [];
    
    for (let i = 0; i < rows.length; i += chunkSize) {
      chunks.push(rows.slice(i, i + chunkSize));
    }

    const results = await Promise.all(
      chunks.map(chunk => this.computeSimilaritiesChunk(queryEmbedding, chunk))
    );

    return results.flat();
  }

  private async computeSimilaritiesChunk(
    queryEmbedding: number[],
    rows: any[]
  ): Promise<Array<{
    id: string;
    content: string;
    score: number;
    metadata: any;
    embedding?: number[];
  }>> {
    console.log('[VectorStore] 开始计算相似度，行数:', rows.length);
    console.log('[VectorStore] SimilarityCalculator.cosine 是否可用:', !!(SimilarityCalculator as any).cosine);
    
    const mapped = rows.map((row, index): {
      id: string;
      content: string;
      score: number;
      metadata: any;
      embedding?: number[];
    } | null => {
      try {
        // 调试原始embedding数据
        console.log(`[VectorStore] 行${index} 原始embedding类型:`, typeof row.embedding, '长度:', row.embedding?.length || 0);
        
        let embedding: number[];
        
        // 根据数据类型选择合适的反序列化方法
        if (typeof row.embedding === 'string') {
          // 如果是字符串，尝试解析为JSON或Base64
          try {
            const parsed = JSON.parse(row.embedding);
            if (Array.isArray(parsed)) {
              // 可能是浮点数组，或是字节数组
              if (parsed.length === queryEmbedding.length) {
                embedding = parsed;
                console.log(`[VectorStore] 行${index} JSON解析为浮点数组，维度:`, embedding.length);
              } else {
                const recovered = this.tryRecoverFloat32FromJsonBytes(parsed, queryEmbedding.length);
                if (recovered) {
                  embedding = recovered;
                  console.log(`[VectorStore] 行${index} JSON字节数组还原成功，维度:`, embedding.length);
                } else {
                  // 不是字节数组且维度不匹配，丢弃该行
                  console.warn(`[VectorStore] 行${index} JSON解析后维度不匹配，期望 ${queryEmbedding.length}，实际 ${parsed.length}，已跳过`);
                  return null;
                }
              }
            } else {
              // 非数组类型，尝试按Base64处理
              const binaryString = atob(row.embedding);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              embedding = this.deserializeEmbedding(bytes);
              console.log(`[VectorStore] 行${index} Base64解析成功，维度:`, embedding.length);
            }
          } catch {
            // 如果JSON解析失败，尝试Base64解码
            const binaryString = atob(row.embedding);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            embedding = this.deserializeEmbedding(bytes);
            console.log(`[VectorStore] 行${index} Base64解析成功，维度:`, embedding.length);
          }
        } else if (row.embedding instanceof Uint8Array) {
          embedding = this.deserializeEmbedding(row.embedding);
          console.log(`[VectorStore] 行${index} Uint8Array解析成功，维度:`, embedding.length);
        } else {
          // 直接转换为Uint8Array
          embedding = this.deserializeEmbedding(new Uint8Array(row.embedding));
          console.log(`[VectorStore] 行${index} 直接转换成功，维度:`, embedding.length);
        }
        
        if (!embedding || embedding.length === 0) {
          console.warn(`[VectorStore] 行${index} 向量解析失败或为空`);
          return null;
        }
        
        // 最终维度校验，不匹配则跳过该行
        if (embedding.length !== queryEmbedding.length) {
          console.warn(`[VectorStore] 行${index} 维度不匹配，期望 ${queryEmbedding.length} 实际 ${embedding.length}，已跳过`);
          return null;
        }
        
        let similarity = 0;
        if ((SimilarityCalculator as any).cosine) {
          similarity = (SimilarityCalculator as any).cosine(queryEmbedding, embedding);
        } else {
          // 如果没有cosine方法，手动计算余弦相似度
          similarity = this.calculateCosineSimilarity(queryEmbedding, embedding);
        }
        
        console.log(`[VectorStore] 行${index} 相似度计算完成:`, similarity);
        
        return {
          id: row.id,
          content: row.content,
          score: similarity,
          metadata: JSON.parse(row.metadata || '{}'),
          embedding
        };
      } catch (error) {
        console.error(`[VectorStore] 行${index} 处理失败:`, error);
        return null;
      }
    });

    // 过滤掉被跳过的行
    return mapped.filter((r): r is {
      id: string;
      content: string;
      score: number;
      metadata: any;
      embedding?: number[];
    } => r !== null);
  }

  private calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }
} 