import {useEffect, useRef, useState} from "react";
import {observer} from "mobx-react-lite";

import {sql, PostgreSQL} from "@codemirror/lang-sql";

import cn from "@dbsof/common/utils/classNames";

import {
  Button,
  ChevronDownIcon,
  FieldHeader,
  SortDescIcon,
  SortIcon,
} from "@dbsof/common/newui";
import {CopyButton} from "@dbsof/common/newui/copyButton";
import CodeBlock from "@dbsof/common/ui/codeBlock";
import Spinner from "@dbsof/common/ui/spinner";
import {useIsMobile} from "@dbsof/common/hooks/useMobile";

import {OrderBy, PerfStatsState, QueryStats} from "./state";

import styles from "./perfStats.module.scss";

const sqlLang = sql({dialect: PostgreSQL}).language;

export const StatsTable = observer(function StatsTable({
  state,
}: {
  state: PerfStatsState;
}) {
  return (
    <div className={styles.statsTableWrapper}>
      <div className={styles.statsTable}>
        <div className={styles.tableHeader}>
          <div className={styles.headerItem}>Query</div>
          <div className={styles.headerItem}>
            Total exec <ColumnSort state={state} fieldName="totalExecTime" />
          </div>
          <div className={styles.headerItem}>
            Call count <ColumnSort state={state} fieldName="calls" />
          </div>
          <div className={styles.headerItem}>
            Mean exec <ColumnSort state={state} fieldName="meanExecTime" />
          </div>
        </div>
        <div className={styles.tableBody}>
          {state.tableFilteredStats ? (
            state.tableFilteredStats.length ? (
              state.tableFilteredStats.map((stat) => (
                <QueryStatsRow
                  key={stat.id}
                  state={state}
                  queryStats={stat}
                  expanded={state.expandedIds.has(stat.id)}
                />
              ))
            ) : (
              <div className={styles.noResults}>No results</div>
            )
          ) : (
            <div className={styles.spinner}>
              <Spinner size={20} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function ColumnSort({
  state,
  fieldName,
}: {
  state: PerfStatsState;
  fieldName: OrderBy["field"];
}) {
  return (
    <div
      className={cn(styles.columnSort, {
        [styles.sortAsc]:
          state.orderBy.sortAsc && state.orderBy.field === fieldName,
      })}
      onClick={() => state.setOrderBy(fieldName)}
    >
      {state.orderBy.field !== fieldName ? <SortIcon /> : <SortDescIcon />}
    </div>
  );
}

export const QueryStatsRow = observer(function QueryStatsRow({
  state,
  queryStats,
  expanded,
}: {
  state: PerfStatsState;
  queryStats: QueryStats;
  expanded: boolean;
}) {
  const expandedRef = useRef<HTMLDivElement>(null);
  const [expandedHeight, setExpandedheight] = useState(0);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (expanded && expandedRef.current) {
      setExpandedheight(expandedRef.current.scrollHeight);
    }
  }, [expanded]);

  return (
    <div className={cn(styles.queryStatsRow, {[styles.expanded]: expanded})}>
      <div className={styles.query}>{queryStats.query.slice(0, 150)}</div>
      <div className={styles.totalExec}>
        {formatDuration(queryStats.totalExecTime)}
      </div>
      <div className={styles.callCount}>{queryStats.calls.toString()}</div>
      <div className={styles.meanExec}>
        {formatDuration(queryStats.meanExecTime)}
      </div>

      <div className={styles.timeChart}>
        {!isMobile ? (
          <svg viewBox="-2 -2 104 24" preserveAspectRatio="none">
            {queryStats.stddevExecTime / state.maxExecTime > 0.005 ? (
              <path
                className={styles.distribution}
                vectorEffect="non-scaling-stroke"
                d={generateDistributionChart(
                  0,
                  100,
                  (queryStats.meanExecTime / state.maxExecTime) * 100,
                  (queryStats.stddevExecTime / state.maxExecTime) * 100,
                  200
                )}
              />
            ) : null}
            <path
              vectorEffect="non-scaling-stroke"
              d={`M ${
                (queryStats.minExecTime / state.maxExecTime) * 100
              } 0 V 20 M ${
                (queryStats.meanExecTime / state.maxExecTime) * 100
              } 0 V 20 M ${
                (queryStats.maxExecTime / state.maxExecTime) * 100
              } 0 V 20`}
            />
          </svg>
        ) : null}
      </div>

      <div
        className={styles.expandRow}
        onClick={() => state.toggleExpanded(queryStats.id)}
      >
        <ChevronDownIcon />
      </div>

      <div
        ref={expandedRef}
        className={styles.expandedDataWrapper}
        style={{height: expanded ? expandedHeight : 0}}
      >
        {expanded ? (
          <div className={styles.expandedData}>
            <div className={styles.fullData}>
              <div className={styles.dataItem}>
                <FieldHeader label="Min exec time" />
                {formatDuration(queryStats.minExecTime)}
              </div>

              <div className={styles.dataItem}>
                <FieldHeader label="Max exec time" />
                {formatDuration(queryStats.maxExecTime)}
              </div>

              <div className={styles.dataItem}>
                <FieldHeader label="Mean exec time" />
                {formatDuration(queryStats.meanExecTime)}
              </div>

              <div className={styles.dataItem}>
                <FieldHeader label="Exec time stddev" />
                {formatDuration(queryStats.stddevExecTime)}
              </div>

              <div className={styles.dataItem}>
                <FieldHeader label="Call count" />
                {queryStats.calls.toString()}
              </div>

              <div className={styles.dataItem}>
                <FieldHeader label="Total exec time" />
                {formatDuration(queryStats.totalExecTime)}
              </div>

              <div className={styles.dataItem}>
                <FieldHeader label="Min plan time" />
                {formatDuration(queryStats.minPlanTime)}
              </div>

              <div className={styles.dataItem}>
                <FieldHeader label="Max plan time" />
                {formatDuration(queryStats.maxPlanTime)}
              </div>

              <div className={styles.dataItem}>
                <FieldHeader label="Mean plan time" />
                {formatDuration(queryStats.meanPlanTime)}
              </div>

              <div className={styles.dataItem}>
                <FieldHeader label="Plan time stddev" />
                {formatDuration(queryStats.stddevPlanTime)}
              </div>

              <div className={styles.dataItem}>
                <FieldHeader label="Plan count" />
                {queryStats.plans.toString()}
              </div>

              <div className={styles.dataItem}>
                <FieldHeader label="Total plan time" />
                {formatDuration(queryStats.totalPlanTime)}
              </div>

              <div
                className={cn(styles.dataItem, styles.timeSince)}
                style={{gridColumn: "1 / span 2"}}
              >
                <FieldHeader label="Min/max since" />
                {queryStats.minmaxStatsSince.toLocaleString()}
              </div>

              <div
                className={cn(styles.dataItem, styles.timeSince)}
                style={{gridColumn: "3 / span 2"}}
              >
                <FieldHeader label="Stats since" />
                {queryStats.statsSince.toLocaleString()}
              </div>
            </div>

            {state.hasAnalyzePermissions ? (
              <Button
                className={styles.analyseQueryButton}
                kind="outline"
                onClick={() => state.setAnalyzeQuery(queryStats.query)}
              >
                Analyze Query
              </Button>
            ) : null}

            <div className={styles.fullQuery}>
              <CopyButton
                className={styles.copyButton}
                content={queryStats.query}
                mini
              />
              <CodeBlock
                code={queryStats.query}
                language={sqlLang}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});

function formatDuration(duration: number) {
  if (duration < 1) {
    return (
      <>
        {duration.toFixed(3)}
        <span>ms</span>
      </>
    );
  }
  if (duration < 1000) {
    return (
      <>
        {duration.toPrecision(3)}
        <span>ms</span>
      </>
    );
  }
  if (duration < 60_000) {
    return (
      <>
        {(duration / 1000).toFixed(2)}
        <span>s</span>
      </>
    );
  }
  if (duration < 3_600_000) {
    return (
      <>
        {(duration / 60_000).toFixed(2)}
        <span>m</span>
      </>
    );
  }
  return (
    <>
      {(duration / 3_600_000).toFixed(2)}
      <span>h</span>
    </>
  );
}

const SQRT2PI = Math.sqrt(2 * Math.PI);

function generateDistributionChart(
  min: number,
  max: number,
  mean: number,
  stddev: number,
  steps = 100,
  height = 20
) {
  let points = "M ";
  let stepSize = (max - min) / steps;
  let x = min;
  for (let i = 0; i <= steps; i++) {
    const z = (x - mean) / stddev;
    points += `${x} ${
      height -
      (Math.exp(-0.5 * z * z) / (stddev * SQRT2PI)) * height * (stddev / 0.4)
    } L `;
    x += stepSize;
  }
  return points.slice(0, -3);
}
