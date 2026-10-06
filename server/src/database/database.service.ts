import { Injectable, OnApplicationShutdown, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

/** 정류장 저장소가 공유하는 PostgreSQL 연결 풀과 작업별 연결 수명을 관리한다. */
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool;

  constructor(configService: ConfigService, @Optional() pool?: Pool) {
    this.pool =
      pool ??
      new Pool({
        connectionString: configService.getOrThrow<string>('DATABASE_URL'),
      });
  }

  /**
   * 단일 SQL을 연결 풀에서 실행한다.
   * @param text `$1` 등 자리표시자를 포함한 SQL 문.
   * @param values 자리표시자에 순서대로 바인딩할 값. 문자열 보간 대신 사용한다.
   * @returns PostgreSQL 드라이버의 조회 결과.
   */
  query<T extends QueryResultRow>(text: string, values?: readonly unknown[]) {
    return this.pool.query<T>(text, values as unknown[] | undefined);
  }

  /**
   * 여러 쿼리가 같은 연결을 사용하도록 콜백 동안 전용 연결을 유지한다.
   *
   * 트랜잭션의 BEGIN·COMMIT·ROLLBACK은 호출자가 관리한다. 성공·실패와
   * 관계없이 연결만 반드시 반환해 풀이 고갈되지 않도록 한다.
   * @param run 동일한 연결에서 실행할 작업.
   * @returns 콜백이 반환한 값.
   * @throws 콜백 오류를 그대로 전달한다.
   */
  async withClient<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await run(client);
    } finally {
      client.release();
    }
  }

  /** Nest 앱 종료 시 남은 PostgreSQL 연결을 정상적으로 정리한다. */
  async onApplicationShutdown() {
    await this.pool.end();
  }
}
