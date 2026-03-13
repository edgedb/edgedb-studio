import {
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {observer} from "mobx-react-lite";
import {Text} from "@codemirror/state";
import {sql, PostgreSQL} from "@codemirror/lang-sql";

import cn from "@dbsof/common/utils/classNames";

import {CodeEditorRef, createCodeEditor} from "@dbsof/code-editor";

import styles from "./queryeditor.module.scss";

import {useDatabaseState, useTabState} from "../../state";
import {
  QueryEditor,
  QueryHistoryResultItem,
  QueryHistoryErrorItem,
  EditorKind,
  QueryHistoryItem,
  OutputMode,
  explainStateCache,
} from "./state";

import {DatabaseTabSpec} from "../../components/databasePage";

import {Theme, useTheme} from "@dbsof/common/hooks/useTheme";

import SplitView from "@dbsof/common/ui/splitView";
import {CustomScrollbars} from "@dbsof/common/ui/customScrollbar";

import {
  Button,
  HistoryIcon,
  IconToggle,
  RunIcon,
  SplitViewIcon,
  TableViewIcon,
  TreeViewIcon,
} from "@dbsof/common/newui";

import {HistoryPanel} from "./history";
import {ParamsEditorPanel} from "./paramEditor";
import {TabEditorIcon} from "../../icons";
import {useResize} from "@dbsof/common/hooks/useResize";
import {VisualQuerybuilder} from "../../components/visualQuerybuilder";
import Inspector from "@dbsof/inspector";
import {ResultGrid} from "@dbsof/common/components/resultGrid";
import {
  ExtendedViewerContext,
  ExtendedViewerRenderer,
} from "../../components/extendedViewers";
import {InspectorState} from "@dbsof/inspector/state";
import inspectorStyles from "@dbsof/inspector/inspector.module.scss";
import Spinner from "@dbsof/common/ui/spinner";
import {ExplainVis} from "../../components/explainVis";
import {CodeEditorExplainContexts} from "../../components/explainVis/codeEditorContexts";
import {ExplainStateType} from "../../components/explainVis/state";
import {LabelsSwitch, switchState} from "@dbsof/common/ui/switch";
import {useIsMobile} from "@dbsof/common/hooks/useMobile";
import {ResultSet} from "@dbsof/common/decodeRawBuffer";
import {ObjectCodec} from "@dbsof/platform/client";
import {ICodec} from "@dbsof/platform/client";
import {SplitViewDirection} from "@dbsof/common/ui/splitView/model";
import {createPortal} from "react-dom";
import {RelativeTime} from "@dbsof/common/utils/relativeTime";
import {RecordCodec} from "@dbsof/platform/client";
import {ErrorDetails} from "../../utils/extractErrorDetails";

export const QueryEditorView = observer(function QueryEditorView() {
  const editorState = useTabState(QueryEditor);
  const isMobile = useIsMobile();

  const outputModeTargetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        (e.key === "h" && (e.ctrlKey || e.metaKey)) ||
        (e.key === "Escape" && editorState.showHistory)
      ) {
        if (e.key === "h") {
          e.preventDefault();
        }
        editorState.setShowHistory(!editorState.showHistory);
      }
      if (e.key === "Escape" && editorState.extendedViewerItem) {
        editorState.setExtendedViewerItem(null);
      }
      if (e.key === "c" && e.ctrlKey && editorState.queryRunning) {
        editorState.runningQueryAbort?.abort();
      }
    };

    window.addEventListener("keydown", listener);

    return () => {
      window.removeEventListener("keydown", listener);
    };
  }, [editorState.showHistory]);

  return (
    <div
      className={cn(styles.wrapper, {
        [styles.showExtendedResult]: editorState.extendedViewerItem !== null,
        [styles.showHistory]: editorState.showHistory,
      })}
    >
      <div className={styles.historyPanelWrapper}>
        <HistoryPanel className={styles.historyPanel} />
      </div>

      <div className={styles.mainPanel}>
        <div className={styles.header}>
          <div
            className={cn(styles.historyButton, {
              [styles.disabled]: editorState.queryHistory.length === 0,
            })}
            onClick={() => editorState.setShowHistory(true)}
          >
            <HistoryIcon />
          </div>

          <div className={styles.tabs}>
            <div
              className={cn(styles.tab, {
                [styles.selected]:
                  editorState.selectedEditor === EditorKind.NativeQL,
              })}
              onClick={() => editorState.setSelectedEditor(EditorKind.NativeQL)}
            >
              <span>SQL</span>
              {/* <EditorTabIcon /> */}
            </div>
            <div
              className={cn(styles.tab, {
                [styles.selected]:
                  editorState.selectedEditor === EditorKind.VisualBuilder,
              })}
              onClick={() =>
                editorState.setSelectedEditor(EditorKind.VisualBuilder)
              }
            >
              <span>SQL Builder</span>
              {/* <BuilderTabIcon /> */}
            </div>
          </div>

          <div className={styles.controls}>
            {!isMobile && editorState.currentResult ? (
              editorState.currentQueryEdited ? (
                <div className={styles.resultOutdatedNote}>
                  Result outdated
                </div>
              ) : (
                <div
                  className={styles.resultTimestampNote}
                  title={new Date(
                    editorState.currentResult.timestamp
                  ).toLocaleString()}
                >
                  <RelativeTime
                    timestamp={editorState.currentResult.timestamp}
                    fullNames
                  />
                </div>
              )
            ) : null}

            <div
              ref={outputModeTargetRef}
              className={styles.outputModeTargetRef}
            />

            {isMobile ? (
              <LabelsSwitch
                labels={["Query", "Result"]}
                value={
                  editorState.splitView.activeViewIndex
                    ? switchState.right
                    : switchState.left
                }
                onChange={() =>
                  editorState.splitView.setActiveViewIndex(
                    editorState.splitView.activeViewIndex ? 0 : 1
                  )
                }
              />
            ) : null}

            <IconToggle
              className={styles.splitViewToggle}
              options={[
                {
                  key: SplitViewDirection.horizontal,
                  icon: <SplitViewIcon style={{transform: "rotate(90deg)"}} />,
                  label: "Split vertical",
                },
                {
                  key: SplitViewDirection.vertical,
                  icon: <SplitViewIcon />,
                  label: "Split horizontal",
                },
              ]}
              selectedOption={editorState.splitView.direction}
              onSelectOption={(direction) =>
                editorState.splitView.setDirection(direction)
              }
            />

            {isMobile &&
            editorState.splitView.activeViewIndex ==
              1 ? null : !editorState.queryRunning ? (
              <Button
                kind="primary"
                className={styles.runBtn}
                shortcut={
                  !isMobile
                    ? {
                        default: "Ctrl+Enter",
                        macos: "⌘+Enter",
                      }
                    : undefined
                }
                leftIcon={<RunIcon />}
                disabled={!editorState.canRunQuery}
                onClick={() => editorState.runQuery()}
              >
                Run
              </Button>
            ) : (
              <Button
                className={styles.cancelBtn}
                shortcut={!isMobile ? "Ctrl+C" : undefined}
                leftIcon={<Spinner size={16} strokeWidth={1.5} />}
                onClick={() => editorState.runningQueryAbort?.abort()}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>

        <SplitView
          state={editorState.splitView}
          minViewSize={20}
          views={[
            <div
              className={cn(styles.editorBlock, {
                [styles.horizontalSplit]:
                  !isMobile &&
                  editorState.splitView.direction ===
                    SplitViewDirection.vertical,
              })}
            >
              {editorState.selectedEditor === EditorKind.NativeQL ||
              editorState.selectedEditor === EditorKind.SQL ? (
                <>
                  <div className={styles.editorBlockInner}>
                    <QueryCodeEditor key={editorState.selectedEditor} />
                  </div>
                  <ParamsEditorPanel
                    state={editorState.paramsEditor!}
                    runQuery={() => editorState.runQuery()}
                    horizontalSplit={
                      !isMobile &&
                      editorState.splitView.direction ===
                        SplitViewDirection.vertical
                    }
                  />
                </>
              ) : (
                <VisualQuerybuilder
                  state={
                    editorState.currentQueryData[EditorKind.VisualBuilder]
                  }
                />
              )}
            </div>,
            <QueryResult
              key={editorState.currentResult?.$modelId}
              state={editorState}
              result={editorState.currentResult}
              outputModeTargetRef={outputModeTargetRef}
            />,
          ]}
        />
      </div>

      {editorState.extendedViewerItem ? (
        <div className={styles.extendedViewerContainer}>
          <ExtendedViewerContext.Provider
            value={{
              closeExtendedView: () => editorState.setExtendedViewerItem(null),
            }}
          >
            <ExtendedViewerRenderer item={editorState.extendedViewerItem} />
          </ExtendedViewerContext.Provider>
        </div>
      ) : null}
    </div>
  );
});

const QueryCodeEditor = observer(function QueryCodeEditor() {
  const dbState = useDatabaseState();
  const editorState = useTabState(QueryEditor);
  const [ref, setRef] = useState<CodeEditorRef | null>(null);

  const [_, theme] = useTheme();

  const CodeEditor = useMemo(() => {
    return createCodeEditor({
      language:
        editorState.selectedEditor === EditorKind.SQL
          ? sql({
              dialect: PostgreSQL,
            })
          : undefined,
    });
  }, [editorState.selectedEditor]);

  useEffect(() => {
    if (!editorState.showHistory) {
      ref?.focus();
    }
  }, [ref, editorState.showHistory]);

  const keybindings = useMemo(
    () => [
      {
        key: "Mod-Enter",
        run: () => {
          editorState.runQuery();
          return true;
        },
        preventDefault: true,
      },
    ],
    [editorState]
  );

  const onChange = useCallback(
    (value: Text) => editorState.setQueryText(value),
    [editorState]
  );

  const codeEditorRef = useCallback((ref: any) => {
    setRef(ref);
  }, []);

  const explainState =
    editorState.currentResult instanceof QueryHistoryResultItem &&
    (editorState.currentResult.status === ExplainStateType.explain ||
      editorState.currentResult.status === ExplainStateType.analyzeQuery)
      ? explainStateCache.get(editorState.currentResult.$modelId)
      : null;

  return (
    <>
      <CustomScrollbars
        className={styles.scrollWrapper}
        scrollClass="cm-scroller"
        innerClass="cm-content"
      >
        <CodeEditor
          ref={codeEditorRef}
          code={editorState.currentQueryText!}
          onChange={onChange}
          keybindings={keybindings}
          useDarkTheme={theme === Theme.dark}
          readonly={editorState.showHistory}
          schemaObjects={dbState.schemaData?.objectsByName}
          errorUnderline={
            editorState.showEditorResultDecorations &&
            editorState.currentResult instanceof QueryHistoryErrorItem
              ? editorState.currentResult.error.data.range
              : undefined
          }
          warningUnderlines={
            editorState.showEditorResultDecorations &&
            editorState.currentResult instanceof QueryHistoryResultItem
              ? editorState.currentResult.warnings?.data
                  .map((w) => w.range)
                  .filter((r) => r != null)
              : undefined
          }
          explainContexts={
            editorState.showEditorResultDecorations && explainState
              ? {
                  contexts: explainState.contextsByBufIdx,
                  buffers: explainState.buffers.data,
                }
              : undefined
          }
        />
      </CustomScrollbars>
      {ref && editorState.showEditorResultDecorations && explainState ? (
        <CodeEditorExplainContexts editorRef={ref} state={explainState} />
      ) : null}
    </>
  );
});

const ResultInspector = observer(function ResultInspector({
  state,
  isMobile,
}: {
  state: InspectorState;
  isMobile: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useResize(ref, ({height}) => setHeight(height));

  const [innerClass, setInnerClass] = useState<Element | null>(null);

  useEffect(() => {
    setInnerClass(
      ref.current!.querySelector(`.${inspectorStyles.innerWrapper}`)
    );
  }, [height]);

  return (
    <div
      ref={ref}
      style={{minHeight: 0, height: "100%", minWidth: 0, width: "100%"}}
    >
      <CustomScrollbars innerClass={innerClass}>
        <Inspector
          className={styles.inspector}
          state={state}
          height={height}
          bottomPadding={isMobile ? 60 : undefined}
        />
      </CustomScrollbars>
    </div>
  );
});

const QueryResult = observer(function QueryResult({
  state,
  result,
  outputModeTargetRef,
}: {
  state: QueryEditor;
  result: QueryHistoryItem | null;
  outputModeTargetRef: RefObject<HTMLDivElement>;
}) {
  const isMobile = useIsMobile();
  const [data, setData] = useState<ResultSet | null>(null);

  useEffect(() => {
    if (
      !data &&
      result instanceof QueryHistoryResultItem &&
      result.hasResult
    ) {
      state.getResultData(result.$modelId).then((data) => setData(data));
    }
  }, [data]);

  if (!result) {
    return null;
  }

  let content: JSX.Element | null = null;
  let headerContent: JSX.Element | null = null;

  if (result instanceof QueryHistoryResultItem) {
    if (result.hasResult) {
      if (data === null) {
        content = (
          <div className={styles.inspectorLoading}>
            <Spinner size={24} />
          </div>
        );
      } else if (
        result.status === "EXPLAIN" ||
        result.status === "ANALYZE QUERY"
      ) {
        content = <ExplainVis state={result.getExplainState(data)} />;
      } else {
        const {mode, toggleEl} = outputModeToggle(
          data._codec,
          state.outputMode,
          state.setOutputMode.bind(state)
        );

        headerContent = toggleEl;

        content = (
          <>
            {result.warnings?.data.length ? (
              <div className={styles.queryWarnings}>
                {result.warnings.data.map((warning, i) => (
                  <QueryError key={i} error={warning} errorName="Warning" />
                ))}
              </div>
            ) : null}
            {mode === OutputMode.Grid ? (
              <ResultGrid
                state={result.getResultGridState(data)}
                bottomPadding={isMobile ? 60 : undefined}
              />
            ) : (
              <ResultInspector
                state={result.getInspectorState(data)}
                isMobile={isMobile}
              />
            )}
          </>
        );
      }
    } else {
      content = (
        <div className={styles.queryStatus}>
          {result.status && "OK: "}
          {result.status}
        </div>
      );
    }
  } else if (result instanceof QueryHistoryErrorItem) {
    content = <QueryError error={result.error.data} />;
  }

  return (
    <div className={styles.queryResult}>
      {outputModeTargetRef.current
        ? createPortal(headerContent, outputModeTargetRef.current)
        : null}
      {content}
    </div>
  );
});

export function QueryError({
  className,
  error,
  errorName,
}: {
  className?: string;
  error: ErrorDetails;
  errorName?: string;
}) {
  return (
    <div className={cn(styles.queryError, className)}>
      <span className={styles.errorName}>{errorName ?? error.name}</span>:{" "}
      {error.msg}
      {error.details ? (
        <div className={styles.errorHint}>Details: {error.details}</div>
      ) : null}
      {error.hint ? (
        <div className={styles.errorHint}>Hint: {error.hint}</div>
      ) : null}
    </div>
  );
}

export function outputModeToggle(
  codec: ICodec,
  outputMode: OutputMode,
  setOutputMode: (mode: OutputMode) => void
) {
  const tableOutputAvailable =
    codec instanceof ObjectCodec || codec instanceof RecordCodec;
  const mode = tableOutputAvailable ? outputMode : OutputMode.Tree;

  return {
    mode,
    toggleEl: (
      <IconToggle
        className={styles.outputModeToggle}
        options={[
          {
            key: OutputMode.Tree,
            icon: <TreeViewIcon />,
            label: "Tree",
          },
          {
            key: OutputMode.Grid,
            icon: <TableViewIcon />,
            label: "Table",
            disabled: !tableOutputAvailable,
          },
        ]}
        selectedOption={mode}
        onSelectOption={setOutputMode}
      />
    ),
  };
}

export const editorTabSpec: DatabaseTabSpec = {
  path: "editor",
  label: "Editor",
  icon: (active) => <TabEditorIcon active={active} />,
  usesSessionState: true,
  state: QueryEditor,
  element: <QueryEditorView />,
};

// function EditorTabIcon() {
//   return (
//     <svg
//       width="16"
//       height="16"
//       viewBox="0 0 16 16"
//       fill="none"
//       xmlns="http://www.w3.org/2000/svg"
//     >
//       <path
//         fillRule="evenodd"
//         clipRule="evenodd"
//         d="M1 0C0.447715 0 0 0.447715 0 1V15C0 15.5523 0.447715 16 1 16H15C15.5523 16 16 15.5523 16 15V1C16 0.447715 15.5523 0 15 0H1ZM12.7071 4.70711C13.0976 4.31658 13.0976 3.68342 12.7071 3.29289C12.3166 2.90237 11.6834 2.90237 11.2929 3.29289L5.29289 9.29289C4.90237 9.68342 4.90237 10.3166 5.29289 10.7071C5.68342 11.0976 6.31658 11.0976 6.70711 10.7071L12.7071 4.70711ZM4 13C4.55228 13 5 12.5523 5 12C5 11.4477 4.55228 11 4 11C3.44772 11 3 11.4477 3 12C3 12.5523 3.44772 13 4 13Z"
//       />
//     </svg>
//   );
// }

// function BuilderTabIcon() {
//   return (
//     <svg
//       width="16"
//       height="16"
//       viewBox="0 0 16 16"
//       fill="none"
//       xmlns="http://www.w3.org/2000/svg"
//     >
//       <path
//         fillRule="evenodd"
//         clipRule="evenodd"
//         d="M1 0C0.447715 0 0 0.447715 0 1V15C0 15.5523 0.447715 16 1 16H15C15.5523 16 16 15.5523 16 15V1C16 0.447715 15.5523 0 15 0H1ZM3 4C3 3.44772 3.44772 3 4 3H9C9.55228 3 10 3.44772 10 4C10 4.55228 9.55228 5 9 5H4C3.44772 5 3 4.55228 3 4ZM3 8C3 7.44772 3.44772 7 4 7H12C12.5523 7 13 7.44772 13 8C13 8.55229 12.5523 9 12 9H4C3.44772 9 3 8.55229 3 8ZM4 11C3.44772 11 3 11.4477 3 12C3 12.5523 3.44772 13 4 13H10C10.5523 13 11 12.5523 11 12C11 11.4477 10.5523 11 10 11H4Z"
//       />
//     </svg>
//   );
// }
