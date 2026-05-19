import mongoose, { Schema, Document, model } from 'mongoose';
import crypto from 'crypto';

export interface IAgtConfig extends Document {
  apiUrl: string;
  clientId: string;
  clientSecret: string;
  certificatePath?: string;
  testMode: boolean;
  active: boolean;
  // Additional fields per AGT specifications
  taxpayerConsultationUrl?: string; // URL for taxpayer consultation API
  saftSubmissionUrl?: string; // URL for SAFT submission API
  softwareCertificateNumber?: string; // Software certificate number from AGT
  publicKeyFingerprint?: string; // Public key fingerprint for signature
  privateKeyPath?: string; // Path to private key for signing
  environment?: 'production' | 'staging' | 'development'; // Environment indicator
  timeout?: number; // Request timeout in milliseconds (default: 10000)
  retryAttempts?: number; // Number of retry attempts for failed requests
  retryDelay?: number; // Delay between retries in milliseconds
  createdAt: Date;
  updatedAt: Date;
}

const AgtConfigSchema = new Schema({
  apiUrl: { type: String, required: true },
  clientId: { type: String, required: true },
  clientSecret: { type: String, required: true },
  certificatePath: { type: String },
  testMode: { type: Boolean, default: true },
  active: { type: Boolean, default: true },
  // Additional fields
  taxpayerConsultationUrl: { type: String },
  saftSubmissionUrl: { type: String },
  softwareCertificateNumber: { type: String },
  publicKeyFingerprint: { type: String },
  privateKeyPath: { type: String },
  environment: { 
    type: String, 
    enum: ['production', 'staging', 'development'],
    default: 'development'
  },
  timeout: { type: Number, default: 10000 },
  retryAttempts: { type: Number, default: 3 },
  retryDelay: { type: Number, default: 1000 },
}, {
  timestamps: true
});

// Encrypt sensitive data before saving
AgtConfigSchema.pre('save', function(next) {
  // In production, encrypt clientSecret here
  // For now, we'll just pass through but mark as sensitive
  if (this.isModified('clientSecret') && !this.testMode) {
    // In production, encrypt using crypto
    // this.clientSecret = encrypt(this.clientSecret);
  }
  next();
});

// Virtual for taxpayer consultation URL (falls back to apiUrl)
AgtConfigSchema.virtual('consultationUrl').get(function() {
  return this.taxpayerConsultationUrl || this.apiUrl.replace(/\/$/, '') + '/api/v1/taxpayer/consult';
});

// Virtual for SAFT submission URL (falls back to apiUrl)
AgtConfigSchema.virtual('saftUrl').get(function() {
  return this.saftSubmissionUrl || this.apiUrl.replace(/\/$/, '') + '/api/v1/saft/submit';
});

export default mongoose.models.AgtConfig || mongoose.model<IAgtConfig>('AgtConfig', AgtConfigSchema);