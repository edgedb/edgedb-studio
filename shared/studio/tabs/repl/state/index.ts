import {action, observable, computed} from "mobx";
import {
  Frozen,
  frozen,
  idProp,
  model,
  Model,
  modelAction,
  modelFlow,
  prop,
  _async,
  _await,
  createContext as createMobxContext,
  getSnapshot,
  fromSnapshot,
  findParent,
} from "mobx-keystone";
import {Text} from "@codemirror/state";
import {connCtx, dbCtx} from "../../../state";
import {
  ErrorDetails,
  extractErrorDetails,
} from "../../../utils/extractErrorDetails";
import {createInspector, InspectorState, Item} from "@dbsof/inspector/state";
import {baseOptions, decode, ResultSet} from "../../../utils/decodeRawBuffer";
import {CommandResult, handleSlashCommand} from "./commands";
import {
  clearReplHistory,
  fetchReplHistory,
  fetchResultData,
  QueryResultData,
  storeReplHistoryItem,
} from "../../../idbStore";
import {instanceCtx} from "../../../state/instance";
import {extendedViewerIds} from "../../../components/extendedViewers";

import "./itemHeights";
import {ItemHeights} from "./itemHeights";
import {sessionStateCtx} from "../../../state/sessionState";
import {
  createExplainState,
  ExplainState,
  ExplainStateType,
} from "../../../components/explainVis/state";
import {NavigateFunction} from "../../../hooks/dbRoute";
import {
  createResultGridState,
  ResultGridState,
} from "@dbsof/common/components/resultGrid";
import LRU from "@dbsof/platform/client";
import {Completer} from "../../../utils/completer";
import {OutputMode} from "../../queryEditor/state";
import {Language} from "@dbsof/platform/client";

export const defaultItemHeight = 85;

export enum ReplLang {
  Query,
  SQL,
}

@model("Repl/HistoryItem")
export class ReplHistoryItem extends Model({
  $modelId: idProp,
  lang: prop<ReplLang>(ReplLang.Query),
  query: prop<string>(),
  timestamp: prop<number>(),
  implicitLimit: prop<number | null>(null),
  status: prop<string | null>(null),
  hasResult: prop<boolean | null>(null),
  error: prop<Frozen<ErrorDetails> | null>(null),
  commandResult: prop<Frozen<CommandResult> | null>(null),
  warnings: prop<Frozen<ErrorDetails[]> | null>(null),
}) {
  renderHeight: number | null = null;
  showDateHeader: boolean = false;

  @computed
  get isExplain() {
    return (
      this.status === ExplainStateType.explain ||
      this.status === ExplainStateType.analyzeQuery
    );
  }

  @observable
  showMore = false;

  @action
  setShowMore(val: boolean) {
    this.showMore = val;
  }

  @observable
  showFullQuery = false;

  @action
  setShowFullQuery(val: boolean) {
    this.showFullQuery = val;
  }

  @observable
  outputMode: OutputMode =
    this.lang === ReplLang.SQL ? OutputMode.Grid : OutputMode.Tree;

  @action
  setOutputMode(mode: OutputMode) {
    this.outputMode = mode;
  }

  @action
  toggleOutputMode() {
    this.outputMode =
      this.outputMode === OutputMode.Tree ? OutputMode.Grid : OutputMode.Tree;
  }

  @modelAction
  setResult(
    status: string,
    hasResult: boolean,
    implicitLimit: number | null,
    warnings: ErrorDetails[]
  ) {
    this.hasResult = hasResult;
    this.status = status;
    this.implicitLimit = implicitLimit;
    this.warnings = frozen(warnings);
  }

  @modelAction
  setError(error: ErrorDetails) {
    this.error = frozen(error);
  }

  @modelAction
  setCommandResult(result: CommandResult) {
    this.commandResult = frozen(result);
  }

  @observable.ref
  _inspectorState: InspectorState | null = null;

  @action
  getInspectorState(data: ResultSet) {
    const cache = cachesCtx.get(this)!.inspector;
    let state = cache.get(this.$modelId);
    if (!state) {
      state = createInspector(
        data,
        this.implicitLimit,
        extendedViewerIds,
        (item) =>
          findParent<Repl>(
            this,
            (p) => p instanceof Repl
          )!.setExtendedViewerItem(item)
      );
      cache.set(this.$modelId, state);
    }
    this._inspectorState = state;
    return state;
  }

  @action
  getResultGridState(data: ResultSet) {
    const cache = cachesCtx.get(this)!.grid;
    let state = cache.get(this.$modelId);
    if (!state) {
      state = createResultGridState(data._codec, data, this.implicitLimit);
      cache.set(this.$modelId, state);
    }
    return state;
  }

  @observable.ref
  _explainState: ExplainState | null = null;

  @action
  getExplainState(data: ResultSet) {
    const cache = cachesCtx.get(this)!.explain;
    let state = cache.get(this.$modelId);
    if (!state) {
      state = createExplainState(data[0]);
      cache.set(this.$modelId, state);
    }
    this._explainState = state;
    return state;
  }
}

export interface ReplSettings {
  retroMode: boolean;
}

const cachesCtx = createMobxContext<{
  inspector: LRU<string, InspectorState>;
  grid: LRU<string, ResultGridState>;
  explain: LRU<string, ExplainState>;
}>();

@model("Repl")
export class Repl extends Model({
  queryHistory: prop<ReplHistoryItem[]>(() => []),
}) {
  onInit() {
    cachesCtx.set(this, {
      inspector: this.resultInspectorCache,
      grid: this.resultGridCache,
      explain: this.resultExplainCache,
    });
  }

  navigation: NavigateFunction | null = null;

  itemHeights = new ItemHeights();

  scrollRef: HTMLDivElement | null = null;

  @computed
  get sqlModeSupported(): boolean {
    const serverVersion = instanceCtx.get(this)!.serverVersion;
    return !serverVersion || serverVersion.major >= 6;
  }

  @observable
  language = ReplLang.Query;

  @action
  setLanguage(lang: ReplLang) {
    if (lang === ReplLang.SQL && !this.sqlModeSupported) {
      return;
    }
    this.language = lang;
  }

  @observable
  currentQuery = Text.empty;

  @action
  setCurrentQuery(query: Text) {
    this.currentQuery = query;
    this.historyCursor = -1;
  }

  initialScrollPos = 0;

  // -1 is draft, then counts how many history items back from most recent
  historyCursor = -1;
  draftQuery = Text.empty;

  dedupedQueryHistory: ReplHistoryItem[] = [];

  _addDedupedHistoryQueries(history: ReplHistoryItem[]) {
    let lastQuery =
      this.dedupedQueryHistory[this.dedupedQueryHistory.length - 1]?.query;
    for (let i = history.length - 1; i >= 0; i--) {
      const item = history[i];
      if (item.query !== lastQuery) {
        this.dedupedQueryHistory.push(item);
        lastQuery = item.query;
      }
    }
  }

  _addDedupedHistoryLatestQuery(item: ReplHistoryItem) {
    let previousQuery = this.dedupedQueryHistory[0]?.query;
    if (item.query !== previousQuery) {
      this.dedupedQueryHistory.unshift(item);
    }
  }

  @action
  navigateHistory(direction: 1 | -1) {
    // 1 => backwards, -1 => forwards
    if (this._fetchingHistory) {
      return;
    }
    let cursor = this.historyCursor + direction;

    if (
      cursor < -1 ||
      (cursor >= this.dedupedQueryHistory.length && !this._hasUnfetchedHistory)
    ) {
      return;
    }
    if (cursor === -1) {
      this.currentQuery = this.draftQuery;
      this.historyCursor = -1;
    } else {
      if (cursor >= this.dedupedQueryHistory.length) {
        this.fetchReplHistory().then(() => this.navigateHistory(1));
        return;
      }
      const historyItem = this.dedupedQueryHistory[cursor];
      if (this.historyCursor === -1) {
        this.draftQuery = this.currentQuery;
      }
      this.currentQuery = Text.of(historyItem.query.split("\n"));
      this.historyCursor = cursor;
    }
  }

  @observable.ref
  extendedViewerItem: Item | null = null;

  @action
  setExtendedViewerItem(item: Item | null) {
    this.extendedViewerItem = item;
  }

  resultDataCache = new LRU<string, Completer<ResultSet | null>>({
    capacity: 20,
  });

  resultInspectorCache = new LRU<string, InspectorState>({capacity: 20});
  resultExplainCache = new LRU<string, ExplainState>({capacity: 20});
  resultGridCache = new LRU<string, ResultGridState>({capacity: 20});

  getResultData(itemId: string): Completer<ResultSet | null> {
    let data = this.resultDataCache.get(itemId);
    if (!data) {
      data = new Completer(
        fetchResultData(itemId).then((resultData) =>
          resultData
            ? decode(
                resultData.outCodecBuf,
                resultData.resultBuf,
                baseOptions,
                resultData.protoVer ?? [1, 0]
              )
            : null
        )
      );
      this.resultDataCache.set(itemId, data);
    }
    return data;
  }

  @observable
  _hasUnfetchedHistory = true;

  @observable
  _fetchingHistory = false;

  @modelFlow
  fetchReplHistory = _async(function* (this: Repl) {
    if (this._fetchingHistory || !this._hasUnfetchedHistory) {
      return;
    }
    this._fetchingHistory = true;
    const history = yield* _await(
      fetchReplHistory(
        instanceCtx.get(this)!.instanceId!,
        dbCtx.get(this)!.name,
        this.queryHistory[0]?.timestamp ?? Date.now(),
        50
      )
    );
    this._hasUnfetchedHistory = history.length === 50;

    let lastDate: [number, number, number] | null = null;

    const historyItems: ReplHistoryItem[] = Array(history.length);
    for (let i = history.length - 1; i >= 0; i--) {
      const item = fromSnapshot<ReplHistoryItem>(history[i].data);
      const date = new Date(item.timestamp);
      if (
        !lastDate ||
        lastDate[0] !== date.getDate() ||
        lastDate[1] !== date.getMonth() ||
        lastDate[2] !== date.getFullYear()
      ) {
        item.showDateHeader = true;
        lastDate = [date.getDate(), date.getMonth(), date.getFullYear()];
      }
      historyItems[history.length - 1 - i] = item;
    }
    if (this.queryHistory[0]) {
      const date = new Date(this.queryHistory[0].timestamp);
      if (
        lastDate &&
        lastDate[0] === date.getDate() &&
        lastDate[1] === date.getMonth() &&
        lastDate[2] === date.getFullYear()
      ) {
        this.queryHistory[0].showDateHeader = false;
      }
    }

    this.queryHistory.unshift(...historyItems);
    this.itemHeights.addHistoryItems(
      Array(history.length).fill(defaultItemHeight)
    );
    this._addDedupedHistoryQueries(historyItems);

    this._fetchingHistory = false;
  });

  @action
  clearQueryHistory() {
    this.queryHistory = [];
    this.dedupedQueryHistory = [];
    this.itemHeights = new ItemHeights();
    this._hasUnfetchedHistory = false;
    clearReplHistory(
      instanceCtx.get(this)!.instanceId!,
      dbCtx.get(this)!.name,
      (data) => {
        const item = fromSnapshot<ReplHistoryItem>(data.data);
        return item.hasResult ? item.$modelId : null;
      }
    );
  }

  @observable
  settings: ReplSettings = {
    retroMode: false,
  };

  @action
  updateSetting<T extends keyof ReplSettings>(key: T, value: ReplSettings[T]) {
    this.settings[key] = value;
  }

  @observable _runningQuery: AbortController | true | null = null;

  @computed get queryRunning() {
    return this._runningQuery != null;
  }

  @computed
  get canRunQuery() {
    return !this.queryRunning && !!this.currentQuery.toString().trim();
  }

  @modelFlow
  runQuery = _async(function* (this: Repl, queryStr?: string) {
    const dbState = dbCtx.get(this)!;
    const conn = connCtx.get(this)!;

    const query = queryStr ?? this.currentQuery.toString().trim();

    if (!query) {
      return;
    }

    const historyItem = new ReplHistoryItem({
      lang: this.language,
      query,
      timestamp: Date.now(),
    });

    if (this.queryHistory.length) {
      const prevDate = new Date(
        this.queryHistory[this.queryHistory.length - 1].timestamp
      );
      const currDate = new Date(historyItem.timestamp);
      historyItem.showDateHeader =
        prevDate.getDate() !== currDate.getDate() ||
        prevDate.getMonth() !== currDate.getMonth() ||
        prevDate.getFullYear() !== currDate.getFullYear();
    }

    this.queryHistory.push(historyItem);
    this.itemHeights.addItem(defaultItemHeight);
    this._addDedupedHistoryLatestQuery(historyItem);
    if (queryStr !== null) {
      this.currentQuery = Text.empty;
    }

    const isCommandQuery = query.startsWith("\\") && !query.includes("\n");

    this._runningQuery = isCommandQuery ? true : new AbortController();
    this.historyCursor = -1;

    dbState.setLoadingTab(Repl, true);

    const lang = Language.SQL;
    let resultData: QueryResultData | undefined = undefined;
    let skipStoreHistoryItem = false;
    try {
      if (isCommandQuery) {
        skipStoreHistoryItem =
          (yield* _await(handleSlashCommand(query, this, historyItem))) ??
          false;
      } else {
        const implicitLimitConfig = sessionStateCtx
          .get(this)!
          .activeState.options.find((opt) => opt.name === "Implicit Limit")
          ?.value as bigint | undefined;

        const {
          result,
          outCodecBuf,
          resultBuf,
          protoVer,
          capabilities,
          status,
          warnings,
        } = yield* _await(
          conn.query(
            query,
            undefined,
            {
              implicitLimit:
                implicitLimitConfig != null
                  ? implicitLimitConfig + BigInt(1)
                  : undefined,
              userQuery: true,
            },
            (this._runningQuery as AbortController).signal,
            lang
          )
        );

        dbState.refreshCaches(capabilities, status ? [status] : []);

        const implicitLimit =
          implicitLimitConfig != null ? Number(implicitLimitConfig) : null;
        historyItem.setResult(
          status,
          !!result,
          implicitLimit,
          warnings.map((w) =>
            extractErrorDetails(w, query, lang, () => [
              ...(dbCtx.get(this)?.schemaData?.objectsByName.keys() ?? []),
            ])
          )
        );
        if (result) {
          this.resultDataCache.set(
            historyItem.$modelId,
            new Completer(result)
          );
          if (
            status === ExplainStateType.explain ||
            status === ExplainStateType.analyzeQuery
          ) {
            this.resultExplainCache.set(
              historyItem.$modelId,
              createExplainState(result[0])
            );
          } else {
            this.resultInspectorCache.set(
              historyItem.$modelId,
              createInspector(
                result,
                implicitLimit,
                extendedViewerIds,
                (item) => this.setExtendedViewerItem(item)
              )
            );
          }

          resultData = {
            outCodecBuf,
            resultBuf,
            protoVer,
          };
        }
      }
    } catch (err: any) {
      historyItem.setError(
        extractErrorDetails(err, query, lang, () => [
          ...(dbCtx.get(this)?.schemaData?.objectsByName.keys() ?? []),
        ])
      );
    }

    if (!skipStoreHistoryItem) {
      storeReplHistoryItem(
        historyItem.$modelId,
        {
          instanceId: instanceCtx.get(this)!.instanceId!,
          dbName: dbCtx.get(this)!.name,
          timestamp: historyItem.timestamp,
          data: getSnapshot(historyItem),
        },
        resultData
      );
    }

    dbState.setLoadingTab(Repl, false);
    this._runningQuery = null;
  });
}
