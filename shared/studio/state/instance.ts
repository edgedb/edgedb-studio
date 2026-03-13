import {createContext, useContext} from "react";
import {computed, observable, reaction, runInAction, when} from "mobx";
import {
  Model,
  model,
  modelAction,
  objectMap,
  prop,
  ModelClass,
  AnyModel,
  createContext as createMobxContext,
  ModelCreationData,
  getTypeInfo,
  ModelTypeInfo,
  modelFlow,
  _async,
  _await,
} from "mobx-keystone";

import {DuplicateDatabaseDefinitionError} from "@dbsof/platform/client";
import {mockMode} from "@dbsof/platform/client";

import {cleanupOldSchemaDataForInstance} from "../idbStore";

import {DatabaseState} from "./database";
import {AuthProvider, Connection} from "./connection";
import {SessionState} from "./sessionState";

export const instanceCtx = createMobxContext<InstanceState>();

export async function createInstanceState(
  props: Omit<ModelCreationData<InstanceState>, "databasePageStates">,
  serverVersion: {major: number; minor: number},
  authProvider: AuthProvider
) {
  const instance = new InstanceState(props);
  instance._authProvider = authProvider;
  runInAction(() => (instance.serverVersion = serverVersion));

  await instance.fetchInstanceInfo();

  return instance;
}

export interface ServerVersion {
  major: number;
  minor: number;
}

interface DatabaseInfo {
  name: string;
  last_migration?: string | null;
}

const mockInstanceInfo = {
  id: "demo",
  instanceName: "Demo Instance",
  version: {major: 1, minor: 0},
  databases: [
    {name: "main", last_migration: "0001-demo"},
    {name: "playground", last_migration: "0001-demo"},
  ],
  currentRole: "demo",
  isSuperuser: true,
  permissions: ["all"],
} satisfies {
  instanceName: string;
  version: {major: number; minor: number};
  databases: DatabaseInfo[];
  currentRole: string;
  isSuperuser: boolean;
  permissions: string[];
};

@model("InstanceState")
export class InstanceState extends Model({
  _instanceId: prop<string | null>(null),
  isCloud: prop<boolean>(false),
  serverUrl: prop<string>(),
  serverUrlWithPort: prop<string | null>(null),

  databasePageStates: prop(() => objectMap<DatabaseState>()),
}) {
  _authProvider: AuthProvider = null!;

  @observable instanceName: string | null = null;
  @observable.ref serverVersion: ServerVersion | null = null;
  @observable.ref databases: DatabaseInfo[] | null = null;
  @observable currentRole: string | null = null;
  isSuperuser: boolean = true;
  permissions: string[] = [];

  @computed
  get userRole() {
    const user = this._authProvider.getAuthUser?.();
    return user
      ? {
          name: user,
          is_superuser: this.isSuperuser,
          permissions: this.permissions,
        }
      : null;
  }

  @computed
  get instanceId() {
    return this._instanceId ?? this.instanceName;
  }

  @computed
  get databaseNames() {
    return this.databases?.map((d) => d.name) ?? null;
  }

  defaultConnection: Connection | null = null;

  private async _sysConnFetch<T extends any>(
    query: string,
    single: true
  ): Promise<T | null>;
  private async _sysConnFetch<T extends any>(
    query: string,
    single?: false
  ): Promise<T[] | null>;
  private async _sysConnFetch(query: string, single = false) {
    const data = (await this.getConnection("__system__").query(query))
      .result;
    return data && single ? data[0] ?? null : data;
  }

  private get databasesQuery() {
    return `sys::Database {
          name,
          ${
            !this.serverVersion || this.serverVersion?.major >= 6
              ? `last_migration,`
              : ""
          }
        }`;
  }

  @modelFlow
  fetchInstanceInfo = _async(function* (this: InstanceState) {
    let data:
      | {
          id?: string;
          instanceName: string;
          version: ServerVersion;
          databases: DatabaseInfo[];
          currentRole: string;
          isSuperuser: boolean;
          permissions: string[];
        }
      | null = null;

    try {
      const res = yield* _await(fetch(`${this.serverUrl}/instances`));
      const instances: {id: string; name: string}[] = yield* _await(res.json());
      const first = instances[0];
      const dbRes = yield* _await(
        fetch(
          `${this.serverUrl}/instances/${encodeURIComponent(first.id)}/databases`
        )
      );
      const databases = yield* _await(dbRes.json());
      data = {
        id: first?.id,
        instanceName: first?.name ?? "local",
        version: {major: 1, minor: 0},
        databases,
        currentRole: "default",
        isSuperuser: true,
        permissions: [],
      };
    } catch (err) {
      console.error("Failed to fetch instance info", err);
    }

    if (!data) {
      data = mockMode ? mockInstanceInfo : null;
    }

    if (!data) {
      return;
    }

    runInAction(() => {
      if (data.id) {
        this._instanceId = data.id;
      } else if (!this._instanceId && mockMode) {
        this._instanceId = mockInstanceInfo.id;
      }
      this.instanceName = data.instanceName ?? "_localdev";
      this.serverVersion = data.version;
      this.databases = data.databases;
      this.currentRole = data.currentRole;
      this.isSuperuser = data.isSuperuser;
      this.permissions = data.permissions;
    });

    cleanupOldSchemaDataForInstance(this.instanceId!, this.databaseNames!);
  });

  @modelFlow
  fetchDatabaseInfo = _async(function* (this: InstanceState) {
    let data: DatabaseInfo[] | null = null;
    try {
      const res = yield* _await(
        fetch(
          `${this.serverUrl}/instances/${encodeURIComponent(
            this._instanceId ?? this.instanceId ?? "default"
          )}/databases`
        )
      );
      data = yield* _await(res.json());
    } catch (err) {
      console.error("Failed to fetch databases", err);
    }
    if (!data) {
      data = mockMode ? mockInstanceInfo.databases : null;
    }

    if (data) {
      runInAction(() => {
        this.databases = data;
      });

      cleanupOldSchemaDataForInstance(this.instanceId!, this.databaseNames!);
    }
  });

  onInit() {
    instanceCtx.set(this, this);

    when(
      () =>
        this.defaultConnection === null && (this.databases?.length ?? 0) > 0,
      () => {
        runInAction(() => {
          this.defaultConnection = this.getConnection(this.databases![0].name);
        });
      }
    );

    return reaction(
      () => [this.serverUrl, this.currentRole, this.serverVersion],
      () => runInAction(() => (this._connections = new Map()))
    );
  }

  @observable.ref _connections = new Map<string, Connection>();
  getConnection(dbName: string, sessionState: SessionState | null = null) {
    let conn = this._connections.get(dbName);
    if (!conn || sessionState) {
      conn = new Connection(
        {
          serverUrl: this.serverUrl,
          database: dbName,
          instanceId: this.instanceId ?? "default",
          authProvider: {
            ...this._authProvider,
            getAuthUser: () =>
              this._authProvider.getAuthUser?.() ??
              this.currentRole ??
              "default",
            getUserRole: () => this.userRole,
          },
        }
      );
      if (!sessionState) {
        this._connections.set(dbName, conn);
      }
    }
    return conn;
  }

  @modelAction
  getDatabasePageState(
    databaseName: string,
    tabs: {path: string; state?: ModelClass<AnyModel>}[]
  ) {
    let dbState = this.databasePageStates.get(databaseName);
    if (!dbState) {
      dbState = new DatabaseState({
        name: databaseName,
        tabStates: objectMap(
          tabs
            .filter((t) => t.state)
            .map((t) => {
              const state = new t.state!({});
              return [state.$modelType, state];
            })
        ),
      });
      this.databasePageStates.set(databaseName, dbState);
    } else {
      for (const tab of tabs) {
        if (!tab.state) continue;
        const modelType = (getTypeInfo(tab.state) as ModelTypeInfo).modelType;
        if (!dbState.tabStates.has(modelType)) {
          const state = new tab.state({});
          dbState.tabStates.set(state.$modelType, state);
        }
      }
    }
    return dbState;
  }

  @observable creatingExampleDB = false;

  async createExampleDatabase(exampleSchema: Promise<string>) {
    if (mockMode) {
      const existing = this.databases ?? [];
      if (!existing.find((db) => db.name === "_example")) {
        runInAction(() => {
          this.databases = [
            ...existing,
            {name: "_example", last_migration: null},
          ];
        });
      }
      return;
    }
    runInAction(() => (this.creatingExampleDB = true));
    try {
      const schemaScript = await exampleSchema;
      try {
        await this.defaultConnection!.execute(`create database _example`);
        const exampleConn = this.getConnection("_example");
        await exampleConn.execute(schemaScript);
      } catch (err) {
        if (!(err instanceof DuplicateDatabaseDefinitionError)) {
          throw err;
        }
      }
      await this.fetchDatabaseInfo();
    } finally {
      runInAction(() => (this.creatingExampleDB = false));
    }
  }
}

export const InstanceStateContext = createContext<
  InstanceState | Error | null
>(null);

export function useInstanceState(): InstanceState {
  const ctx = useContext(InstanceStateContext);
  if (!ctx || ctx instanceof Error) {
    throw new Error("No instance ctx");
  }
  return ctx;
}

export function useFullInstanceState() {
  return useContext(InstanceStateContext);
}
