import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";

import {QueryParamsEditor, ResolvedParameter} from "../state/parameters";

import {getInputComponent} from "../../../components/dataEditor";

import styles from "./paramEditor.module.scss";
import {Position, useDragHandler} from "@dbsof/common/hooks/useDragHandler";
import {useGlobalDragCursor} from "@dbsof/common/hooks/globalDragCursor";
import {RefObject, useRef} from "react";
import {CustomScrollbars} from "@dbsof/common/ui/customScrollbar";

const isMac =
  typeof navigator !== "undefined"
    ? navigator.platform.toLowerCase().includes("mac")
    : false;

export const ParamsEditorPanel = observer(function ParamEditorPanel({
  state,
  runQuery,
  horizontalSplit,
  disabled,
}: {
  state: QueryParamsEditor;
  runQuery?: () => void;
  horizontalSplit?: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  if (state.paramDefs.size === 0) {
    return null;
  }

  return (
    <div
      ref={ref}
      className={cn(styles.paramEditorPanel, {
        [styles.horizontal]: !!horizontalSplit,
      })}
      style={{[horizontalSplit ? "width" : "height"]: state.panelHeight}}
    >
      <DragHandle
        state={state}
        parentRef={ref}
        horizontalSplit={!!horizontalSplit}
      />
      <CustomScrollbars
        innerClass={contentRef.current}
        className={styles.scrollWrapper}
      >
        <div className={styles.panelInner}>
          <div className={styles.header}>Query Parameters</div>

          <div
            ref={contentRef}
            onKeyDown={(e) => {
              if ((isMac ? e.metaKey : e.ctrlKey) && e.key === "Enter") {
                runQuery?.();
              }
            }}
          >
            {state.mixedParamsError ? (
              <div className={cn(styles.paramError, styles.topLevelError)}>
                Cannot have both positional and named parameters in query
              </div>
            ) : (
              <div className={styles.paramsList}>
                {[...state.paramDefs.values()].map((param, i, arr) => (
                  <ParamEditor
                    editorState={state}
                    param={param}
                    lastParam={i === arr.length - 1}
                    key={
                      param.name +
                      "--" +
                      (param.error === null ? param.type.name : "error")
                    }
                    disabled={disabled}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </CustomScrollbars>
    </div>
  );
});

const DragHandle = observer(function DragHandle({
  state,
  parentRef,
  horizontalSplit,
}: {
  state: QueryParamsEditor;
  parentRef: RefObject<HTMLDivElement>;
  horizontalSplit: boolean;
}) {
  const [_, setGlobalDragCursor] = useGlobalDragCursor();

  const resizeHandler = useDragHandler(() => {
    let initialSize: number;
    let initialPos: Position;

    return {
      onStart(initialMousePos: Position, _: React.MouseEvent) {
        setGlobalDragCursor(horizontalSplit ? "ew-resize" : "ns-resize");
        initialPos = initialMousePos;
        initialSize =
          parentRef.current!.getBoundingClientRect()[
            horizontalSplit ? "width" : "height"
          ];
      },
      onMove(currentMousePos: Position, _: boolean) {
        state.setPanelHeight(
          initialSize +
            (horizontalSplit
              ? initialPos.x - currentMousePos.x
              : initialPos.y - currentMousePos.y)
        );
      },
      onEnd() {
        setGlobalDragCursor(null);
      },
    };
  }, [state, parentRef.current, horizontalSplit]);

  return <div className={styles.dragHandle} onMouseDown={resizeHandler} />;
});

interface ParamEditorProps {
  editorState: QueryParamsEditor;
  param: ResolvedParameter;
  lastParam: boolean;
  disabled?: boolean;
}

const ParamEditor = observer(function ParamEditor({
  editorState,
  param,
  lastParam,
  disabled,
}: ParamEditorProps) {
  const paramData = editorState.currentParams[param.name];

  const Input = param.error === null ? getInputComponent(param.type) : null!;

  return (
    <div
      className={cn(styles.paramEditorItem, {
        [styles.inputDisabled]: !!disabled,
        [styles.paramDisabled]:
          param.error == null && param.optional && paramData.disabled,
      })}
    >
      <div className={styles.paramOptional}>
        {param.error == null && param.optional ? (
          <input
            type="checkbox"
            checked={!paramData.disabled}
            onChange={(e) =>
              editorState.setDisabled(param.name, !e.target.checked)
            }
            disabled={disabled}
          />
        ) : null}
      </div>
      <div className={styles.paramDetails}>
        <div className={styles.paramIdents}>
          {param.error == null ? (
            <div className={styles.paramType}>{param.type.name}</div>
          ) : null}
          <div className={styles.paramName}>${param.name}</div>
        </div>
        {param.error == null && param.optional ? (
          <div className={styles.paramOptionalLabel}>optional</div>
        ) : null}
      </div>
      {param.error !== null ? (
        <div className={styles.paramError}>{param.error}</div>
      ) : (
        <div className={styles.paramData}>
          <Input
            type={param.type}
            errorMessageAbove={lastParam}
            value={paramData.data.value.data}
            depth={2}
            onChange={(val, err) => {
              editorState.setParamValue(param.name, val, err);
            }}
          />
        </div>
      )}
    </div>
  );
});
