const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { Pool } = require('pg');

// 환경 파일의 비밀 값은 출력하지 않고 기존 서버 환경 설정을 사용한다.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL이 필요합니다.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  try {
    await pool.query(readFileSync(resolve(__dirname, '../db/migrations/002_bus_alerts.sql'), 'utf8'));
    console.log('알림 DB 마이그레이션을 적용했습니다.');
  } finally { await pool.end(); }
})().catch(error => { console.error('알림 DB 마이그레이션 실패:', error.message); process.exitCode = 1; });
