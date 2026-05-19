import connectToDatabase from './mongoose';
import Product from '@/models/Product';
import mongoose from 'mongoose';
import { productStore } from './productStore';

export interface EnrichedProduct {
  id: string;
  name: string;
  sku: string;
  description?: string;
  price: number;
  category?: string;
  unit: string;
  vatRate: number;
  vatExemptionReason?: string;
  isService: boolean;
  minStock: number;
}

export async function getProductByIdHelper(id: string): Promise<EnrichedProduct | null> {
  try {
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      await connectToDatabase();
      const product = await Product.findById(id).lean();
      if (product) {
        return {
          id: String(product._id),
          name: product.name,
          sku: product.sku,
          description: product.description,
          price: product.price,
          category: product.category,
          unit: product.unit || 'UN',
          vatRate: product.vatRate || 0,
          vatExemptionReason: product.vatExemptionReason || '',
          isService: !!product.isService,
          minStock: product.minStock || 0
        };
      }
    }
  } catch (err) {
    console.error('Error fetching product in getProductByIdHelper:', err);
  }

  // Fallback to legacy productStore
  const legacy = productStore.getProductById(id);
  if (legacy) {
    return {
      id: legacy.id,
      name: legacy.name,
      sku: legacy.sku,
      description: legacy.description,
      price: legacy.price,
      category: legacy.category,
      unit: legacy.unit || 'UN',
      vatRate: legacy.vatRate || 0,
      vatExemptionReason: legacy.vatExemptionReason || '',
      isService: !!legacy.isService,
      minStock: legacy.minStock || 0
    };
  }

  return null;
}
