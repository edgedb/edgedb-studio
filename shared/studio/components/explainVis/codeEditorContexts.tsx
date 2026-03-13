import {CodeEditorRef} from "@dbsof/code-editor";
import {observer} from "mobx-react-lite";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {createPortal} from "react-dom";

import cn from "@dbsof/common/utils/classNames";

import styles from "./explainVis.module.scss";
import {Context, ExplainState, Plan} from "./state";
import {darkPalette, lightPalette} from "./treemapLayout";
import {Theme, useTheme} from "@dbsof/common/hooks/useTheme";

interface CtxRect {
  id: number;
  top: number;
  left: number;
  width: number;
  height: number;
  depth: number;
}

export type ExplainHighlightsRef = {
  updateContextRects: (containerEl: HTMLElement) => void;
};

export const ExplainHighlightsRenderer = observer(
  forwardRef(function ExplainHighlightsRenderer(
    {state, isEditor = true}: {state: ExplainState; isEditor?: boolean},
    ref
  ) {
    const [ctxRects, setCtxRects] = useState<CtxRect[]>([]);

    const updateContextRects = useCallback((containerEl: HTMLElement) => {
      const scrollRect = containerEl.getBoundingClientRect();

      const offsetTop = scrollRect.top - containerEl.scrollTop;
      const offsetLeft = scrollRect.left - containerEl.scrollLeft;

      const ctxs = state.contextsByBufIdx[0] ?? [];
      const rects = [];
      let parentCtxs: Context[] = [];

      for (const ctx of ctxs) {
        const els = [
          ...containerEl.querySelectorAll(`[data-ctx-id*="${ctx.id}"]`),
        ];

        if (!els.length) {
          continue;
        }

        let top = Infinity,
          left = Infinity,
          right = -Infinity,
          bottom = -Infinity;

        for (const el of els) {
          const elRect = el.getBoundingClientRect();
          if (elRect.left < left) left = elRect.left;
          if (elRect.top < top) top = elRect.top;
          if (elRect.right > right) right = elRect.right;
          if (elRect.bottom > bottom) bottom = elRect.bottom;
        }

        while (parentCtxs.length) {
          const lastCtx = parentCtxs[parentCtxs.length - 1];
          if (ctx.end <= lastCtx.end) {
            break;
          } else {
            parentCtxs.pop();
          }
        }
        let depth = parentCtxs.length;
        parentCtxs.push(ctx);

        rects.push({
          id: ctx.id,
          top: top - offsetTop,
          left: left - offsetLeft,
          width: right - left,
          height: bottom - top,
          depth: depth,
        });
      }

      setCtxRects(rects);
    }, []);

    useImperativeHandle<unknown, ExplainHighlightsRef>(
      ref,
      () => ({updateContextRects}),
      [updateContextRects]
    );

    const [_, theme] = useTheme();
    const palette = theme === Theme.light ? lightPalette : darkPalette;

    const getBgColor = (ctxRect: CtxRect) => {
      if (state.hoveredPlan) {
        const planDepth = getPlanDepth(state.hoveredPlan);
        const ctx = state.hoveredCtxId === ctxRect.id;
        if (ctx && planDepth) return palette[planDepth % palette.length];
      }

      if (isEditor && state.selectedPlan) {
        const planDepth = getPlanDepth(state.selectedPlan);
        const ctx = state.ctxId === ctxRect.id;

        if (ctx && planDepth) return palette[planDepth % palette.length];
      }

      if (isEditor && state.selectedPlan?.parent) {
        const parentPlanDepth = getPlanDepth(state.selectedPlan.parent);
        const ctxParent = state.parentCtxId === ctxRect.id;

        if (ctxParent && parentPlanDepth)
          return palette[parentPlanDepth % palette.length];
      }

      return undefined;
    };

    return (
      <>
        {ctxRects.map((ctxRect) => (
          <div
            key={ctxRect.id}
            className={cn(styles.explainContextRect, {
              [styles.highlighted]: isEditor && state.ctxId === ctxRect.id,
              [styles.highlightedOnHover]:
                !!(
                  state?.hoveredPlan && getPlanDepth(state.hoveredPlan) > 0
                ) &&
                state.ctxId !== ctxRect.id &&
                state.hoveredCtxId === ctxRect.id,
            })}
            style={{
              top: ctxRect.top,
              left: ctxRect.left,
              width: ctxRect.width,
              height: ctxRect.height,
              backgroundColor: getBgColor(ctxRect),
            }}
          />
        ))}
      </>
    );
  })
);

export const CodeEditorExplainContexts = observer(function ExplainContexts({
  editorRef,
  state,
}: {
  editorRef: CodeEditorRef;
  state: ExplainState;
}) {
  const [containerEl] = useState(() => document.createElement("div"));

  const ref = useRef<ExplainHighlightsRef>();

  useEffect(() => {
    const scrollerEl = editorRef.view().scrollDOM;

    containerEl.classList.add(styles.explainContextsContainer);
    scrollerEl.appendChild(containerEl);

    ref.current?.updateContextRects(scrollerEl);

    let lastViewport = {from: 0, to: 0};

    const scrollListener = () => {
      const viewport = editorRef.view().viewport;
      if (
        viewport.from !== lastViewport.from ||
        viewport.to !== lastViewport.to
      ) {
        lastViewport = {...viewport};
        ref.current?.updateContextRects(scrollerEl);
      }
    };
    scrollerEl.addEventListener("scroll", scrollListener);

    return () => {
      scrollerEl.removeChild(containerEl);
      scrollerEl.removeEventListener("scroll", scrollListener);
    };
  }, [state]);

  return createPortal(
    <ExplainHighlightsRenderer ref={ref as any} state={state} />,
    containerEl
  );
});

function getPlanDepth(plan: Plan) {
  let depth = 0;
  let parent = plan.parent;
  while (parent) {
    depth++;
    parent = parent.parent;
  }

  return depth;
}
