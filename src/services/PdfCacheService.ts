import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const access = promisify(fs.access);

export class PdfCacheService {
  private static readonly CACHE_DIR = path.join(process.cwd(), 'public', 'pdfs');
  
  /**
   * Generate cache key for a document
   */
  private static generateCacheKey(documentId: string): string {
    // Sanitize ID to prevent directory traversal or invalid filenames
    const sanitizedId = documentId.replace(/[\/\\:*?"<>|]/g, '_');
    return `document-${sanitizedId}.pdf`;
  }
  
  /**
   * Get the full path for a cached PDF
   */
  private static getCachePath(documentId: string): string {
    return path.join(this.CACHE_DIR, this.generateCacheKey(documentId));
  }
  
  /**
   * Get file stats for a cached PDF
   */
  static async getPdfStats(documentId: string): Promise<fs.Stats | null> {
    try {
      const cachePath = this.getCachePath(documentId);
      const stats = await promisify(fs.stat)(cachePath);
      return stats;
    } catch {
      return null;
    }
  }

  /**
   * Check if a PDF is cached for a document
   */
  static async isCached(documentId: string): Promise<boolean> {
    try {
      const cachePath = this.getCachePath(documentId);
      await access(cachePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Store a PDF in cache
   */
  static async storePdf(documentId: string, pdfBuffer: Buffer): Promise<string> {
    try {
      // Ensure cache directory exists
      if (!fs.existsSync(this.CACHE_DIR)) {
        fs.mkdirSync(this.CACHE_DIR, { recursive: true });
      }
      
      const cachePath = this.getCachePath(documentId);
      await writeFile(cachePath, pdfBuffer);
      
      // Return the public URL path
      return `/pdfs/${this.generateCacheKey(documentId)}`;
    } catch (error) {
      console.error('Error storing PDF in cache:', error);
      throw new Error('Failed to cache PDF');
    }
  }
  
  /**
   * Retrieve a cached PDF
   */
  static async getCachedPdf(documentId: string): Promise<Buffer | null> {
    try {
      const cachePath = this.getCachePath(documentId);
      const pdfBuffer = await readFile(cachePath);
      return pdfBuffer;
    } catch (error) {
      console.error('Error retrieving cached PDF:', error);
      return null;
    }
  }
  
  /**
   * Get the public URL for a cached PDF
   */
  static getCachedPdfUrl(documentId: string): string {
    return `/pdfs/${this.generateCacheKey(documentId)}`;
  }
  
  /**
   * Clear cache for a specific document
   */
  static async clearCache(documentId: string): Promise<void> {
    try {
      const cachePath = this.getCachePath(documentId);
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
      }
    } catch (error) {
      console.error('Error clearing PDF cache:', error);
    }
  }
  
  /**
   * Clear all cached PDFs
   */
  static async clearAllCache(): Promise<void> {
    try {
      if (fs.existsSync(this.CACHE_DIR)) {
        const files = fs.readdirSync(this.CACHE_DIR);
        for (const file of files) {
          if (file.endsWith('.pdf')) {
            fs.unlinkSync(path.join(this.CACHE_DIR, file));
          }
        }
      }
    } catch (error) {
      console.error('Error clearing all PDF cache:', error);
    }
  }
}

export default PdfCacheService;