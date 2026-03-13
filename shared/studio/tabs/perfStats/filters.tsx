import {useEffect, useRef, useState} from "react";
import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";
import {
  Checkbox,
  ChevronDownIcon,
  CrossIcon,
  FieldHeader,
} from "@dbsof/common/newui";

import {PerfStatsState, TagFilterGroup} from "./state";

import styles from "./perfStats.module.scss";
import {formatDurationLabel} from "./utils";

export function StatsFilters({state}: {state: PerfStatsState}) {
  return (
    <div className={styles.filters}>
      <TagFilter state={state} />

      <ExecTimeFilter state={state} />
    </div>
  );
}

const tagGroupNames: {[group in TagFilterGroup]: string} = {
  [TagFilterGroup.App]: "All app tags",
  [TagFilterGroup.Repl]: "All REPL tags",
  [TagFilterGroup.Internal]: "All internal tags",
};

export const TagFilter = observer(function TagFilter({
  state,
}: {
  state: PerfStatsState;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      const listener = (e: MouseEvent) => {
        if (!ref.current?.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      window.addEventListener("mousedown", listener, {capture: true});

      return () => {
        window.removeEventListener("mousedown", listener, {capture: true});
      };
    }
  }, [open]);

  return (
    <div className={styles.tagFilter}>
      <FieldHeader label="Tags" />
      <div className={styles.tagFilterField} onClick={() => setOpen(true)}>
        <div className={styles.input}>
          <div className={styles.tagsList}>
            {[...state.tagsFilter].map((tag) => (
              <div
                key={tag}
                className={cn(styles.tag, {
                  [styles.untagged]: tag === "",
                  [styles.group]: typeof tag !== "string",
                })}
              >
                {typeof tag === "string"
                  ? tag || <span>untagged</span>
                  : tagGroupNames[tag]}
              </div>
            ))}
          </div>
          <ChevronDownIcon />
        </div>

        <div ref={ref} className={cn(styles.dropdown, {[styles.open]: open})}>
          <Checkbox
            className={styles.header}
            label="Application / User"
            checked={state.tagsFilter.has(TagFilterGroup.App)}
            onChange={() => state.toggleTagFilter(TagFilterGroup.App)}
          />
          {state.allTags[TagFilterGroup.App].map((tag) => (
            <Checkbox
              key={tag}
              className={styles.item}
              label={tag || <span>untagged</span>}
              checked={
                state.tagsFilter.has(TagFilterGroup.App) ||
                state.tagsFilter.has(tag)
              }
              onChange={() => state.toggleTagFilter(tag)}
            />
          ))}

          <Checkbox
            className={styles.header}
            label="REPL"
            checked={state.tagsFilter.has(TagFilterGroup.Repl)}
            onChange={() => state.toggleTagFilter(TagFilterGroup.Repl)}
          />
          {state.allTags[TagFilterGroup.Repl].map((tag) => (
            <Checkbox
              key={tag}
              className={styles.item}
              label={tag}
              checked={
                state.tagsFilter.has(TagFilterGroup.Repl) ||
                state.tagsFilter.has(tag)
              }
              onChange={() => state.toggleTagFilter(tag)}
            />
          ))}

          <Checkbox
            className={styles.header}
            label="Internal / Extension / Tools"
            checked={state.tagsFilter.has(TagFilterGroup.Internal)}
            onChange={() => state.toggleTagFilter(TagFilterGroup.Internal)}
          />
          {state.allTags[TagFilterGroup.Internal].map((tag) => (
            <Checkbox
              key={tag}
              className={styles.item}
              label={tag}
              checked={
                state.tagsFilter.has(TagFilterGroup.Internal) ||
                state.tagsFilter.has(tag)
              }
              onChange={() => state.toggleTagFilter(tag)}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

export const ExecTimeFilter = observer(function ExecTimeFilter({
  state,
}: {
  state: PerfStatsState;
}) {
  return (
    <div className={styles.execTimeFilter}>
      <FieldHeader className={styles.fieldHeader} label="Mean exec time" />
      <div className={styles.execTimeFilterField}>
        {state.timeFilter ? (
          <>
            {formatDurationLabel({start: state.timeFilter[0]})} -{" "}
            {formatDurationLabel({start: state.timeFilter[1]})}
            <div
              className={styles.resetFilter}
              onClick={() => state.setTimeFilter(null)}
            >
              <CrossIcon />
            </div>
          </>
        ) : state.histogram ? (
          <>
            {formatDurationLabel({start: state.histogram.data[0].start})} -{" "}
            {formatDurationLabel({
              start: state.histogram.data[state.histogram.data.length - 1].end,
            })}
          </>
        ) : (
          <div className={styles.noFilter}>no data</div>
        )}
      </div>
    </div>
  );
});
