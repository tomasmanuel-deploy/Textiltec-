import mongoose, { Schema, Document, model } from 'mongoose';
import crypto from 'crypto';

// User roles enum
export enum UserRole {
  ADMIN = 'admin',
  ACCOUNTANT = 'accountant',
  SALES = 'sales',
  VIEWER = 'viewer'
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  active: boolean;
  lastLogin?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: Object.values(UserRole),
    default: UserRole.VIEWER
  },
  active: { type: Boolean, default: true },
  lastLogin: { type: Date }
}, {
  timestamps: true
});

// Hash password before saving (using scrypt with random salt)
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(this.password, salt, 64, (err, key) => err ? reject(err) : resolve(key));
    });
    this.password = `${salt}:${derived.toString('hex')}`;
    next();
  } catch (error: any) {
    next(error);
  }
});

// Method to compare password
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  try {
    const [salt, hash] = String(this.password || '').split(':');
    if (!salt || !hash) return false;
    const derived = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(candidatePassword, salt, 64, (err, key) => err ? reject(err) : resolve(key));
    });
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), derived);
  } catch {
    return false;
  }
};

export default mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
