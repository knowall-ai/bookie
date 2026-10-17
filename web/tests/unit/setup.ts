import { randomBytes } from 'node:crypto';

process.env.BOOKIE_CONFIG_KEY ??= randomBytes(32).toString('base64');
