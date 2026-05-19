// Prakash Billing System - Node.js SDK
// For Central Dashboard Integration

const https = require('https');
const http = require('http');
const url = require('url');

class PrakashSDK {
  constructor(options = {}) {
    this.tenantId = options.tenantId || process.env.PRAKASH_TENANT_ID;
    this.apiKey = options.apiKey || process.env.PRAKASH_API_KEY;
    this.endpoint = options.endpoint || 'https://dashboard.prakash.com/api/central/ingest';
    
    if (!this.tenantId) {
      throw new Error('Tenant ID is required. Pass it in options or set PRAKASH_TENANT_ID environment variable.');
    }
  }

  /**
   * Log a document submission event
   * @param {string} documentId - The unique ID of the document (e.g. invoice number)
   * @param {'success'|'failure'} status - The status of the submission
   * @param {object} details - Additional details about the submission
   * @returns {Promise<void>}
   */
  async logSubmission(documentId, status, details = {}) {
    return this._sendEvent({
      eventType: 'submission',
      documentId,
      status,
      details
    });
  }

  /**
   * Log an error event
   * @param {string} context - Where the error occurred
   * @param {Error|string} error - The error object or message
   * @returns {Promise<void>}
   */
  async logError(context, error) {
    return this._sendEvent({
      eventType: 'error',
      status: 'failure',
      details: {
        context,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    });
  }

  /**
   * Internal method to send events to the central dashboard
   * @private
   */
  async _sendEvent(payload) {
    const fullPayload = {
      tenantId: this.tenantId,
      timestamp: new Date().toISOString(),
      ...payload
    };

    const parsedUrl = url.parse(this.endpoint);
    const lib = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey || ''}`,
        'X-Tenant-ID': this.tenantId
      }
    };

    return new Promise((resolve, reject) => {
      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data || '{}'));
          } else {
            reject(new Error(`Request failed with status code ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      req.write(JSON.stringify(fullPayload));
      req.end();
    });
  }
}

module.exports = PrakashSDK;
