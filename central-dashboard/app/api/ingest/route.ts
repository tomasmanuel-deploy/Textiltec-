import { NextRequest, NextResponse } from 'next/server';
import { CentralStore } from '../../../lib/store';

export async function POST(req: NextRequest) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // Simple API Key Security
  const apiKey = req.headers.get('authorization')?.replace('Bearer ', '');
  const validApiKey = process.env.CENTRAL_API_KEY || 'default-secure-key-change-me';

  if (apiKey !== validApiKey) {
    return NextResponse.json({ error: 'Unauthorized: Invalid API Key' }, { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const body = await req.json();
    const { tenantId, eventType, details, status } = body;

    if (!tenantId || !eventType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const log = CentralStore.addLog({
      tenantId,
      eventType,
      details,
      status: status || 'success',
    });

    return NextResponse.json({ success: true, logId: log.id }, { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } });
  } catch (error) {
    console.error('Failed to ingest log:', error);
    return NextResponse.json({ error: 'Failed to ingest log' }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
