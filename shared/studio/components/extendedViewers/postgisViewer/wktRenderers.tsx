import {
  FunctionComponent,
  PropsWithChildren,
  useEffect,
  useRef,
  useState,
} from "react";
import {observer} from "mobx-react-lite";

import * as PostGIS from "@dbsof/platform/client";
import {
  Geometry,
  LineString,
  Point,
  Polygon,
  ListItem,
  ListItemWrapper,
  Box,
  ListItemPointWrapper,
} from "./editableGeom/types";
import {ListItemRowHeight, PostgisEditor} from "./state";

import cn from "@dbsof/common/utils/classNames";

import styles from "./postgisViewer.module.scss";
import {useResize} from "@dbsof/common/hooks/useResize";
import {
  ChevronDownIcon,
  CopyIcon,
  OverflowMenuIcon,
} from "@dbsof/common/newui";
import {runInAction} from "mobx";
import {convertFromEditableGeometry} from "./editableGeom/convert";

function PointInput({
  value,
  onChange,
  readonly,
}: {
  value: number;
  onChange: (val: number) => void;
  readonly: boolean;
}) {
  const [editingValue, setEditingValue] = useState<string | null>(null);

  return (
    <input
      className={styles.pointInput}
      value={editingValue ?? value.toString()}
      onChange={(e) => setEditingValue(e.target.value)}
      onBlur={() => {
        if (editingValue) {
          onChange(parseFloat(editingValue));
          setEditingValue(null);
        }
      }}
      size={14}
      readOnly={readonly}
    />
  );
}

const PointRenderer = observer(function _PointRenderer({
  state,
  geom,
}: {
  state: PostgisEditor;
  geom: Point | ListItemPointWrapper;
}) {
  const point = geom instanceof Point ? geom : geom.geom;
  const selectedParentDepth = getSelectedParentDepth(state, geom);
  const selfSelected = state.selectedGeoms.has(point);
  const inactive = isInactive(state, point);

  return (
    <div
      className={cn(styles.listPointItem, {
        [styles.selected]: selfSelected || selectedParentDepth !== null,
        [styles.selfSelected]:
          selfSelected &&
          (geom.parent instanceof LineString ||
            geom.parent?.kind === "MultiPoint"),
        [styles.inactive]: inactive,
      })}
      style={
        {"--selectedDepth": selectedParentDepth ?? point.listDepth} as any
      }
    >
      <div className={styles.leftFade} />
      <div className={styles.points}>
        <div className={styles.pointLabel}>x</div>
        <PointInput
          value={point.point[0]}
          onChange={(val) => state.updatePointCoord(point, 0, val)}
          readonly={state.readonly}
        />
        <div className={styles.pointLabel}>y</div>
        <PointInput
          value={point.point[1]}
          onChange={(val) => state.updatePointCoord(point, 1, val)}
          readonly={state.readonly}
        />
        {state.hasZ ? (
          <>
            <div className={styles.pointLabel}>z</div>
            <PointInput
              value={point.point.length > 2 ? point.point[2]! : 0}
              onChange={(val) => state.updatePointCoord(point, 2, val)}
              readonly={state.readonly}
            />
          </>
        ) : null}
        {state.hasM ? (
          <>
            <div className={styles.pointLabel}>m</div>
            <PointInput
              value={point.m ?? 0}
              onChange={(val) => state.updatePointMValue(point, val)}
              readonly={state.readonly}
            />
          </>
        ) : null}
      </div>
      <div className={styles.rightFade} />
    </div>
  );
}) as GeometryRenderer;

function getSelectedParentDepth(
  state: PostgisEditor,
  geom: {parent: Geometry | null}
): number | null {
  if (!state.selectedGeoms.size) return null;
  let parent = geom.parent;
  while (parent) {
    if (state.selectedGeoms.has(parent)) return parent.listDepth;
    parent = parent.parent;
  }
  return null;
}

function isInactive(state: PostgisEditor, geom: Geometry | Box): boolean {
  if (!state.editingGeom || geom instanceof Box) {
    return false;
  }
  let currentGeom: Geometry | null = geom;
  while (currentGeom) {
    if (state.editingGeom === currentGeom) {
      return false;
    }
    currentGeom = currentGeom.parent;
  }
  return true;
}

const StickyHeader = observer(function StickyHeader({
  state,
  geom,
  noExpand,
  isEmpty,
  children,
}: PropsWithChildren<{
  state: PostgisEditor;
  geom: Geometry | Box;
  noExpand?: boolean;
  isEmpty?: boolean;
}>) {
  const selectedParentDepth = getSelectedParentDepth(state, geom);
  const inactive = isInactive(state, geom);

  return (
    <div
      className={cn(styles.listHeaderItem, {
        [styles.selected]: state.selectedGeoms.has(geom),
        [styles.expanded]: !noExpand && !isEmpty && geom.listItemExpanded,
        [styles.parentSelected]: selectedParentDepth !== null,
        [styles.inactive]: inactive,
      })}
      style={{"--selectedParentDepth": selectedParentDepth} as any}
    >
      <div className={styles.inner}>
        {!noExpand && !isEmpty ? (
          <div
            className={cn(styles.expandToggle, {
              [styles.expanded]: geom.listItemExpanded,
            })}
            onClick={() =>
              runInAction(() => {
                geom.listItemExpanded = !geom.listItemExpanded;
              })
            }
          >
            <ChevronDownIcon />
          </div>
        ) : null}

        <div className={styles.name}>
          {children}{" "}
          {isEmpty ? (
            <>
              {"( "}
              <span>empty</span>
              {" )"}
            </>
          ) : geom.listItemExpanded ? (
            "("
          ) : (
            <>
              {"("}
              <span>...</span>
              {")"}
            </>
          )}
        </div>

        <OverflowMenu
          items={[
            {
              label: "Copy",
              icon: <CopyIcon />,
              action: () => {
                const converted = convertFromEditableGeometry(geom, state)!;
                const wkt =
                  converted instanceof PostGIS.Geometry
                    ? converted.toWKT(2)
                    : converted.toString();
                navigator.clipboard?.writeText(wkt);
              },
            },
          ]}
        />
      </div>
    </div>
  );
});

function OverflowMenu({
  items,
}: {
  items: {label: string; icon: JSX.Element; action: () => void}[];
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
    <div
      ref={ref}
      className={cn(styles.overflowMenu, {[styles.open]: open})}
      onClick={() => setOpen(!open)}
    >
      <OverflowMenuIcon />

      {open ? (
        <div className={styles.popup}>
          {items.map((item, i) => (
            <div key={i} className={styles.item} onClick={() => item.action()}>
              {item.icon}
              {item.label}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const LineStringRenderer = observer(function _LineStringRenderer({
  state,
  geom,
}: {
  state: PostgisEditor;
  geom: LineString;
}) {
  return (
    <StickyHeader state={state} geom={geom}>
      {geom.kind === "LineString" && geom.parent instanceof Polygon ? (
        <span>LinearRing</span>
      ) : (
        geom.kind
      )}
    </StickyHeader>
  );
}) as GeometryRenderer;

const BaseGeometryRenderer = (({
  state,
  geom,
}: {
  state: PostgisEditor;
  geom: Geometry;
}) => (
  <StickyHeader state={state} geom={geom}>
    {geom.kind}
  </StickyHeader>
)) as GeometryRenderer;

const BoxRenderer = (({state, geom}: {state: PostgisEditor; geom: Box}) => (
  <StickyHeader state={state} geom={geom} noExpand>
    {geom.kind}
  </StickyHeader>
)) as GeometryRenderer;

const PointHeaderRender = (({
  state,
  geom,
}: {
  state: PostgisEditor;
  geom: ListItemWrapper;
}) => (
  <StickyHeader
    state={state}
    geom={geom.geom}
    isEmpty={(geom.geom as Point).isEmpty}
  >
    Point
  </StickyHeader>
)) as GeometryRenderer;

const EndPlaceholderRenderer = observer(function _EndPlaceholderRenderer({
  state,
  geom: item,
}: {
  state: PostgisEditor;
  geom: ListItemWrapper;
}) {
  const selectedParentDepth = getSelectedParentDepth(state, item.geom);

  return (
    <div
      className={cn(styles.endBracket, {
        [styles.startSelected]: state.selectedGeoms.has(item.geom),
        [styles.parentSelected]: selectedParentDepth !== null,
        [styles.inactive]: isInactive(state, item.geom),
      })}
      style={{"--selectedParentDepth": selectedParentDepth} as any}
    >
      {")"}
    </div>
  );
}) as GeometryRenderer;

type GeometryRenderer = FunctionComponent<{
  state: PostgisEditor;
  geom: ListItem;
}>;

const renderers: {[key in ListItem["kind"]]?: GeometryRenderer} = {
  Box: BoxRenderer,
  Point: PointRenderer,
  LineString: LineStringRenderer,
  CircularString: LineStringRenderer,
  __PointHeader: PointHeaderRender,
  __PointWrapper: PointRenderer,
  __ListItemEndPlaceholder: EndPlaceholderRenderer,
};

export const WKTRenderer = observer(function _WKTRenderer({
  state,
}: {
  state: PostgisEditor;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useResize(ref, ({height}) => state.setSidePanelHeight(height));

  const listItems = state.data?.listItems ?? [];
  const [startIndex, endIndex] = state.visibleListItemIndexes;

  const seenParents = new Set<Geometry | Box>();
  const parents: JSX.Element[] = [];
  const items: JSX.Element[] = [];

  let i = 0;
  for (const item of listItems.slice(startIndex, endIndex)) {
    const isWrapper =
      item.kind === "__PointHeader" ||
      item.kind === "__ListItemEndPlaceholder" ||
      item.kind === "__PointWrapper";
    const geom = isWrapper ? item.geom : (item as Geometry);

    const Renderer = renderers[item.kind] ?? BaseGeometryRenderer;
    items.push(
      <div
        key={item.id}
        className={styles.listItemWrapper}
        style={
          {
            gridRow: `${startIndex + 1 + i++} / span ${
              (isWrapper && item.kind !== "__PointHeader") ||
              item.kind === "Point"
                ? 1
                : Math.max(1, geom.listItems.length - 1)
            }`,
            "--itemDepth":
              geom.listDepth +
              (item.kind === "Point" && !(item.parent instanceof LineString)
                ? 1
                : 0),
          } as any
        }
      >
        <Renderer state={state} geom={item} />
      </div>
    );
    seenParents.add(geom);

    if (item.kind === "__PointWrapper" ? item.parent : geom.parent) {
      let parent: Geometry | null = geom.parent;
      while (parent && !seenParents.has(parent)) {
        const Renderer = renderers[parent.kind] ?? BaseGeometryRenderer;
        parents.unshift(
          <div
            key={parent.id}
            className={styles.listItemWrapper}
            style={
              {
                gridRow: `${listItems.indexOf(parent) + 1} / span ${Math.max(
                  1,
                  parent.listItems.length - 1
                )}`,
                "--itemDepth": parent.listDepth,
              } as any
            }
          >
            <Renderer state={state} geom={parent} />
          </div>
        );
        seenParents.add(parent);
        parent = parent.parent;
      }
    }
  }

  return (
    <div
      ref={ref}
      className={styles.wktListWrapper}
      onScroll={() =>
        state.setSidePanelScrollTop(Math.max(0, ref.current!.scrollTop))
      }
    >
      <div
        className={styles.listInner}
        style={{height: listItems.length * ListItemRowHeight}}
      >
        {parents}
        {items}
      </div>
    </div>
  );
});
