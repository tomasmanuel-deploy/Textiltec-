import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

// Client interface
export interface IClient extends MongooseDocument {
  companyId: mongoose.Types.ObjectId;
  name: string;
  tradeName?: string;
  nif: string;
  address: string;
  email?: string;
  phone?: string;
  clientType: 'individual' | 'company';
  status: 'active' | 'inactive';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Client Schema
const ClientSchema = new Schema({
  companyId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  tradeName: { 
    type: String,
    trim: true
  },
  nif: { 
    type: String, 
    required: true,
    trim: true
  },
  address: { 
    type: String, 
    required: true,
    trim: true
  },
  email: { 
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v: string) {
        return !v || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
      },
      message: 'Please enter a valid email address'
    }
  },
  phone: { 
    type: String,
    trim: true
  },
  clientType: {
    type: String,
    enum: ['individual', 'company'],
    required: true,
    default: 'company'
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes for better performance
ClientSchema.index({ companyId: 1, nif: 1 }, { unique: true });
ClientSchema.index({ name: 1 });
ClientSchema.index({ status: 1 });

// Virtual for full display name
ClientSchema.virtual('displayName').get(function() {
  return this.tradeName || this.name;
});

// Ensure virtual fields are serialized
ClientSchema.set('toJSON', {
  virtuals: true
});

// Export the model
export default mongoose.models.Client || mongoose.model<IClient>('Client', ClientSchema);