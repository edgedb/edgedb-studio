import {useEffect, useState} from "react";
import {observer} from "mobx-react";

import cn from "@edgedb/common/utils/classNames";
import CodeBlock from "@edgedb/common/ui/codeBlock";

import styles from "./replHistoryCell.module.scss";

import {
  ReplErrorCell,
  ReplExpandableCell,
  ReplHistoryCell as ReplHistoryCellState,
  ReplResultCell,
} from "../state";
import {currentDate} from "../state/currentDate";
import {QueryDuration} from "../../../state/connection";

import {formatDuration} from "../../../utils/formatDuration";

import Inspector from "@edgedb/inspector/v2";
import {ChevronIcon} from "../../../icons";

interface ReplHistoryCellProps {
  cell: ReplHistoryCellState;
}

export default observer(function ReplHistoryCell({
  cell,
}: ReplHistoryCellProps) {
  const cellExpanded = cell instanceof ReplExpandableCell && cell.expanded;

  const inScriptBlock = (cell.scriptBlock?.cells.length ?? 0) > 1;

  return (
    <div
      className={cn(
        styles.historyBlock,

        {
          [styles.insideScriptBlock]: inScriptBlock,
          [styles.scriptBlockFirst]:
            inScriptBlock && cell.isFirstInScriptBlock,
          [styles.scriptBlockLast]: inScriptBlock && cell.isLastInScriptBlock,

          [styles.expanded]: cellExpanded,
        }
      )}
    >
      <div className={styles.blockBody}>
        {inScriptBlock && cell.isLastInScriptBlock ? (
          <div className={styles.scriptBlockHeader}>
            <div className={styles.scriptBlockLabel}>Query Group</div>
            <button
              className={styles.smallButton}
              onClick={() => cell.scriptBlock!.edit()}
            >
              Edit
            </button>
            <CopyButton action={() => cell.scriptBlock!.copyToClipboard()} />
          </div>
        ) : null}
        <div className={cn(styles.cell)}>
          {cell instanceof ReplExpandableCell ? (
            <div
              className={styles.collapse}
              onClick={() => cell.toggleExpanded()}
            >
              <ChevronIcon className={styles.collapseIcon} />
            </div>
          ) : null}
          <div className={styles.inputBlock}>
            <ReplCellHeader cell={cell} expanded={cellExpanded} />
          </div>
          {cellExpanded ? (
            <div className={styles.outputBlock}>
              <div className={styles.header}>
                <div className={styles.blockLabel}>
                  {cell instanceof ReplResultCell ? "Output" : "Error"}
                </div>
                {cell instanceof ReplErrorCell ? (
                  <div className={styles.queryError}>
                    <span className={styles.errorName}>
                      {cell.error.data.name}
                    </span>
                    : {cell.error.data.msg}
                    {cell.error.data.hint ? (
                      <div className={styles.errorHint}>
                        Hint: {cell.error.data.hint}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className={styles.info}>
                  {cell instanceof ReplResultCell && cell._result ? (
                    <CopyButton
                      label="Copy as JSON"
                      action={() => cell.copyAsJson()}
                    />
                  ) : null}
                  <div className={styles.infoLabel}>
                    {/*<ReplQueryDuration duration={cell.duration} />*/}
                  </div>
                </div>
              </div>

              {cell instanceof ReplResultCell ? (
                cell.inspectorState ? (
                  <Inspector
                    className={styles.inspector}
                    state={cell.inspectorState}
                    maxHeight={400}
                  />
                ) : (
                  <div className={styles.queryStatus}>OK: {cell.status}</div>
                )
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

function CopyButton({
  label = "Copy",
  action,
}: {
  label?: string;
  action: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (copied) {
      const timeout = setTimeout(() => setCopied(false), 1000);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [copied]);

  return (
    <button
      className={styles.smallButton}
      onClick={() => {
        setCopied(true);
        action();
      }}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

interface ReplCellHeaderProps {
  cell: ReplHistoryCellState;
  expanded?: boolean;
  inject?: JSX.Element | null;
}

const ReplCellHeader = observer(function _ReplCellHeader({
  cell,
  expanded,
  inject,
}: ReplCellHeaderProps) {
  const date = new Date(cell.timestamp);

  const time = currentDate.isToday(date)
    ? date.toLocaleTimeString()
    : date.toLocaleString();

  return (
    <>
      <div className={styles.header}>
        <div className={styles.blockLabel}>Input</div>
        {!expanded ? (
          <div className={cn(styles.code, styles.collapsedQuery)}>
            {cell.query}
          </div>
        ) : null}

        <div className={styles.info}>
          {inject}

          {expanded ? (
            <>
              <button
                className={styles.smallButton}
                onClick={() => cell.edit()}
              >
                Edit
              </button>
              <CopyButton action={() => cell.copyToClipboard()} />
            </>
          ) : null}

          <div className={styles.infoLabel}>{time}</div>
        </div>
      </div>
      {expanded ? (
        <CodeBlock
          className={cn(styles.code, styles.query)}
          code={cell.query}
          customRanges={
            cell instanceof ReplErrorCell && cell.error.data.range
              ? [{range: cell.error.data.range, style: styles.errorUnderline}]
              : undefined
          }
        />
      ) : null}
    </>
  );
});

interface ReplQueryDurationProps {
  duration: number | QueryDuration;
}

function ReplQueryDuration({duration}: ReplQueryDurationProps) {
  const totalDuration =
    typeof duration === "number"
      ? duration
      : duration.prepare + duration.execute;

  return (
    <div className={styles.queryDuration}>
      {formatDuration(totalDuration)}
      {typeof duration !== "number" ? (
        <div className={styles.queryDurationTooltip}>
          <span>Prepare</span>
          {formatDuration(duration.prepare)}
          <br />
          <span>Execute</span>
          {formatDuration(duration.execute)}
        </div>
      ) : null}
    </div>
  );
}
