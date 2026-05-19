import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  companyId: mongoose.Types.ObjectId;
  sku: string;
  name: string;
  description?: string;
  unit: string;
  unitPrice: number;
  vatRate: number;
  stock: number;
  minStock?: number;
  category?: string;
  active: boolean;
  isService?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema({
  companyId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  sku: { 
    type: String, 
    required: true, 
    trim: true,
    uppercase: true
  },
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  description: { 
    type: String,
    trim: true
  },
  unit: { 
    type: String, 
    required: true,
    default: 'UN'
  },
  unitPrice: { 
    type: Number, 
    required: true,
    min: 0
  },
  vatRate: { 
    type: Number, 
    required: true,
    default: 14
  },
  stock: { 
    type: Number, 
    default: 0
  },
  minStock: {
    type: Number,
    default: 0
  },
  category: { 
    type: String,
    trim: true
  },
  active: { 
    type: Boolean, 
    default: true
  },
  isService: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Compounded index to guarantee SKU uniqueness per company/tenant
ProductSchema.index({ companyId: 1, sku: 1 }, { unique: true });

export default mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);