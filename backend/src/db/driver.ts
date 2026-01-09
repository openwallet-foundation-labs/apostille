// import {connect, SSLMode, SSL} from 'ts-postgres'
import dotenv from 'dotenv'
import { readFileSync } from 'fs'
import path from 'path'

dotenv.config({
    path:['.env']
})

import {Pool} from 'pg'

// Parse DATABASE_URL if individual variables are not set
let dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    database: process.env.DB_NAME || 'postgres',
    port: process.env.DB_PORT || '5432',
    password: process.env.DB_PASSWORD || 'postgres'
};

// If DATABASE_URL is set and individual variables are not, parse it
if (process.env.DATABASE_URL && (!process.env.DB_HOST || !process.env.DB_USER)) {
    try {
        const url = new URL(process.env.DATABASE_URL);
        dbConfig = {
            host: url.hostname,
            user: url.username,
            database: url.pathname.slice(1), // Remove leading slash
            port: url.port || '5432',
            password: url.password || 'postgres'
        };
        console.log('DB Driver: Using DATABASE_URL for connection configuration');
    } catch (error) {
        console.error('DB Driver: Failed to parse DATABASE_URL:', error);
    }
}

// Database pool size (configurable per pod for horizontal scaling)
const DB_POOL_SIZE = parseInt(process.env.DB_POOL_SIZE || '10');

// Determine SSL mode: use DB_SSL_MODE env var, or default based on NODE_ENV
const sslMode = process.env.DB_SSL_MODE || (process.env.NODE_ENV === 'production' ? 'require' : 'disable');
const sslConfig = sslMode === 'disable' ? false : { rejectUnauthorized: false };
console.log(`DB Driver: SSL mode = ${sslMode}`);

export const db = new Pool({
    user: dbConfig.user,
    host: dbConfig.host,
    port: Number(dbConfig.port),
    database: dbConfig.database,
    password: dbConfig.password,
    connectionTimeoutMillis: 30000, // 30 seconds timeout
    idleTimeoutMillis: 30000, // 30 seconds idle timeout
    max: DB_POOL_SIZE, // Maximum number of connections in the pool (configurable via DB_POOL_SIZE)
    ssl: sslConfig,
})