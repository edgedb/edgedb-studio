import {observer} from "mobx-react-lite";
import {
  forwardRef,
  RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {VariableSizeList as List} from "react-window";

import Button from "@dbsof/common/ui/button";
import cn from "@dbsof/common/utils/classNames";

import {useTabState} from "../../state";
import {QueryEditor, QueryHistoryItem} from "./state";
import {renderThumbnail} from "./state/thumbnailGen";
import {RelativeTime} from "@dbsof/common/utils/relativeTime";

import styles from "./queryeditor.module.scss";
import {useResize} from "@dbsof/common/hooks/useResize";
import Spinner from "@dbsof/common/ui/spinner";
import {useIsMobile} from "@dbsof/common/hooks/useMobile";
import {CloseButton} from "@dbsof/common/ui/mobile";

export const HistoryPanel = observer(function HistoryPanel({
  className,
}: {
  className?: string;
}) {
  const editorState = useTabState(QueryEditor);

  const ref = useRef<HTMLDivElement>(null);
  const [showHistory, setShowHistory] = useState(editorState.showHistory);
  const [visible, setVisible] = useState(showHistory);

  const isMobile = useIsMobile();

  useLayoutEffect(() => {
    if (editorState.showHistory === showHistory) {
      return;
    }
    if (editorState.showHistory) {
      setShowHistory(true);
      requestAnimationFrame(() => {
        // forces reflow
        ref.current!.scrollTop;
        setVisible(true);
      });
    } else {
      setVisible(false);
      if (isMobile) setShowHistory(false);
      else
        ref.current!.addEventListener(
          "transitionend",
          () => setShowHistory(false),
          {once: true}
        );
    }
  }, [editorState.showHistory]);

  return showHistory ? (
    <HistoryPanelInner
      ref={ref}
      state={editorState}
      visible={visible}
      className={className}
    />
  ) : null;
});

const HistoryPanelInner = observer(
  forwardRef<
    HTMLDivElement,
    {
      state: QueryEditor;
      visible: boolean;
      className?: string;
    }
  >(function HistoryPanelInner({state, visible, className}, ref) {
    useEffect(() => {
      (ref as RefObject<HTMLDivElement>).current?.focus();
    }, []);

    return (
      <div
        ref={ref}
        className={cn(styles.history, className, {
          [styles.visible]: visible,
        })}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            state.navigateQueryHistory(-1);
          } else if (e.key === "ArrowDown") {
            state.navigateQueryHistory(1);
          } else if (e.key === "Enter") {
            state.loadHistoryItem();
          }
        }}
      >
        <CloseButton
          onClick={() => state.setShowHistory(false)}
          className={styles.closeHistoryMobile}
        />
        <HistoryList state={state} />
        <div className={styles.closeHistory}>
          <Button
            label={"Cancel"}
            onClick={() => state.setShowHistory(false)}
          />
        </div>
      </div>
    );
  })
);

const HistoryList = observer(function HistoryList({
  state,
}: {
  state: QueryEditor;
}) {
  const historyList = state.queryHistory;

  const listRef = useRef<List>(null);

  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useResize(ref, ({height}) => setHeight(height));

  const isMobile = useIsMobile();

  useEffect(() => {
    const list = listRef.current;
    if (list) {
      const index = state.historyCursor + 1;
      const itemTop = (list as any)._getItemStyle(index).top;
      const itemRelTop = itemTop - (list.state as any).scrollOffset;
      if (itemRelTop < 0) {
        list.scrollTo(itemTop);
      } else if (itemRelTop > height - 171) {
        list.scrollTo(itemTop - (height - 171));
      }
    }
  }, [state.historyCursor, height]);

  const estimatedItemSize = isMobile ? 184 : 121;

  useEffect(() => {
    listRef.current?.resetAfterIndex(0);
  }, [historyList.length, isMobile]);

  return (
    <div ref={ref} className={styles.historyListWrapper}>
      <List
        ref={listRef}
        className={styles.historyList}
        itemCount={historyList.length + 1}
        height={height}
        width="100%"
        estimatedItemSize={estimatedItemSize}
        itemSize={(index) =>
          (isMobile && index == 0 ? 24 : 0) +
          (historyList[index - 1]?.showDateHeader
            ? estimatedItemSize + 16
            : estimatedItemSize)
        }
      >
        {({index, style}) => (
          <HistoryItem
            state={state}
            index={index - 1}
            item={historyList[index - 1] ?? null}
            styleTop={style.top}
          />
        )}
      </List>
    </div>
  );
});

const HistoryItem = observer(function HistoryItem({
  state,
  index,
  item,
  styleTop,
}: {
  state: QueryEditor;
  index: number;
  item: QueryHistoryItem | null;
  styleTop: any;
}) {
  if (item == null && index !== -1) {
    state.fetchQueryHistory();
    return (
      <div style={{top: styleTop}} className={styles.historyLoading}>
        <Spinner size={30} strokeWidth={3} period={1} />
      </div>
    );
  }

  return (
    <div
      style={{top: styleTop}}
      className={cn(styles.historyItem, {
        [styles.selected]: state.historyCursor === index,
        [styles.draft]: !item,
        [styles.hasDateHeader]: !!item?.showDateHeader,
      })}
      onClick={() => state.previewHistoryItem(index)}
    >
      {item ? (
        <>
          {item.showDateHeader ? (
            <div className={styles.dateHeader}>
              {new Date(item.timestamp).toLocaleDateString()}
            </div>
          ) : null}
          {renderThumbnail(item.thumbnailData.data)}
          <div
            className={styles.timeLabel}
            title={new Date(item.timestamp).toLocaleString()}
          >
            <RelativeTime timestamp={item.timestamp} />
          </div>
          {
            <Button
              className={cn(styles.loadButton, {
                [styles.visible]: state.historyCursor === index,
              })}
              label={"Load"}
              onClick={(e) => {
                e.stopPropagation();
                state.loadHistoryItem(index);
              }}
            />
          }
        </>
      ) : (
        "draft query"
      )}
    </div>
  );
});
