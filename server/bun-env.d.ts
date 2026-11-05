// Minimal typings for the Bun APIs the server uses, so no extra @types package is needed.
// Runtime: Bun >= 1.1 (the oven/bun Docker image).

declare module "bun:sqlite" {
  type Binding = string | number | bigint | boolean | null | Uint8Array;
  interface Statement<Row = Record<string, unknown>> {
    all(...params: Binding[]): Row[];
    get(...params: Binding[]): Row | null;
    run(...params: Binding[]): { changes: number; lastInsertRowid: number | bigint };
  }
  export class Database {
    constructor(
      filename?: string,
      options?: { create?: boolean; readonly?: boolean; strict?: boolean },
    );
    exec(sql: string): void;
    run(sql: string, ...params: Binding[]): void;
    query<Row = Record<string, unknown>>(sql: string): Statement<Row>;
    prepare<Row = Record<string, unknown>>(sql: string): Statement<Row>;
    transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R;
    close(): void;
  }
}

interface BunFile extends Blob {
  exists(): Promise<boolean>;
}

declare const Bun: {
  serve(options: {
    port?: number;
    hostname?: string;
    fetch(req: Request): Response | Promise<Response>;
  }): { port: number };
  file(path: string): BunFile;
  version: string;
  env: Record<string, string | undefined>;
};
