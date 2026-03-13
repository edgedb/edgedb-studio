import {observer} from "mobx-react-lite";
import {VariableSizeList as List, ListChildComponentProps} from "react-window";
import {_ICodec} from "@dbsof/platform/client";

import cn from "@dbsof/common/utils/classNames";
import {
  renderResultAsJson,
  _renderToJson,
} from "@dbsof/common/utils/renderJsonResult";
import {CopyIcon} from "@dbsof/common/newui/icons";

import {InspectorState, Item} from "./state";
import {InspectorContext, useInspectorState} from "./context";

import styles from "./inspector.module.scss";
import {ItemType} from "./buildItem";
import {
  forwardRef,
  HTMLAttributes,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type InspectorProps = RowListProps & {
  state: InspectorState;
};

export const DEFAULT_ROW_HEIGHT = 28;
export const DEFAULT_LINE_HEIGHT = 26;

export default function Inspector({state, ...rowProps}: InspectorProps) {
  return (
    <InspectorContext.Provider value={state}>
      <RowList key={state.$modelId} {...rowProps} />
    </InspectorContext.Provider>
  );
}

export function useInspectorKeybindings(state: InspectorState) {
  return useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (e.ctrlKey) {
            state.selectSiblingIndex(state.selectedIndex, 1);
          } else {
            state.setSelectedIndex((state.selectedIndex ?? -1) + 1);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (e.ctrlKey) {
            state.selectSiblingIndex(state.selectedIndex, -1);
          } else {
            state.setSelectedIndex(
              (state.selectedIndex ?? state._items.length) - 1
            );
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (state.selectedIndex != null) {
            state.collapseItem(state.selectedIndex);
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (state.selectedIndex != null) {
            state.expandItem(state.selectedIndex);
          }
          break;
        case " ": {
          // spacebar
          e.preventDefault();
          const item = state.selectedIndex
            ? state._items[state.selectedIndex]
            : null;
          state.openExtendedView(item);
          break;
        }
      }
    },
    [state]
  );
}

type RowListProps = {
  className?: string;
  rowHeight?: number;
  lineHeight?: number;
  bottomPadding?: number;
} & (
  | {
      disableVirtualisedRendering: true;
      maxLines?: number;
      height?: undefined;
    }
  | {
      disableVirtualisedRendering?: false;
      height: number;
      maxLines?: undefined;
    }
);

const createOuterElementType = (attrs: HTMLAttributes<HTMLDivElement>) =>
  forwardRef((props, ref) => <div ref={ref as any} {...attrs} {...props} />);

const createInnerElementType = ({extraPadding = 0}: {extraPadding?: number}) =>
  forwardRef((props, ref) => (
    <div
      ref={ref as any}
      className={styles.innerWrapper}
      {...props}
      style={{
        ...(props as any).style,
        width: undefined,
        height: (props as any).style.height + 16 + extraPadding,
      }}
    />
  ));

const RowList = observer(function RowList({
  className,
  rowHeight = DEFAULT_ROW_HEIGHT,
  lineHeight = DEFAULT_LINE_HEIGHT,
  height,
  maxLines,
  disableVirtualisedRendering,
  bottomPadding,
}: RowListProps) {
  const state = useInspectorState();

  const vPad = rowHeight - lineHeight;

  const items = state.getItems();

  const onKeyDown = useInspectorKeybindings(state);

  const inspectorStyle = {
    "--lineHeight": `${lineHeight}px`,
    "--rowPad": `${vPad / 2}px`,
  } as any;

  if (disableVirtualisedRendering) {
    let rows: Item[];
    if (maxLines) {
      let lineCount = 0;
      let i = 0;
      while (i < items.length) {
        lineCount += items[i++].height ?? 1;
        if (lineCount > maxLines) break;
      }
      rows = items.slice(0, i);
    } else {
      rows = items;
    }

    return (
      <div
        className={cn(styles.inspector, className, {
          [styles.jsonMode]: state._jsonModeData != null,
        })}
        style={inspectorStyle}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {rows.map((_, i) => (
          <Row index={i} style={{}} data={items} key={i} noVirtualised />
        ))}
      </div>
    );
  } else {
    const itemSize = (index: number) =>
      (items[index].height ?? 1) * lineHeight + vPad;

    const ref = useRef<List>(null);

    useEffect(() => {
      if (state.selectedIndex != null) {
        ref.current?.scrollToItem(state.selectedIndex);
      }
    }, [state.selectedIndex]);

    const outerElementType = useMemo(
      () => createOuterElementType({onKeyDown, tabIndex: 0}),
      [onKeyDown]
    );
    const innerElementType = useMemo(
      () => createInnerElementType({extraPadding: bottomPadding}),
      [bottomPadding]
    );

    return (
      // @ts-ignore
      <List<Item[]>
        ref={ref}
        className={cn(styles.inspector, className, {
          [styles.jsonMode]: state._jsonModeData != null,
        })}
        style={inspectorStyle}
        height={height}
        width={"100%"}
        outerElementType={outerElementType}
        innerElementType={innerElementType}
        initialScrollOffset={state.scrollPos}
        onScroll={({scrollOffset}) => state.setScrollPos(scrollOffset)}
        itemData={items}
        itemCount={items.length}
        estimatedItemSize={rowHeight}
        itemSize={itemSize}
      >
        {Row}
      </List>
    );
  }
});

const Row = observer(function Row({
  index,
  style,
  data,
  noVirtualised,
}: ListChildComponentProps<Item[]> & {noVirtualised?: boolean}) {
  const state = useInspectorState();

  const item = data[index];

  const isExpanded = state.expanded!.has(item.id);

  return (
    <div
      className={styles.rowWrapper}
      style={{
        top: style.top,
        height: noVirtualised ? undefined : 0,
      }}
    >
      <InspectorRow
        key={item.id}
        index={index}
        item={item}
        state={state}
        isExpanded={isExpanded}
        toggleExpanded={() => {
          isExpanded ? state.collapseItem(index) : state.expandItem(index);
        }}
      />
    </div>
  );
});

function CopyButton({
  item,
  implicitLimit,
  rawCopy,
  ...props
}: {
  item: Item;
  implicitLimit: number | null;
  rawCopy?: string | null;
} & HTMLAttributes<HTMLDivElement>) {
  if (item.type === ItemType.Other) {
    return null;
  }

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
    <div
      className={cn(styles.copyButton)}
      {...props}
      onClick={() => {
        const jsonString =
          rawCopy ??
          (item.parent == null
            ? renderResultAsJson((item as any).data, item.codec, implicitLimit)
            : _renderToJson(
                item.type === ItemType.Scalar
                  ? (item.parent as any).data[item.index]
                  : item.data,
                item.codec,
                "",
                implicitLimit
              ));

        navigator.clipboard?.writeText(jsonString);
        setCopied(true);
      }}
    >
      <CopyIcon /> {copied ? "Copied" : "Copy JSON"}
    </div>
  );
}

interface InspectorRowProps {
  index?: number;
  item: Item;
  state: InspectorState;
  className?: string;
  isExpanded: boolean;
  toggleExpanded: () => void;
  disableCopy?: boolean;
  style?: React.CSSProperties;
  overflowEllipsis?: boolean;
}

export const InspectorRow = observer(function InspectorRow({
  index,
  item,
  state,
  className,
  isExpanded,
  toggleExpanded,
  disableCopy = false,
  overflowEllipsis = false,
  style,
}: InspectorRowProps) {
  const expandableItem =
    item.type !== ItemType.Scalar && item.type !== ItemType.Other;

  return (
    <div
      className={cn(styles.rowItem, className, {
        [styles.selected]: state.selectedIndex === index,
        [styles.hoverable]: !disableCopy
          ? item.type !== ItemType.Other
          : false,
        [styles.highlightBody]: state.hoverId === item.id,
        [styles.highlightAll]:
          state.hoverId !== item.id && item.id.startsWith(state.hoverId!),
        [styles.overflowEllipsis]: overflowEllipsis,
      })}
      style={{
        ...style,
        paddingLeft: `${(item.level + 1) * 2 + 1}ch`,
      }}
      onClick={index != null ? () => state.setSelectedIndex(index) : undefined}
    >
      {expandableItem ? (
        <div
          className={cn(styles.expandArrow, {
            [styles.expanded]: isExpanded,
          })}
          onClick={toggleExpanded}
        >
          <ExpandArrowIcon />
        </div>
      ) : null}
      <div className={styles.itemContent}>
        {item.label}
        <div className={styles.itemBody}>
          {item.body}
          {expandableItem && !isExpanded ? (
            <>
              <div className={styles.ellipsis} onClick={toggleExpanded}>
                <EllipsisIcon />
              </div>
              {(item as any).closingBracket.body}
            </>
          ) : null}
        </div>
        {item.comma ||
        (expandableItem &&
          !isExpanded &&
          (item as any).closingBracket.comma) ? (
          <span className={styles.comma}>,</span>
        ) : null}
      </div>

      {!disableCopy ? (
        <div
          className={cn(styles.actions, {
            [styles.multiline]: (item.height ?? 0) > 1,
          })}
        >
          {state.hasExtendedView(item) ? (
            <div
              className={cn(styles.viewButton)}
              onClick={() => state.openExtendedView(item)}
            >
              <OpenExpandedViewIcon /> View
            </div>
          ) : null}
          <CopyButton
            item={item}
            onMouseEnter={() => {
              state.setHoverId(item.id);
            }}
            onMouseLeave={() => {
              state.setHoverId(null);
            }}
            implicitLimit={state.implicitLimit}
            rawCopy={state._jsonModeData}
          />
        </div>
      ) : null}
    </div>
  );
});

export function ExpandArrowIcon() {
  return (
    <svg
      width="14"
      height="7"
      viewBox="0 0 14 7"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M13 1L7 6L1 1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EllipsisIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
    >
      <circle cx="8" cy="12" r="1"></circle>
      <circle cx="12" cy="12" r="1"></circle>
      <circle cx="16" cy="12" r="1"></circle>
    </svg>
  );
}

function OpenExpandedViewIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
