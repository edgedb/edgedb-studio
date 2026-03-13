import {openDB, DBSchema, IDBPDatabase} from "idb";
import {ProtocolVersion} from "@dbsof/platform/client";
import {StoredSchemaData} from "../state/database";
import {StoredSessionStateData} from "../state/sessionState";
import {rewriteTypedesc} from "../utils/rewriteTypedesc";

export interface QueryHistoryItem {
  instanceId: string;
  dbName: string;
  timestamp: number;
  data: any;
}

export interface QueryResultData {
  outCodecBuf: Uint8Array;
  resultBuf: Uint8Array;
  protoVer?: ProtocolVersion;
}

export interface SessionStateData {
  instanceId: string;
  dbName: string;
  data: StoredSessionStateData;
}

export interface AIPlaygroundChatItem {
  instanceId: string;
  dbName: string;
  timestamp: number;
  data: any;
}

interface IDBStore extends DBSchema {
  sessionState: {
    key: [string, string];
    value: SessionStateData;
  };
  queryHistory: {
    key: [string, string, number];
    value: QueryHistoryItem;
    indexes: {
      byInstanceId: string;
    };
  };
  replHistory: {
    key: [string, string, number];
    value: QueryHistoryItem;
    indexes: {
      byInstanceId: string;
    };
  };
  queryResultData: {
    key: string;
    value: QueryResultData;
  };
  schemaData: {
    key: string;
    value: {instanceId: string; data: StoredSchemaData};
    indexes: {
      byInstanceId: string;
    };
  };
  aiPlaygroundChatHistory: {
    key: [string, string, number];
    value: AIPlaygroundChatItem;
    indexes: {
      byInstanceId: string;
    };
  };
}

function _initDB() {
  return openDB<IDBStore>("DBSOFStudio", 4, {
    upgrade(db, oldVersion) {
      switch (oldVersion) {
        // @ts-ignore fallthrough
        case 0: {
          db.createObjectStore("schemaData").createIndex(
            "byInstanceId",
            "instanceId"
          );
        }
        // @ts-ignore fallthrough
        case 1: {
          db.createObjectStore("queryHistory", {
            keyPath: ["instanceId", "dbName", "timestamp"],
          }).createIndex("byInstanceId", "instanceId");
          db.createObjectStore("replHistory", {
            keyPath: ["instanceId", "dbName", "timestamp"],
          }).createIndex("byInstanceId", "instanceId");

          db.createObjectStore("queryResultData");
        }
        // @ts-ignore fallthrough
        case 2: {
          db.createObjectStore("sessionState", {
            keyPath: ["instanceId", "dbName"],
          });
        }
        // @ts-ignore fallthrough
        case 3: {
          db.createObjectStore("aiPlaygroundChatHistory", {
            keyPath: ["instanceId", "dbName", "timestamp"],
          }).createIndex("byInstanceId", "instanceId");
        }
      }
    },
  });
}

let _db: IDBPDatabase<IDBStore> | null = null;
async function retryingIDBRequest<T>(
  request: (db: IDBPDatabase<IDBStore>) => Promise<T>
): Promise<T> {
  let i = 3;
  while (true) {
    i--;
    if (!_db) {
      _db = await _initDB();
    }
    try {
      return await request(_db);
    } catch (err) {
      if (
        i === 0 ||
        !(
          err instanceof DOMException &&
          (err.message.includes("closing") || err.message.includes("closed"))
        )
      ) {
        throw err;
      }
      _db = null;
    }
  }
}

// session state

export async function fetchSessionState(instanceId: string, dbName: string) {
  return retryingIDBRequest(
    async (db) =>
      (await db.get("sessionState", [instanceId, dbName]))?.data ?? null
  );
}

export async function storeSessionState(data: SessionStateData) {
  await retryingIDBRequest((db) => db.put("sessionState", data));
}

// query / repl history

async function _storeHistoryItem(
  storeId: "queryHistory" | "replHistory",
  itemId: string,
  item: QueryHistoryItem,
  resultData?: QueryResultData
) {
  return retryingIDBRequest(async (db) => {
    const tx = db.transaction([storeId, "queryResultData"], "readwrite");

    return Promise.all([
      tx.objectStore(storeId).add(item),
      resultData
        ? tx.objectStore("queryResultData").add(resultData, itemId)
        : null,
      tx.done,
    ]);
  });
}

export function storeQueryHistoryItem(
  itemId: string,
  item: QueryHistoryItem,
  resultData?: QueryResultData
) {
  return _storeHistoryItem("queryHistory", itemId, item, resultData);
}

export function storeReplHistoryItem(
  itemId: string,
  item: QueryHistoryItem,
  resultData?: QueryResultData
) {
  return _storeHistoryItem("replHistory", itemId, item, resultData);
}

async function _fetchHistory(
  storeId: "queryHistory" | "replHistory",
  instanceId: string,
  dbName: string,
  fromTimestamp: number,
  count = 50
) {
  return retryingIDBRequest(async (db) => {
    const tx = db.transaction(storeId, "readonly");
    let cursor = await tx.store.openCursor(
      IDBKeyRange.bound(
        [instanceId, dbName, -Infinity],
        [instanceId, dbName, fromTimestamp],
        true,
        true
      ),
      "prev"
    );
    const items: QueryHistoryItem[] = [];
    let i = 0;
    while (cursor && i < count) {
      items.push(cursor.value);
      i++;
      cursor = await cursor.continue();
    }
    return items;
  });
}

async function _clearHistory(
  storeId: "queryHistory" | "replHistory",
  instanceId: string,
  dbName: string,
  getResultDataId: (item: QueryHistoryItem) => string | null
) {
  return retryingIDBRequest(async (db) => {
    const tx = db.transaction([storeId, "queryResultData"], "readwrite");
    let cursor = await tx
      .objectStore(storeId)
      .openCursor(
        IDBKeyRange.bound(
          [instanceId, dbName, -Infinity],
          [instanceId, dbName, Infinity]
        )
      );
    const deletes: Promise<any>[] = [];
    while (cursor) {
      const currentItem = cursor;
      const resultDataId = getResultDataId(currentItem.value);
      if (resultDataId) {
        deletes.push(tx.objectStore("queryResultData").delete(resultDataId));
      }
      deletes.push(currentItem.delete());
      cursor = await cursor.continue();
    }
    deletes.push(tx.done);
    return await Promise.all(deletes);
  });
}

export function fetchQueryHistory(
  instanceId: string,
  dbName: string,
  fromTimestamp: number,
  count = 50
) {
  return _fetchHistory(
    "queryHistory",
    instanceId,
    dbName,
    fromTimestamp,
    count
  );
}

export function fetchReplHistory(
  instanceId: string,
  dbName: string,
  fromTimestamp: number,
  count = 50
) {
  return _fetchHistory(
    "replHistory",
    instanceId,
    dbName,
    fromTimestamp,
    count
  );
}

export function clearReplHistory(
  instanceId: string,
  dbName: string,
  getResultDataId: (item: QueryHistoryItem) => string | null
) {
  return _clearHistory("replHistory", instanceId, dbName, getResultDataId);
}

export async function fetchResultData(itemId: string) {
  return retryingIDBRequest(async (db) => {
    const res = await db.get("queryResultData", itemId);
    return res && !res.protoVer
      ? {
          ...res,
          outCodecBuf: rewriteTypedesc(res.outCodecBuf),
          protoVer: [2, 0] as ProtocolVersion,
        }
      : res;
  });
}

// schema data

export async function storeSchemaData(
  dbName: string,
  instanceId: string,
  data: StoredSchemaData
) {
  await retryingIDBRequest((db) =>
    db.put("schemaData", {instanceId, data}, `${instanceId}/${dbName}`)
  );
}

export async function fetchSchemaData(dbName: string, instanceId: string) {
  return retryingIDBRequest(async (db) => {
    const result = await db.get("schemaData", `${instanceId}/${dbName}`);
    return result?.data;
  });
}

export async function cleanupOldSchemaDataForInstance(
  instanceId: string,
  currentDbNames: string[]
) {
  const currentDbKeys = new Set(
    currentDbNames.map((dbName) => `${instanceId}/${dbName}`)
  );
  await retryingIDBRequest(async (db) => {
    const tx = db.transaction("schemaData", "readwrite");
    const dbKeys = await tx.store.index("byInstanceId").getAllKeys(instanceId);
    return Promise.all([
      ...dbKeys
        .filter((dbKey) => !currentDbKeys.has(dbKey))
        .map((dbKey) => tx.store.delete(dbKey)),
      tx.done,
    ]);
  });
}

// ai playground chat

export async function storeAIPlaygroundChatItem(item: AIPlaygroundChatItem) {
  await retryingIDBRequest((db) => db.add("aiPlaygroundChatHistory", item));
}

export async function fetchAIPlaygroundChatHistory(
  instanceId: string,
  dbName: string,
  fromTimestamp: number,
  count = 50
) {
  return retryingIDBRequest(async (db) => {
    const tx = db.transaction("aiPlaygroundChatHistory", "readonly");
    let cursor = await tx.store.openCursor(
      IDBKeyRange.bound(
        [instanceId, dbName, -Infinity],
        [instanceId, dbName, fromTimestamp],
        true,
        true
      ),
      "prev"
    );
    const items: AIPlaygroundChatItem[] = [];
    let i = 0;
    while (cursor && i < count) {
      items.push(cursor.value);
      i++;
      cursor = await cursor.continue();
    }
    return items;
  });
}
