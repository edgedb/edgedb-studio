import {
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {reaction, runInAction} from "mobx";
import {observer} from "mobx-react-lite";

import {PostgreSQL, sql} from "@codemirror/lang-sql";

import {useInitialValue} from "@dbsof/common/hooks/useInitialValue";
import {useResize} from "@dbsof/common/hooks/useResize";
import {Theme, useTheme} from "@dbsof/common/hooks/useTheme";

import CodeBlock from "@dbsof/common/ui/codeBlock";
import {CustomScrollbars} from "@dbsof/common/ui/customScrollbar";
import Spinner from "@dbsof/common/ui/spinner";
import {Button} from "@dbsof/common/newui";
import cn from "@dbsof/common/utils/classNames";

import {
  CodeEditorProps,
  CodeEditorRef,
  createCodeEditor,
} from "@dbsof/code-editor";

import {
  DEFAULT_LINE_HEIGHT,
  DEFAULT_ROW_HEIGHT,
  InspectorRow,
  useInspectorKeybindings,
} from "@dbsof/inspector";
import inspectorStyles from "@dbsof/inspector/inspector.module.scss";

import {DatabaseTabSpec} from "../../components/databasePage";
import {ExplainType, ExplainVis} from "../../components/explainVis";
import {ExplainCodeBlock} from "../../components/explainVis/codeblock";
import {
  ExplainHighlightsRef,
  ExplainHighlightsRenderer,
} from "../../components/explainVis/codeEditorContexts";
import {
  ExtendedViewerContext,
  ExtendedViewerRenderer,
} from "../../components/extendedViewers";
import {TabReplIcon} from "../../icons";

import {useDatabaseState, useTabState} from "../../state";
import {
  defaultItemHeight,
  Repl,
  ReplHistoryItem as ReplHistoryItemState,
  ReplLang,
} from "./state";
import {OutputMode, QueryEditor} from "../queryEditor/state";
import {renderCommandResult} from "./commands";

import {useDBRouter} from "../../hooks/dbRoute";

import styles from "./repl.module.scss";
import {isEndOfStatement, replPrompt} from "./state/utils";
import {useIsMobile} from "@dbsof/common/hooks/useMobile";
import {RunButton} from "@dbsof/common/ui/mobile";
import {InspectorState} from "@dbsof/inspector/state";
import {InspectorContext} from "@dbsof/inspector/context";
import {outputModeToggle, QueryError} from "../queryEditor";
import {
  ResultGrid,
  ResultGridState,
} from "@dbsof/common/components/resultGrid";

const ReplView = observer(function ReplView() {
  const replState = useTabState(Repl);

  replState.navigation = useDBRouter().navigate;

  const initialScrollPos = useInitialValue(() => replState.initialScrollPos);

  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useResize(containerRef, ({height}) => setHeight(height));

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape" && replState.extendedViewerItem) {
        replState.setExtendedViewerItem(null);
      }
    };

    window.addEventListener("keydown", listener);

    return () => {
      window.removeEventListener("keydown", listener);
    };
  }, []);

  return (
    <div className={styles.replWrapper}>
      <div
        style={{display: "contents"}}
        className={cn({"dark-theme": replState.settings.retroMode})}
      >
        <div
          ref={containerRef}
          className={cn(styles.repl, {
            [styles.retroMode]: replState.settings.retroMode,
            [styles.showExtendedResult]: replState.extendedViewerItem !== null,
          })}
        >
          <CustomScrollbars innerClass={styles.scrollInner} reverse>
            <ReplList height={height} initialScrollPos={initialScrollPos} />
          </CustomScrollbars>
        </div>
      </div>

      {replState.extendedViewerItem ? (
        <div className={styles.extendedViewerContainer}>
          <ExtendedViewerContext.Provider
            value={{
              closeExtendedView: () => replState.setExtendedViewerItem(null),
            }}
          >
            <ExtendedViewerRenderer item={replState.extendedViewerItem} />
          </ExtendedViewerContext.Provider>
        </div>
      ) : null}
    </div>
  );
});

const ReplList = observer(function ReplList({
  height,
  initialScrollPos,
}: {
  height: number;
  initialScrollPos: number;
}) {
  const replState = useTabState(Repl);
  const dbState = useDatabaseState();

  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = initialScrollPos;
    }
  }, []);

  const [renderHeader, setRenderHeader] = useState(true);
  const [visibleBounds, setVisibleBounds] = useState<[number, number, number]>(
    [0, 0, 0]
  );

  const isMobile = useIsMobile();

  const headerHeight =
    (isMobile ? 360 : 275) + (replState._hasUnfetchedHistory ? 34 : 0);

  useEffect(() => {
    replState.scrollRef = ref.current;
  }, [ref]);

  const updateVisibleBounds = useCallback(() => {
    const el = ref.current!;
    const scrollTop = el.scrollHeight + el.scrollTop - el.clientHeight;

    setRenderHeader(scrollTop < headerHeight + 100);

    const historyCount = replState.itemHeights.historyCount;

    const startIndex = Math.max(
      0,
      replState.itemHeights.getIndexAtHeight(
        Math.max(0, scrollTop - headerHeight)
      ) +
        historyCount -
        2
    );
    const endIndex = Math.min(
      replState.itemHeights.getIndexAtHeight(
        Math.max(0, scrollTop - headerHeight + ref.current!.clientHeight)
      ) +
        historyCount +
        2,
      replState.queryHistory.length - 1
    );

    setVisibleBounds((old) =>
      old[0] === startIndex && old[1] === endIndex
        ? old
        : [
            startIndex,
            endIndex,
            old[0] !== startIndex
              ? replState.itemHeights.getHeightAtIndex(
                  startIndex - historyCount
                )
              : old[2],
          ]
    );
  }, [height, headerHeight, replState.queryHistory.length]);

  useEffect(() => {
    const el = ref.current!;

    const listener = () => {
      replState.initialScrollPos = el.scrollTop;
      updateVisibleBounds();
    };
    el.addEventListener("scroll", listener, {passive: true});

    return () => {
      el.removeEventListener("scroll", listener);
    };
  }, [updateVisibleBounds]);

  useEffect(() => {
    updateVisibleBounds();
  }, [replState.itemHeights.totalHeight, height]);

  const items: JSX.Element[] = [];
  if (replState.queryHistory.length) {
    const historyCount = replState.itemHeights.historyCount;
    let top = visibleBounds[2] + headerHeight;
    for (let i = visibleBounds[0]; i <= visibleBounds[1]; i++) {
      const item = replState.queryHistory[i];
      if (!item) break;
      items.push(
        <ReplHistoryItem
          key={item.$modelId}
          state={replState}
          historyIndex={i - historyCount}
          item={item}
          styleTop={top}
          dbName={dbState.name}
        />
      );
      top += item.renderHeight ?? defaultItemHeight;
    }
  }

  return (
    <div ref={ref} className={styles.list} style={{height}}>
      <div className={styles.scrollInner}>
        <div
          className={styles.listInner}
          style={{height: replState.itemHeights.totalHeight + headerHeight}}
        >
          {renderHeader ? <ReplHeader /> : null}
          {items}
        </div>
        <ReplInput />
      </div>
      <RunButton
        onClick={() => replState.runQuery()}
        isLoading={replState.queryRunning}
        onCancel={
          replState._runningQuery instanceof AbortController
            ? () => (replState._runningQuery as AbortController)?.abort()
            : undefined
        }
        disabled={
          !replState.canRunQuery &&
          !(replState._runningQuery instanceof AbortController)
        }
        className={styles.runBtn}
      />
    </div>
  );
});

export const replTabSpec: DatabaseTabSpec = {
  path: "repl",
  label: "REPL",
  icon: (active) => <TabReplIcon active={active} />,
  usesSessionState: true,
  state: Repl,
  element: <ReplView />,
};

const ReplInput = observer(function ReplInput() {
  const replState = useTabState(Repl);
  const dbState = useDatabaseState();

  const [_, theme] = useTheme();

  const CodeEditor = useMemo(() => {
    return createCodeEditor({
      language:
        replState.language === ReplLang.SQL
          ? sql({
              dialect: PostgreSQL,
            })
          : undefined,
      highlightActiveLine: false,
      terminalCursor: true,
      disableLineNumbers: true,
      customExtensions: [
        replPrompt({
          dbName: dbState.name,
          inputMode: replState.language === ReplLang.SQL ? "sql" : "query",
        }),
      ],
    });
  }, [dbState.name, replState.language]);

  const ref = useRef<CodeEditorRef>();

  useEffect(() => {
    if (!replState.queryRunning) {
      ref.current?.focus();
    }
  }, [replState.queryRunning]);

  useEffect(() => {
    if (replState._runningQuery instanceof AbortController) {
      const listener = (e: KeyboardEvent) => {
        if (e.ctrlKey && (e.key === "c" || e.key === "C")) {
          (replState._runningQuery as AbortController)?.abort();
        }
      };
      window.addEventListener("keydown", listener, {capture: true});

      return () => {
        window.removeEventListener("keydown", listener, {capture: true});
      };
    }
  }, [replState._runningQuery]);

  const keybindings = useMemo<CodeEditorProps["keybindings"]>(
    () => [
      {
        key: "Mod-Enter",
        run: () => {
          replState.runQuery();
          return true;
        },
        preventDefault: true,
      },
      {
        key: "Enter",
        run: (editor) => {
          const doc = editor.state.doc;
          if (
            (doc.lines === 1 && doc.line(1).text.trim().startsWith("\\")) ||
            isEndOfStatement(
              editor.state.doc.toString(),
              editor.state.selection
            )
          ) {
            replState.runQuery();
            return true;
          }
          return false;
        },
      },
      {
        key: "Mod-ArrowUp",
        run: () => {
          replState.navigateHistory(1);
          return true;
        },
      },
      {
        key: "Mod-ArrowDown",
        run: () => {
          replState.navigateHistory(-1);
          return true;
        },
      },
    ],
    [replState]
  );

  const onChange = useCallback<CodeEditorProps["onChange"]>(
    (value) => replState.setCurrentQuery(value),
    [replState]
  );

  return (
    <div
      className={cn(styles.replInput, {
        [styles.hidden]: replState.queryRunning,
      })}
      onKeyDownCapture={
        replState.queryRunning
          ? (e) => {
              // prevent keypresses while hidden
              e.preventDefault();
              e.stopPropagation();
            }
          : undefined
      }
    >
      <CustomScrollbars
        className={styles.scrollWrapper}
        scrollClass="cm-scroller"
        innerClass="cm-content"
      >
        <CodeEditor
          ref={ref}
          code={replState.currentQuery}
          onChange={onChange}
          keybindings={keybindings}
          useDarkTheme={replState.settings.retroMode || theme === Theme.dark}
          noPadding
        />
      </CustomScrollbars>
    </div>
  );
});

const InspectorRenderer = observer(function InspectorRenderer({
  replState,
  inspectorState,
  maxLines,
  offsetTop,
}: {
  replState: Repl;
  inspectorState: InspectorState;
  maxLines?: number;
  offsetTop: number;
}) {
  const vPad = DEFAULT_ROW_HEIGHT - DEFAULT_LINE_HEIGHT;
  const items = inspectorState.getItems();
  const noVirt = (items[1]?.height ?? 0) > 1;
  const itemsLength = maxLines
    ? Math.min(items.length, maxLines)
    : items.length;

  const [visibleItems, setVisibleItems] = useState([0, maxLines ?? 1]);

  useLayoutEffect(() => {
    const el = replState.scrollRef;
    if (!el || noVirt) return;

    const listener = () => {
      const scrollTop = el.scrollHeight + el.scrollTop - el.clientHeight;
      setVisibleItems([
        Math.min(
          itemsLength - 1,
          Math.max(
            0,
            Math.floor((scrollTop - offsetTop) / DEFAULT_ROW_HEIGHT) - 5
          )
        ),
        Math.min(
          itemsLength - 1,
          Math.max(
            maxLines ?? 0,
            Math.ceil(
              (scrollTop - offsetTop + el.clientHeight) / DEFAULT_ROW_HEIGHT
            ) + 5
          )
        ),
      ]);
    };
    listener();

    el.addEventListener("scroll", listener);

    return () => {
      el.removeEventListener("scroll", listener);
    };
  }, [itemsLength, offsetTop, replState.scrollRef, noVirt]);

  const onKeyDown = useInspectorKeybindings(inspectorState);

  const inspectorStyle = {
    "--lineHeight": `${DEFAULT_LINE_HEIGHT}px`,
    "--rowPad": `${vPad / 2}px`,
    gridAutoRows: DEFAULT_ROW_HEIGHT,
    ...(noVirt
      ? {
          height:
            DEFAULT_ROW_HEIGHT * 2 +
            items[1].height! * DEFAULT_LINE_HEIGHT +
            vPad,
          gridTemplateRows: `${DEFAULT_ROW_HEIGHT}px ${
            items[1].height! * DEFAULT_LINE_HEIGHT + vPad
          }px ${DEFAULT_ROW_HEIGHT}px`,
        }
      : {height: itemsLength * DEFAULT_ROW_HEIGHT}),
  } as any;

  return (
    <InspectorContext.Provider value={inspectorState}>
      <div
        className={cn(inspectorStyles.inspector, styles.inspector)}
        style={inspectorStyle}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <InspectorRendererInner
          inspectorState={inspectorState}
          startIndex={noVirt ? 0 : visibleItems[0]}
          endIndex={noVirt ? itemsLength : visibleItems[1]}
        />
      </div>
    </InspectorContext.Provider>
  );
});

const InspectorRendererInner = observer(function InspectorRendererInner({
  inspectorState,
  startIndex,
  endIndex,
}: {
  inspectorState: InspectorState;
  startIndex: number;
  endIndex: number;
}) {
  return (
    <>
      {inspectorState
        .getItems()
        .slice(startIndex, endIndex + 1)
        .map((item, i) => {
          const isExpanded = inspectorState.expanded!.has(item.id);
          const index = i + startIndex;
          return (
            <InspectorRow
              key={`${index}_${item.id}`}
              index={index}
              item={item}
              state={inspectorState}
              isExpanded={isExpanded}
              style={{gridRowStart: index + 1}}
              toggleExpanded={() => {
                isExpanded
                  ? inspectorState.collapseItem(index)
                  : inspectorState.expandItem(index);
              }}
            />
          );
        })}
    </>
  );
});

const ResultGridWrapper = observer(function ResultGridWrapper({
  replState,
  gridState,
  offsetTop,
  truncated,
}: {
  replState: Repl;
  gridState: ResultGridState;
  offsetTop: number;
  truncated: boolean;
}) {
  const [containerHeight, setContainerHeight] = useState(
    replState.scrollRef?.clientHeight ?? 0
  );
  useResize(replState.scrollRef, ({height}) => setContainerHeight(height));

  const contentHeight =
    gridState.grid.headerHeight + gridState.grid.gridContentHeight;

  useLayoutEffect(() => {
    const el = replState.scrollRef;
    const gridEl = gridState.grid.gridElRef;
    if (truncated || !el || !gridEl) return;

    const listener = () => {
      const scrollTop = el.scrollHeight + el.scrollTop - el.clientHeight;
      gridEl.scrollTop = scrollTop - offsetTop;
    };
    listener();

    el.addEventListener("scroll", listener);

    return () => {
      el.removeEventListener("scroll", listener);
    };
  }, [offsetTop, truncated, replState.scrollRef, gridState.grid.gridElRef]);

  return (
    <div
      className={styles.replResultGridWrapper}
      style={{
        height: contentHeight,
      }}
    >
      <ResultGrid
        state={gridState}
        className={styles.replResultGrid}
        noVerticalScroll
        style={{
          height: Math.min(containerHeight, contentHeight),
        }}
      />
    </div>
  );
});

const ReplHistoryItem = observer(function ReplHistoryItem({
  state,
  historyIndex,
  item,
  styleTop,
  dbName,
}: {
  state: Repl;
  historyIndex: number;
  item: ReplHistoryItemState;
  styleTop: number;
  dbName: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const editorState = useTabState(QueryEditor);
  const {navigate, currentPath} = useDBRouter();

  const runInEditor = () => {
    editorState.loadFromRepl(item);
    navigate(`${currentPath[0]}/editor`);
  };

  const replState = useTabState(Repl);
  const isMobile = useIsMobile();

  const containerRef = useRef<HTMLDivElement>(null);

  const updateScroll = useRef(false);

  const [data, setData] = useState(() =>
    item.hasResult
      ? state.resultDataCache.get(item.$modelId)?.result
      : undefined
  );

  useEffect(() => {
    if (item.hasResult && data === undefined) {
      state.getResultData(item.$modelId).promise.then((data) => setData(data));
    }
  }, [item.hasResult]);

  const [headerHeight, setHeaderHeight] = useState(0);
  useResize(headerRef, ({height}) => setHeaderHeight(height));

  useEffect(() => {
    const disposer = reaction(
      () => item._inspectorState?._items.length,
      (curr, prev) => {
        if (prev && curr !== prev) {
          updateScroll.current = true;
        }
      }
    );

    return () => {
      disposer();
      runInAction(() => {
        item._inspectorState = null;
        item._explainState = null;
      });
    };
  }, []);

  useResize(
    ref,
    ({height}) => {
      const paddedHeight = height + 16 + (item.showDateHeader ? 24 : 0);
      if (item.renderHeight !== paddedHeight) {
        if (item.renderHeight && state.scrollRef && updateScroll.current) {
          state.scrollRef.scrollTop += item.renderHeight - paddedHeight;

          updateScroll.current = false;
        }
        item.renderHeight = paddedHeight;
        state.itemHeights.updateItemHeight(historyIndex, paddedHeight);
      }
    },
    [item.showDateHeader]
  );

  let output: JSX.Element | null = null;
  let headerExtra: JSX.Element | null = null;
  let showExpandBtn = false;
  let showHeaderShadow = true;
  let hasScroll = false;

  if (item.error) {
    output = (
      <QueryError className={styles.queryError} error={item.error.data} />
    );
  } else if (item.status) {
    if (item.hasResult) {
      if (!data) {
        output = <>loading ...</>;
      } else if (item.isExplain) {
        output = (
          <div className={styles.explain}>
            <Button className={styles.runInEditorBtn} onClick={runInEditor}>
              View full UI in editor
            </Button>
            <ExplainVis
              state={item.getExplainState(data)}
              type={ExplainType.light}
              classes={styles.explainVis}
            />
          </div>
        );
      } else {
        const maxLines = item.showMore ? undefined : 16;

        const {mode, toggleEl} = outputModeToggle(
          data._codec,
          item.outputMode,
          (mode) => {
            updateScroll.current = true;
            item.setOutputMode(mode);
          }
        );

        headerExtra = (
          <div className={styles.resultModeHeader}>{toggleEl}</div>
        );

        if (mode === OutputMode.Tree) {
          const inspectorState = item.getInspectorState(data);

          showExpandBtn =
            !!maxLines && inspectorState.totalItemsLines > maxLines;

          output = (
            <InspectorRenderer
              replState={replState}
              inspectorState={inspectorState}
              maxLines={maxLines}
              offsetTop={
                styleTop + headerHeight + (item.showDateHeader ? 36 : 12)
              }
            />
          );
        } else {
          const gridState = item.getResultGridState(data);

          showExpandBtn = !!maxLines && gridState.rowCount > maxLines;
          showHeaderShadow = false;
          hasScroll = true;

          output = (
            <ResultGridWrapper
              replState={replState}
              gridState={gridState}
              truncated={showExpandBtn}
              offsetTop={
                styleTop + headerHeight + (item.showDateHeader ? 36 : 12)
              }
            />
          );
        }
      }
    } else {
      output = <div className={styles.queryStatus}>OK: {item.status}</div>;
    }
  } else if (item.commandResult) {
    output = renderCommandResult(state, item.commandResult.data);
  } else {
    output = (
      <>
        {!isMobile ? (
          <div className={styles.queryRunningSpinner} style={{marginLeft: 8}}>
            <Spinner size={18} />
            {replState._runningQuery instanceof AbortController ? (
              <div
                className={styles.queryCancelButton}
                onClick={() =>
                  (replState._runningQuery as AbortController).abort()
                }
              >
                Cancel query (Ctrl+C)
              </div>
            ) : null}
          </div>
        ) : null}
      </>
    );
  }

  const queryLines = item.query.split("\n").length;
  const truncateQuery = !item.showFullQuery && queryLines > 20;
  const promptLength = dbName.length + (item.lang === ReplLang.SQL ? 6 : 9);

  const marginLeftRepl = isMobile
    ? "0px"
    : item.isExplain
    ? "16px"
    : `${promptLength + 1}ch`;

  const expandButton = showExpandBtn ? (
    <div className={styles.showMore}>
      <button
        onClick={() => {
          item.setShowMore(true);
          updateScroll.current = true;
        }}
      >
        show more...
      </button>
    </div>
  ) : null;

  return (
    <div
      ref={ref}
      className={cn(styles.replHistoryItem, {
        [styles.showDateHeader]: item.showDateHeader,
        [styles.explain]: item.isExplain,
      })}
      style={{top: styleTop}}
    >
      {item.showDateHeader ? (
        <div className={styles.historyDateHeader}>
          {new Date(item.timestamp).toLocaleDateString()}
        </div>
      ) : null}
      <div
        ref={headerRef}
        className={cn(styles.historyHeader, {
          [styles.noOutput]: !output,
          [styles.noShadow]: !showHeaderShadow,
        })}
      >
        <div className={styles.historyQuery}>
          <div className={styles.historyPrompt}>
            {dbName}
            <span>{item.lang === ReplLang.SQL ? "[sql]" : "[query]"}</span>
            {">\n"}
            {Array((truncateQuery ? 20 : queryLines) - 1)
              .fill(".".repeat(promptLength))
              .join("\n")}
          </div>

          <CustomScrollbars
            className={styles.historyQueryCode}
            innerClass={styles.codeBlockContainer}
          >
            <div className={styles.scrollWrapper}>
              <div
                ref={containerRef}
                className={cn(styles.codeBlockContainer, {
                  [styles.truncateQuery]: truncateQuery,
                })}
              >
                <QueryCodeBlock item={item} containerRef={containerRef} />
                {item.error?.data.range ? (
                  <div
                    className={styles.codeBlockErrorLines}
                    style={{
                      top: `${
                        item.query
                          .slice(0, item.error.data.range[0])
                          .split("\n").length - 1
                      }em`,
                      height: `${
                        item.query
                          .slice(
                            item.error.data.range[0],
                            item.error.data.range[1]
                          )
                          .split("\n").length
                      }em`,
                    }}
                  />
                ) : null}
              </div>
              {truncateQuery ? (
                <div className={styles.showFullQuery}>
                  <button
                    onClick={() => {
                      item.setShowFullQuery(true);
                      updateScroll.current = true;
                    }}
                  >
                    show more...
                  </button>
                </div>
              ) : null}
            </div>
          </CustomScrollbars>
          {headerExtra}
          <div className={styles.historyTime}>
            {new Date(item.timestamp).toLocaleTimeString()}
          </div>
        </div>
        {item.warnings?.data.length ? (
          <div
            className={styles.queryWarnings}
            style={{
              paddingLeft: marginLeftRepl,
            }}
          >
            {item.warnings.data.map((warning, i) => (
              <QueryError
                key={i}
                className={styles.queryError}
                error={warning}
                errorName="Warning"
              />
            ))}
          </div>
        ) : null}
      </div>
      {output ? (
        !hasScroll ? (
          <CustomScrollbars
            className={styles.outputOuterWrapper}
            innerClass={styles.historyOutput}
            hideVertical
          >
            <div
              className={cn(styles.scrollWrapper, {
                [styles.sticky]: item.isExplain,
              })}
              style={
                showExpandBtn
                  ? {maxHeight: 16 * DEFAULT_ROW_HEIGHT}
                  : undefined
              }
            >
              <div
                className={cn(styles.historyOutput, {
                  [styles.wrapContent]: item.error != null,
                  [styles.explain]: item.isExplain,
                })}
                style={{
                  marginLeft: marginLeftRepl,
                }}
              >
                {output}
              </div>
              {expandButton}
            </div>
          </CustomScrollbars>
        ) : (
          <div
            style={
              showExpandBtn
                ? {maxHeight: 16 * DEFAULT_ROW_HEIGHT, overflow: "hidden"}
                : undefined
            }
          >
            {output}
            {expandButton}
          </div>
        )
      ) : null}
    </div>
  );
});

const QueryCodeBlock = observer(function QueryCodeBlock({
  item,
  containerRef,
}: {
  item: ReplHistoryItemState;
  containerRef: RefObject<HTMLElement>;
}) {
  const [ref, setRef] = useState<ExplainHighlightsRef | null>(null);

  const explainHighlightsRef = useCallback((node: any) => {
    if (node) {
      setRef(node);
    }
  }, []);

  useEffect(() => {
    if (ref && containerRef.current) {
      ref.updateContextRects(containerRef.current);
    }
  }, [ref]);

  return item.isExplain ? (
    <>
      <ExplainCodeBlock
        className={cn(styles.code)}
        code={item.query}
        explainContexts={item._explainState?.contextsByBufIdx[0] ?? []}
      />
      {item._explainState ? (
        <ExplainHighlightsRenderer
          ref={explainHighlightsRef}
          state={item._explainState}
          isEditor={false}
        />
      ) : null}
    </>
  ) : (
    <CodeBlock
      className={cn(styles.code)}
      code={item.query}
      customRanges={[
        ...(item.error?.data.range
          ? [
              {
                range: item.error.data.range,
                style: styles.errorUnderline,
              },
            ]
          : []),
        ...(item.warnings?.data
          .filter((w) => w.range != null)
          .map((w) => ({range: w.range!, style: styles.warningUnderline})) ??
          []),
      ]}
    />
  );
});

const headerASCII = `
       /$$ /$$                            /$$$$$$ 
      | $$| $$                           /$$__  $$
  /$$$$$$$| $$$$$$$   /$$$$$$$  /$$$$$$ | $$  \\__/
 /$$__  $$| $$__  $$ /$$_____/ /$$__  $$| $$$$    
| $$  | $$| $$  \\ $$|  $$$$$$ | $$  \\ $$| $$_/    
| $$  | $$| $$  | $$ \\____  $$| $$  | $$| $$      
|  $$$$$$$| $$$$$$$/ /$$$$$$$/|  $$$$$$/| $$      
 \\_______/|_______/ |_______/  \\______/ |__/    

`.replace(/\$+/g, "<span>$&</span>");

const ReplHeader = observer(function ReplHeader() {
  const replState = useTabState(Repl);

  useEffect(() => {
    if (replState._hasUnfetchedHistory && !replState._fetchingHistory) {
      replState.fetchReplHistory();
    }
  }, [replState._hasUnfetchedHistory, replState._fetchingHistory]);

  const ctrlKey = navigator.platform.toLowerCase().includes("mac")
    ? "Cmd"
    : "Ctrl";

  return (
    <div className={styles.replHeader}>
      <div
        className={styles.headerAscii}
        dangerouslySetInnerHTML={{__html: headerASCII}}
      />
      <div className={styles.headerMsg}>
        Welcome to Studio repl, type{" "}
        <span onClick={() => replState.runQuery("\\help")}>\help</span> for
        commands list
        <br />
        <br />
        Shortcuts: <i>{ctrlKey}+Enter</i> to run query,{" "}
        <i>{ctrlKey}+ArrowUp/Down</i> to navigate history,{" "}
        <span onClick={() => replState.runQuery("\\clear")}>\clear</span> to
        clear the history
      </div>
      {replState._hasUnfetchedHistory ? (
        <div className={styles.historyLoading}>
          <Spinner size={24} strokeWidth={2} period={1} />
        </div>
      ) : null}
    </div>
  );
});
