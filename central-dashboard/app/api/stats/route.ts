import { NextResponse } from 'next/server';
import { CentralStore } from '../../../lib/store';

export async function GET() {
  try {
    const stats = CentralStore.getStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Failed to get stats:', error);
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500 });
  }
}
