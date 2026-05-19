import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

let MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';

// Force loading directly from .env file to override any stale shell environment variables
try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/^MONGODB_URI=(.+)$/m);
        if (match && match[1]) {
            MONGODB_URI = match[1].trim();
        }
    }
} catch (err) {
    console.warn('Erro ao carregar o arquivo .env diretamente:', err);
}

declare global {
    // eslint-disable-next-line no-var
    var mongooseConnectionCache: {
        conn: typeof mongoose | null;
        promise: Promise<typeof mongoose> | null;
    } | undefined;
}

if (!global.mongooseConnectionCache) {
    global.mongooseConnectionCache = { conn: null, promise: null };
}

export async function connectToDatabase() {
    if (!MONGODB_URI) {
        throw new Error('Missing MONGODB_URI environment variable');
    }

    if (global.mongooseConnectionCache.conn) {
        return global.mongooseConnectionCache.conn;
    }

    if (!global.mongooseConnectionCache.promise) {
        global.mongooseConnectionCache.promise = mongoose.connect(MONGODB_URI, {
            autoIndex: true,
            serverSelectionTimeoutMS: 5000,
        });
    }

    global.mongooseConnectionCache.conn = await global.mongooseConnectionCache.promise;
    return global.mongooseConnectionCache.conn;
}

export default connectToDatabase;
