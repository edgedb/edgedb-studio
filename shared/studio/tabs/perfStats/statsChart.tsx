import {useMemo, useRef, useState} from "react";
import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";
import {useResize} from "@dbsof/common/hooks/useResize";

import {PerfStatsState} from "./state";

import styles from "./perfStats.module.scss";
import {formatDurationLabel, gradient} from "./utils";
import {useGlobalDragCursor} from "@dbsof/common/hooks/globalDragCursor";

export const StatsChart = observer(function StatsChart({
  state,
}: {
  state: PerfStatsState;
}) {
  const chart = state.histogram;

  const [hoveredBucketIndex, setHoveredBucketIndex] = useState<number>(-1);
  const hoveredBucket = chart?.data[hoveredBucketIndex] ?? null;
  const [_, setCursor] = useGlobalDragCursor();
  const [dragHandlesHidden, setDragHandlesHidden] = useState(false);

  const [height, setHeight] = useState(150);
  const chartRef = useRef<SVGSVGElement>(null);
  useResize(chartRef, ({height}) => setHeight(height));

  const yAxisLabels = useMemo(() => {
    if (!chart) return [];
    const maxLog = Math.log10(chart.yAxisMax);
    const labels: {bottom: number; value: number}[] = [];
    if (maxLog > 0) {
      for (let i = 0; i < maxLog; i++) {
        labels.push({bottom: (i / maxLog) * 95 + 5, value: 10 ** i});
      }
    } else {
      labels.push({bottom: 100, value: 1});
    }
    return labels;
  }, [chart?.yAxisMax, height]);

  const selectedBuckets = useMemo(() => {
    const filter = state.timeFilter;
    if (!filter || !chart) return null;
    const buckets = chart.data.filter(
      (bucket) => bucket.start >= filter[0] && bucket.start < filter[1]
    );
    return buckets.length ? buckets : null;
  }, [state.timeFilter, chart]);

  const dragHandleMousedown = (start: boolean) => (e: React.MouseEvent) => {
    if (!chart || !state.timeFilter) return;

    const dragStart = state.timeFilter[start ? 1 : 0];
    setCursor("ew-resize");

    const moveListener = (e: MouseEvent) => {
      const bbox = chartRef.current!.getBoundingClientRect();
      const bucketIndex = Math.max(
        0,
        Math.min(
          chart.data.length,
          Math.round(
            ((e.clientX - bbox.left) / bbox.width) * chart!.data.length
          )
        )
      );
      const time =
        chart.data[bucketIndex]?.start ??
        chart.data[chart.data.length - 1].end;
      if (time !== dragStart) {
        state.setTimeFilter(
          time > dragStart ? [dragStart, time] : [time, dragStart]
        );
      }
    };
    moveListener(e.nativeEvent);
    window.addEventListener("mousemove", moveListener);
    window.addEventListener(
      "mouseup",
      () => {
        window.removeEventListener("mousemove", moveListener);
        setCursor(null);
      },
      {once: true}
    );
  };

  return (
    <div
      className={cn(styles.statsChart, {
        [styles.chartHovered]: hoveredBucket != null,
      })}
    >
      {chart ? (
        <div className={styles.chartLayout}>
          <div className={styles.yAxisName}>Call count</div>
          <div
            className={styles.yaxis}
            style={{margin: `${height / 102}px 0`}}
          >
            {yAxisLabels.map(({bottom, value}) => (
              <div
                key={value}
                className={styles.axisLabel}
                style={{bottom: `${bottom}%`}}
              >
                <div>{formatCount(value)}</div>
              </div>
            ))}

            {hoveredBucket ? (
              <div
                className={styles.hoverAxisLabel}
                style={{
                  bottom: `${
                    hoveredBucket.count
                      ? chart.yAxisMax > 1
                        ? (Math.log10(hoveredBucket.count) /
                            Math.log10(chart.yAxisMax)) *
                            95 +
                          5
                        : 100
                      : 0
                  }%`,
                }}
              >
                <div>{formatCount(hoveredBucket.count)}</div>
              </div>
            ) : null}
          </div>
          <svg
            ref={chartRef}
            viewBox="0 -1 100 102"
            preserveAspectRatio="none"
            onMouseMove={(e) => {
              const bbox = chartRef.current!.getBoundingClientRect();
              const bucketIndex = Math.floor(
                ((e.clientX - bbox.left) / bbox.width) * chart.data.length
              );
              setHoveredBucketIndex(bucketIndex);
            }}
            onMouseLeave={() => setHoveredBucketIndex(-1)}
            onMouseDown={(e) => {
              if (hoveredBucket) {
                const dragStart =
                  e.shiftKey && state.timeFilter
                    ? Math.abs(state.timeFilter[0] - hoveredBucket.start) >
                      Math.abs(state.timeFilter[1] - hoveredBucket.start)
                      ? state.timeFilter[0]
                      : state.timeFilter[1]
                    : null;
                setCursor("ew-resize");
                setDragHandlesHidden(true);

                const moveListener = (e: MouseEvent) => {
                  const bbox = chartRef.current!.getBoundingClientRect();
                  const bucketIndex = Math.max(
                    0,
                    Math.min(
                      chart.data.length - 1,
                      Math.floor(
                        ((e.clientX - bbox.left) / bbox.width) *
                          chart.data.length
                      )
                    )
                  );
                  const bucket = chart.data[bucketIndex];
                  if (dragStart !== null) {
                    state.setTimeFilter(
                      bucket.start >= dragStart
                        ? [dragStart, bucket.end]
                        : [bucket.start, dragStart]
                    );
                  } else {
                    state.setTimeFilter([
                      Math.min(hoveredBucket.start, bucket.start),
                      Math.max(hoveredBucket.end, bucket.end),
                    ]);
                  }
                };
                moveListener(e.nativeEvent);
                window.addEventListener("mousemove", moveListener);
                window.addEventListener(
                  "mouseup",
                  () => {
                    window.removeEventListener("mousemove", moveListener);
                    setCursor(null);
                    setDragHandlesHidden(false);
                  },
                  {once: true}
                );
              }
            }}
          >
            {hoveredBucket ? (
              <>
                <rect
                  className={styles.hoverRect}
                  width={hoveredBucket.rect.width}
                  height={100}
                  x={hoveredBucket.rect.x}
                  y={0}
                />
                <line
                  className={styles.hoverYLine}
                  x1={0}
                  x2={100}
                  y1={hoveredBucket.rect.y}
                  y2={hoveredBucket.rect.y}
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : null}
            {chart.data.map(({start, rect, colorIndex}, i) =>
              rect.height ? (
                <rect
                  key={i}
                  vectorEffect="non-scaling-stroke"
                  {...rect}
                  fill={gradient[colorIndex]}
                  style={{
                    opacity:
                      state.timeFilter &&
                      (start < state.timeFilter[0] ||
                        start >= state.timeFilter[1])
                        ? 0.3
                        : undefined,
                  }}
                />
              ) : null
            )}
          </svg>
          {selectedBuckets ? (
            <>
              <div className={styles.selectedBackground}>
                <div
                  style={{
                    left: `${selectedBuckets[0].rect.x}%`,
                    width: `${
                      selectedBuckets[selectedBuckets.length - 1].rect.x -
                      selectedBuckets[0].rect.x +
                      selectedBuckets[0].rect.width
                    }%`,
                  }}
                />
              </div>
              <div className={styles.selectedOutline}>
                <div
                  className={styles.outline}
                  style={{
                    left: `${selectedBuckets[0].rect.x}%`,
                    width: `${
                      selectedBuckets[selectedBuckets.length - 1].rect.x -
                      selectedBuckets[0].rect.x +
                      selectedBuckets[0].rect.width
                    }%`,
                  }}
                />
                {dragHandlesHidden ? null : (
                  <>
                    <div
                      className={styles.handle}
                      style={{
                        left: `${selectedBuckets[0].rect.x}%`,
                      }}
                      onMouseDown={dragHandleMousedown(true)}
                    />
                    <div
                      className={styles.handle}
                      style={{
                        left: `${
                          selectedBuckets[selectedBuckets.length - 1].rect.x +
                          selectedBuckets[0].rect.width
                        }%`,
                      }}
                      onMouseDown={dragHandleMousedown(false)}
                    />
                  </>
                )}
              </div>
            </>
          ) : null}
          <div className={styles.xaxis}>
            {chart.xAxisLabels.map(({left, value}) => (
              <div
                key={value}
                className={styles.axisLabel}
                style={{left: `${left}%`}}
              >
                <div>{formatDurationLabel({start: value})}</div>
              </div>
            ))}
            {hoveredBucket ? (
              <div
                className={styles.hoverAxisLabel}
                style={{
                  left: `${
                    (50 / chart.data.length) * (hoveredBucketIndex * 2 + 1)
                  }%`,
                }}
              >
                <div>{formatDurationLabel(hoveredBucket)}</div>
              </div>
            ) : null}
          </div>
          <div className={styles.xAxisName}>Mean exec time</div>
        </div>
      ) : null}
    </div>
  );
});

const units = ["", "k", "M", "B", "T"];
function formatCount(value: number) {
  const valueLog = Math.log10(value);
  const mag = Math.floor(valueLog / 3);
  const val = mag < 1 ? value : value / 10 ** (mag * 3);
  return (
    <>
      {Number.isInteger(val) ? val : val.toPrecision(3)}
      <span>{units[mag]}</span>
    </>
  );
}
