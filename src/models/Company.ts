import mongoose, { Schema, Document, model } from 'mongoose';

export interface IBankAccount {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  iban?: string;
  swift?: string;
}

export interface ICompany extends Document {
  name: string;
  tradeName: string;
  nif: string;
  address: string;
  city: string;
  province: string;
  postalCode?: string;
  country: string;
  email: string;
  phone: string;
  logo?: string;
  bankAccounts?: IBankAccount[];
  saftProductId?: string;
  saftProductVersion?: string;
  saftProductCompanyTaxId?: string;
  saftSoftwareCertificateNumber?: string;
  saftSoftwareValidationNumber?: string;
  regime?: string;
  seriesBase?: string;
  isCabinda?: boolean;
  isDefault: boolean;
}

const BankAccountSchema = new Schema({
  bankName: { type: String },
  accountName: { type: String },
  accountNumber: { type: String },
  iban: { type: String },
  swift: { type: String }
}, { _id: false });

const CompanySchema = new Schema({
  name: { type: String, required: true },
  tradeName: { type: String, required: true },
  nif: { type: String, required: true, unique: true },
  address: { type: String, required: true },
  city: { type: String, required: true },
  province: { type: String, required: true },
  postalCode: { type: String },
  country: { type: String, required: true, default: 'Angola' },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  logo: { type: String },
  bankAccounts: { type: [BankAccountSchema], default: [] },
  saftProductId: { type: String },
  saftProductVersion: { type: String },
  saftProductCompanyTaxId: { type: String },
  saftSoftwareCertificateNumber: { type: String },
  saftSoftwareValidationNumber: { type: String },
  regime: { type: String },
  seriesBase: { type: String },
  isCabinda: { type: Boolean, default: false },
  isDefault: { type: Boolean, default: false }
}, {
  timestamps: true
});

// Ensure only one company can be default
CompanySchema.pre('save', async function (next) {
  if (this.isDefault) {
    await (this.constructor as any).updateMany(
      { _id: { $ne: this._id } },
      { $set: { isDefault: false } }
    );
  }
  next();
});

export default mongoose.models.Company || mongoose.model<ICompany>('Company', CompanySchema);