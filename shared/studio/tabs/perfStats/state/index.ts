import {action, computed, observable, runInAction} from "mobx";
import {Model, model, prop} from "mobx-keystone";
import {Text} from "@codemirror/state";
import {connCtx} from "../../../state";
import {
  createExplainState,
  ExplainState,
} from "../../../components/explainVis/state";
import {
  paramsQueryCtx,
  QueryParamsEditor,
} from "../../queryEditor/state/parameters";
import {Language} from "@dbsof/platform/client";
import {calculateHistogram} from "../utils";

export type QueryType = "SQL";

export interface QueryStats {
  id: string;
  branchName: string;
  query: string;
  query_type: QueryType;
  tag: string | null;

  plans: BigInt;
  totalPlanTime: number;
  minPlanTime: number;
  maxPlanTime: number;
  meanPlanTime: number;
  stddevPlanTime: number;

  calls: BigInt;
  totalExecTime: number;
  minExecTime: number;
  maxExecTime: number;
  meanExecTime: number;
  stddevExecTime: number;

  rows: BigInt;
  statsSince: Date;
  minmaxStatsSince: Date;
}

export interface OrderBy {
  field: "calls" | "meanExecTime" | "totalExecTime";
  sortAsc: boolean;
}

export interface AnalyseQueryState {
  query: string;
  explainState: ExplainState | null;
  controller: AbortController | null;
}

export enum TagFilterGroup {
  App,
  Repl,
  Internal,
}

function getTagGroup(tag: string | null): TagFilterGroup {
  return tag === "studio/repl" || tag === "studio/webrepl"
    ? TagFilterGroup.Repl
    : tag?.startsWith("studio/")
    ? TagFilterGroup.Internal
    : TagFilterGroup.App;
}

@model("PerfStats")
export class PerfStatsState extends Model({
  paramsEditor: prop(() => new QueryParamsEditor({lang: Language.SQL})),
}) {
  @observable.ref
  stats: QueryStats[] | null = null;

  @observable
  expandedIds = new Set<string>();

  @action
  toggleExpanded(id: string) {
    if (this.expandedIds.has(id)) {
      this.expandedIds.delete(id);
    } else {
      this.expandedIds.add(id);
    }
  }

  @computed
  get maxExecTime() {
    return Math.max(
      ...(this.tableFilteredStats?.map((stat) => stat.maxExecTime) ?? [])
    );
  }

  @observable
  orderBy: OrderBy = {field: "totalExecTime", sortAsc: false};

  @action
  setOrderBy(field: OrderBy["field"]) {
    if (this.orderBy.field === field) {
      this.orderBy.sortAsc = !this.orderBy.sortAsc;
    } else {
      this.orderBy = {
        field,
        sortAsc: false,
      };
    }
  }

  @observable
  timeFilter: [number, number] | null = null;

  @action
  setTimeFilter(range: [number, number] | null) {
    this.timeFilter = range;
  }

  @computed
  get allTags() {
    const groups: {[key in TagFilterGroup]: string[]} = {
      [TagFilterGroup.App]: [""],
      [TagFilterGroup.Repl]: ["studio/repl", "studio/webrepl"],
      [TagFilterGroup.Internal]: [],
    };
    const tags = new Set(this.stats?.map((stat) => stat.tag));
    for (const tag of [null, "studio/repl", "studio/webrepl"]) {
      tags.delete(tag);
    }
    for (const tag of [...tags]) {
      groups[getTagGroup(tag)].push(tag ?? "");
    }
    return groups;
  }

  @observable
  tagsFilter = new Set<string | TagFilterGroup>([TagFilterGroup.App]);

  @action
  toggleTagFilter(tag: string | TagFilterGroup) {
    if (typeof tag === "string") {
      const group = getTagGroup(tag);
      if (this.tagsFilter.has(group)) {
        this.tagsFilter.delete(group);
        for (const subtag of this.allTags[group]) {
          this.tagsFilter.add(subtag);
        }
      }
    } else {
      for (const subtag of this.allTags[tag]) {
        this.tagsFilter.delete(subtag);
      }
    }
    if (this.tagsFilter.has(tag)) {
      this.tagsFilter.delete(tag);
    } else {
      this.tagsFilter.add(tag);
    }
  }

  @computed
  get tagFilteredStats() {
    if (!this.stats) return null;

    const selectedTags = new Set(
      [...this.tagsFilter].flatMap((tag) =>
        typeof tag === "string" ? tag : this.allTags[tag]
      )
    );

    return this.stats.filter((stat) => selectedTags.has(stat.tag ?? ""));
  }

  @computed
  get histogram() {
    return calculateHistogram(this.tagFilteredStats);
  }

  @computed
  get tableFilteredStats() {
    if (!this.tagFilteredStats) return null;

    const {orderBy, timeFilter} = this;
    let stats = [...this.tagFilteredStats];
    if (timeFilter) {
      stats = stats.filter(
        (stat) =>
          stat.meanExecTime >= timeFilter[0] &&
          stat.meanExecTime < timeFilter[1]
      );
    }
    return stats.sort((a, b) => {
      return Number(
        orderBy.sortAsc
          ? (a[orderBy.field] as number) - (b[orderBy.field] as number)
          : (b[orderBy.field] as number) - (a[orderBy.field] as number)
      );
    });
  }

  fetching = false;
  async fetchQueryStats() {
    if (this.fetching) return;
    this.fetching = true;
    const conn = connCtx.get(this)!;

    try {
      const {result} = await conn.query(
        `
      select sys::QueryStats {
        branchName := .branch.name,
        query,
        query_type,
        tag,

        plans,
        totalPlanTime := duration_get(.total_plan_time, 'milliseconds'),
        minPlanTime := duration_get(.min_plan_time, 'milliseconds'),
        maxPlanTime := duration_get(.max_plan_time, 'milliseconds'),
        meanPlanTime := duration_get(.mean_plan_time, 'milliseconds'),
        stddevPlanTime := duration_get(.stddev_plan_time, 'milliseconds'),
      
        calls,
        totalExecTime := duration_get(.total_exec_time, 'milliseconds'),
        minExecTime := duration_get(.min_exec_time, 'milliseconds'),
        maxExecTime := duration_get(.max_exec_time, 'milliseconds'),
        meanExecTime := duration_get(.mean_exec_time, 'milliseconds'),
        stddevExecTime := duration_get(.stddev_exec_time, 'milliseconds'),
      
        rows,
        statsSince := datetime_get(.stats_since, 'epochseconds'),
        minmaxStatsSince := datetime_get(.minmax_stats_since, 'epochseconds'),
      }
      filter .branch.name = sys::get_current_branch()
    `,
        undefined,
        {ignoreSessionConfig: true}
      );

      runInAction(() => {
        this.stats =
          result?.map((stat) => ({
            id: `${stat.branchName}-${stat.query_id}`,
            ...stat,
            query: stat.query.replace(/^( {4})+/gm, (indent: string) =>
              " ".repeat(indent.length / 2)
            ),
            minmaxStatsSince: new Date(stat.minmaxStatsSince * 1000),
            statsSince: new Date(stat.statsSince * 1000),
          })) ?? [];
      });
    } finally {
      this.fetching = false;
    }
  }

  onInit() {
    paramsQueryCtx.setComputed(this.paramsEditor, () =>
      this.analyzeQuery ? Text.of(this.analyzeQuery.query.split("\n")) : null
    );
  }

  @computed
  get hasAnalyzePermissions() {
    return (
      connCtx.get(this)?.hasRolePermissions("sys::perm::analyze") ?? false
    );
  }

  @observable
  analyzeQuery: AnalyseQueryState | null = null;

  @action
  setAnalyzeQuery(queryStr: string) {
    const query = `analyze (execute := false)\n${queryStr.replace(
      /<(__std__)::.*>\$/g,
      (match) => "<std" + match.slice(8)
    )}`;

    this.paramsEditor.clear();

    this.analyzeQuery = {
      query,
      explainState: null,
      controller: null,
    };

    this.paramsEditor._extractQueryParameters().then(() => {
      if (this.paramsEditor.paramDefs.size === 0) {
        this.runAnalyzeQuery();
      }
    });
  }

  @action
  runAnalyzeQuery() {
    if (!this.analyzeQuery) return;

    const conn = connCtx.get(this)!;

    this.analyzeQuery.controller = new AbortController();

    conn
      .query(
        this.analyzeQuery.query,
        this.paramsEditor.getQueryArgs(),
        {ignoreSessionConfig: true},
        this.analyzeQuery.controller.signal
      )
      .then(({result}) => {
        if (!this.analyzeQuery || !result) return;
        runInAction(() => {
          this.analyzeQuery!.explainState = createExplainState(result![0]);
        });
      });
  }

  @action
  closeAnalyzeQuery() {
    this.analyzeQuery?.controller?.abort();
    this.analyzeQuery = null;
  }
}
