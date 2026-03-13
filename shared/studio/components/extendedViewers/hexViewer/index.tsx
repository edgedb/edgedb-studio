import {CSSProperties, useRef, useState} from "react";
import {FixedSizeList as List} from "react-window";

import styles from "./hexViewer.module.scss";

import cn from "@dbsof/common/utils/classNames";
import {useResize} from "@dbsof/common/hooks/useResize";
import {createHexViewerState, HexViewer as HexViewerState} from "./state";
import {observer} from "mobx-react-lite";
import {computed} from "mobx";
import {ToggleButton, HeaderBar} from "../shared";
import {CustomScrollbars} from "@dbsof/common/ui/customScrollbar";
import {Button} from "@dbsof/common/newui";

export interface HexViewerProps {
  data: Uint8Array;
}

export const HexViewer = observer(function HexViewer({data}: HexViewerProps) {
  const [state] = useState(() => createHexViewerState(data));

  const [wrapperHeight, setWrapperHeight] = useState<number>(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  useResize(wrapperRef, ({height}) => setWrapperHeight(height));

  const innerRef = useRef(null);

  return (
    <div className={styles.hexViewer}>
      <HexViewerStatus state={state} />
      <div
        tabIndex={0}
        ref={wrapperRef}
        className={styles.dataWrapper}
        onKeyDown={(e) => {
          switch (e.key) {
            case "ArrowLeft":
              state.setSelectedOffsetRelative(-1, e.shiftKey);
              break;
            case "ArrowRight":
              state.setSelectedOffsetRelative(1, e.shiftKey);
              break;
            case "ArrowUp":
              state.setSelectedOffsetRelative(
                state.asciiMode ? -80 : -16,
                e.shiftKey
              );
              break;
            case "ArrowDown":
              state.setSelectedOffsetRelative(
                state.asciiMode ? 80 : 16,
                e.shiftKey
              );
              break;
          }
        }}
      >
        <CustomScrollbars innerClass={innerRef.current}>
          <List
            itemCount={state.rowsCount}
            innerRef={innerRef}
            itemSize={21}
            width="100%"
            height={wrapperHeight}
            overscanCount={10}
          >
            {state.asciiMode
              ? ({index, style}) => (
                  <HexRow
                    state={state}
                    style={style}
                    rowOffset={index * 80}
                    rowSize={80}
                    asciiOnly
                  />
                )
              : ({index, style}) => (
                  <HexRow
                    state={state}
                    style={style}
                    rowOffset={index * 16}
                    rowSize={16}
                  />
                )}
          </List>
        </CustomScrollbars>
      </div>
    </div>
  );
});

export default HexViewer;

const HexViewerStatus = observer(function HexViewerStatus({
  state,
}: {
  state: HexViewerState;
}) {
  return (
    <HeaderBar>
      <ToggleButton
        icon={<></>}
        active={state.asciiMode}
        onClick={() => state.setAsciiMode(!state.asciiMode)}
      >
        {state.asciiMode ? "ASCII" : "Hex"} Mode
      </ToggleButton>
      <Button
        kind="outline"
        className={styles.downloadButton}
        onClick={() => state.downloadData()}
      >
        Download{state.endOffset !== null ? " range" : ""}
      </Button>
    </HeaderBar>
  );
});

interface HexRowProps {
  state: HexViewerState;
  style: CSSProperties;
  rowOffset: number;
  rowSize: number;
  asciiOnly?: boolean;
}

const HexRow = observer(function HexRow({
  state,
  style,
  rowOffset,
  rowSize,
  asciiOnly,
}: HexRowProps) {
  const hoverRowOffset = computed(() =>
    state.hoverOffset != null &&
    state.hoverOffset >= rowOffset &&
    state.hoverOffset < rowOffset + rowSize
      ? state.hoverOffset - rowOffset
      : null
  ).get();
  const cursorRowOffset = computed(() => {
    const cursor = (state.endOffset ?? state.startOffset) - rowOffset;
    return cursor >= 0 && cursor < rowSize ? cursor : null;
  }).get();
  const selectedRow = computed(() => {
    const range = state.selectedRange;
    if (range) {
      const start = range[0] - rowOffset;
      const end = range[1] - rowOffset;

      if (start < 0 && end >= rowSize) {
        return true;
      }
      if (end < 0 || start >= rowSize) {
        return null;
      }
      return {start, end};
    }
    return null;
  }).get();

  const hex: JSX.Element[] = new Array(rowSize);
  const ascii: JSX.Element[] = new Array(rowSize);

  const data = state.data!;
  for (let i = 0; i < rowSize; i++) {
    const n = data[rowOffset + i];
    if (n == null) break;

    const selectionClasses = {
      [styles.hovered]: hoverRowOffset === i,
      [styles.cursor]: cursorRowOffset === i,
      [styles.selected]:
        selectedRow !== null &&
        selectedRow !== true &&
        i >= selectedRow.start &&
        i <= selectedRow.end,
    };
    if (!asciiOnly) {
      hex[i] = (
        <div
          key={i}
          className={cn(styles.hexCell, selectionClasses)}
          onMouseEnter={() => state.setHoverOffset(rowOffset + i)}
          onClick={(e) => state.setSelectedOffset(rowOffset + i, e.shiftKey)}
        >
          {(n < 16 ? "0" : "") + n.toString(16)}
        </div>
      );
    }
    const printable = n >= 32 && n <= 126;
    ascii[i] = (
      <div
        key={i}
        className={cn(styles.asciiCell, {
          [styles.unprintableAscii]: !printable,
          ...selectionClasses,
        })}
        onMouseEnter={() => state.setHoverOffset(rowOffset + i)}
        onClick={(e) => state.setSelectedOffset(rowOffset + i, e.shiftKey)}
      >
        {printable ? String.fromCharCode(n) : "."}
      </div>
    );
  }

  return (
    <div
      className={cn(styles.hexRow, {
        [styles.rowSelected]: selectedRow === true,
      })}
      style={{...style, width: undefined}}
    >
      {!asciiOnly ? (
        <>
          <div className={styles.rowOffset}>
            {rowOffset.toString(16).padStart(state.offsetWidth, "0")}
          </div>
          <div
            className={styles.hexData}
            onMouseLeave={() => state.setHoverOffset(null)}
          >
            {hex}
          </div>
        </>
      ) : null}
      <div
        className={styles.asciiData}
        onMouseLeave={() => state.setHoverOffset(null)}
      >
        {ascii}
      </div>
    </div>
  );
});
