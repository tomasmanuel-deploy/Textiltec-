import mongoose, { Schema, Document, model } from 'mongoose';

export interface ICustomer extends Document {
  name: string;
  nif?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  notes?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema({
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  nif: { 
    type: String,
    trim: true
  },
  address: { 
    type: String,
    trim: true
  },
  city: { type: String },
  province: { type: String },
  postalCode: { type: String },
  country: { type: String, default: 'Angola' },
  email: { 
    type: String,
    trim: true,
    lowercase: true
  },
  phone: { 
    type: String,
    trim: true
  },
  contactPerson: { type: String },
  notes: { 
    type: String
  },
  active: { 
    type: Boolean, 
    default: true
  }
}, { timestamps: true });

export default mongoose.models.Customer || model<ICustomer>('Customer', CustomerSchema);