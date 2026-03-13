import {action, computed, makeObservable} from "mobx";
import {createContext} from "mobx-keystone";

import {
  Capabilities,
  ClientError,
  Language,
  ProtocolVersion,
  QueryArgs,
} from "@dbsof/platform/client";
import {buildObjectCodec} from "@dbsof/platform/client";

export {Capabilities};
export type QueryParams = QueryArgs;

export interface QueryDuration {
  prepare: number;
  execute: number;
}

export const connCtx = createContext<Connection>();

export interface ConnectConfig {
  serverUrl: string;
  database: string;
  instanceId?: string;
  authProvider: AuthProvider;
}

interface QueryResult {
  result: null;
  duration: QueryDuration;
  outCodecBuf: Uint8Array;
  resultBuf: Uint8Array;
  protoVer: ProtocolVersion;
  capabilities: number;
  status: string;
  warnings: Error[];
}

interface ParseResult {
  inCodec: null;
  outCodecBuf: Uint8Array;
  protoVer: ProtocolVersion;
  duration: number;
  warnings: Error[];
}

type QueryOpts = {
  newCodec?: boolean;
  implicitLimit?: bigint;
  blocking?: boolean;
} & (
  | {
      userQuery?: undefined;
      ignoreSessionConfig?: boolean;
    }
  | {
      userQuery?: boolean;
      ignoreSessionConfig?: undefined;
    }
);

type PendingQuery = {
  language: Language;
  query: string;
  params?: QueryParams;
  opts: QueryOpts;
  abortSignal: AbortSignal | null;
  reject: (error: Error) => void;
} & (
  | {kind: "query"; resolve: (result: QueryResult) => void}
  | {kind: "parse"; resolve: (result: QueryResult) => void}
  | {kind: "execute"; resolve: (result: void) => void}
);

export interface Role {
  name: string;
  is_superuser: boolean;
  permissions: string[];
}

export interface AuthProvider {
  getAuthToken(): string;
  getAuthUser?(): string;
  getUserRole?(): Role | null;
  invalidateToken(): void;
}

export class Connection {
  private readonly _queryQueue: PendingQuery[] = [];

  constructor(public readonly config: ConnectConfig) {
    makeObservable(this);
  }

  hasRolePermissions(...perms: string[]): boolean {
    const role = this.config.authProvider.getUserRole?.();
    return (
      !role ||
      role.is_superuser ||
      perms.every((perm) => role.permissions.includes(perm))
    );
  }

  @computed
  get sessionConfig() {
    return {} as Record<string, any>;
  }

  query(
    query: string,
    params?: QueryParams,
    opts: QueryOpts = {},
    abortSignal?: AbortSignal,
    language: Language = Language.SQL
  ): Promise<QueryResult> {
    return this._addQueryToQueue(
      "query",
      language,
      query,
      params,
      abortSignal,
      opts
    );
  }

  parse(
    query: string,
    language: Language = Language.SQL,
    abortSignal?: AbortSignal
  ): Promise<ParseResult> {
    return this._addQueryToQueue(
      "parse",
      language,
      query,
      undefined,
      abortSignal
    );
  }

  execute(script: string, language: Language = Language.SQL): Promise<void> {
    return this._addQueryToQueue("execute", language, script) as Promise<void>;
  }

  _addQueryToQueue(
    kind: PendingQuery["kind"],
    language: Language,
    query: string,
    params?: QueryParams,
    abortSignal: AbortSignal | null = null,
    opts: QueryOpts = {}
  ) {
    return new Promise<any>((resolve, reject) => {
      const pendingQuery: PendingQuery = {
        kind,
        language,
        query,
        params,
        opts,
        abortSignal,
        resolve: resolve as any,
        reject,
      };
      this._queryQueue.push(pendingQuery);
      abortSignal?.addEventListener("abort", () => {
        const queueIndex = this._queryQueue.indexOf(pendingQuery);
        if (queueIndex !== -1) {
          this._queryQueue.splice(queueIndex, 1);
          reject(new DOMException("The operation was aborted.", "AbortError"));
        }
      });
      this._processQueryQueue();
    });
  }

  @action
  async _processQueryQueue() {
    while (this._queryQueue.length) {
      const query = this._queryQueue.shift()!;
      try {
        const result = await this._handleQuery(query);
        query.resolve(result as any);
      } catch (e: any) {
        query.reject(e);
      }
    }
  }

  private async _handleQuery(query: PendingQuery) {
    const {kind, abortSignal} = query;
    if (abortSignal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    const emptyBuffers = new Uint8Array();
    const duration: QueryDuration = {prepare: 0, execute: 0};

    // simple REST bridge to dev API
    const baseUrl = this.config.serverUrl || "http://localhost:5757";
    const instanceId = this.config.instanceId || "default";
    const url = new URL(
      `/instances/${encodeURIComponent(instanceId)}/databases/${encodeURIComponent(
        this.config.database
      )}/sql/commands`,
      baseUrl
    ).toString();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: query.query,
        params: query.params ?? {},
        mode: "tabular",
      }),
      signal: abortSignal ?? undefined,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || `Query failed (${response.status})`);
    }

    const data = await response.json();
    const rawRows = Array.isArray(data.rows) ? data.rows : [];
    const columns = Array.isArray(data.columns) ? data.columns : [];
    const rows = rawRows.map((row: any) =>
      Array.isArray(row)
        ? Object.fromEntries(columns.map((col, i) => [col, row[i]]))
        : row || {}
    );
    const codec = buildObjectCodec(columns);
    const result: any = rows as any[];
    (result as any)._codec = codec;

    const queryResult: QueryResult = {
      result,
      duration,
      outCodecBuf: emptyBuffers,
      resultBuf: emptyBuffers,
      protoVer: [1, 0],
      capabilities: Capabilities.NONE,
      status: data.status ?? "OK",
      warnings: [],
    };

    return queryResult;
  }

  checkAborted(abortSignal: AbortSignal | null) {
    if (abortSignal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
  }

  async retryQuery<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (err: any) {
      if (err instanceof ClientError && (err as any).tag === "retry") {
        return await fn();
      }
      throw err;
    }
  }
}
