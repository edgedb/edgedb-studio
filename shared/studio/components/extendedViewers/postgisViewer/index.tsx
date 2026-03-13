import {useContext, useEffect, useRef, useState} from "react";
import {observer} from "mobx-react-lite";

import "maplibre-gl/dist/maplibre-gl.css";

import cn from "@dbsof/common/utils/classNames";

import styles from "./postgisViewer.module.scss";
import {useTheme} from "@dbsof/common/hooks/useTheme";
import {Geometry, Box2D, Box3D} from "@dbsof/platform/client";
import {
  createPostgisEditorState,
  MAX_M_RADIUS,
  MIN_M_RADIUS,
  PostgisEditor,
} from "./state";

import {WKTRenderer} from "./wktRenderers";
import {FloatingToolbar} from "./toolbar";
import {ExtendedViewerContext} from "../shared";
import {CloseIcon} from "./icons";
import {Checkbox, CheckIcon, SettingsIcon} from "@dbsof/common/newui";
import {convertFromEditableGeometry} from "./editableGeom/convert";
import {Box} from "./editableGeom/types";
import {useGlobalDragCursor} from "@dbsof/common/hooks/globalDragCursor";

export interface PostgisViewerProps {
  data: Geometry | Box2D | Box3D | null;
  editable?: boolean;
}

export const PostgisViewer = observer(function PostgisViewer({
  data,
  editable = false,
}: PostgisViewerProps) {
  const [_, theme] = useTheme();

  const [state] = useState(() =>
    createPostgisEditorState(data, editable, theme)
  );

  useEffect(() => state.init(), []);

  useEffect(() => {
    state.setTheme(theme);
  }, [theme]);

  return (
    <div className={styles.postgisViewer}>
      <div ref={state.mapElRef} className={styles.map}>
        <DragSelection state={state} />
      </div>
      <Sidepanel state={state} />
      <div className={styles.floatingToolbarWrapper}>
        <MLegend state={state} />
        <FloatingToolbar state={state} />
      </div>
    </div>
  );
});

export default PostgisViewer;

const Sidepanel = observer(function Sidepanel({
  state,
}: {
  state: PostgisEditor;
}) {
  const [_, setGlobalDrag] = useGlobalDragCursor();

  return (
    <div
      className={styles.sidepanel}
      style={
        {
          "--sidepanelWidth":
            Math.min(Math.max(320, state.sidePanelWidth), 600) + "px",
        } as any
      }
    >
      <div
        className={styles.resizeHandle}
        onMouseDown={(e) => {
          const startMouseLeft = e.clientX;
          const startWidth = state.sidePanelWidth;
          const moveListener = (e: MouseEvent) => {
            state.setSidePanelWidth(startMouseLeft - e.clientX + startWidth);
          };
          setGlobalDrag("col-resize");

          window.addEventListener("mousemove", moveListener);
          window.addEventListener(
            "mouseup",
            () => {
              window.removeEventListener("mousemove", moveListener);
              setGlobalDrag(null);
            },
            {once: true}
          );
        }}
      />

      <SidepanelHeader state={state} />
      {state.data ? <WKTRenderer state={state} /> : null}
    </div>
  );
});

const SidepanelHeader = observer(function SidepanelHeader({
  state,
}: {
  state: PostgisEditor;
}) {
  const {closeExtendedView} = useContext(ExtendedViewerContext);

  const menuRef = useRef<HTMLDivElement>(null);
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);

  useEffect(() => {
    if (optionsMenuOpen) {
      const listener = (e: MouseEvent) => {
        if (!menuRef.current?.contains(e.target as Node)) {
          setOptionsMenuOpen(false);
        }
      };

      window.addEventListener("mousedown", listener, {capture: true});

      return () => {
        window.removeEventListener("mousedown", listener, {capture: true});
      };
    }
  }, [optionsMenuOpen]);

  return (
    <div className={styles.panelHeader}>
      {!state.readonly && !(state.data instanceof Box) ? (
        <div ref={menuRef} className={styles.optionsMenu}>
          <div
            className={cn(styles.headerButton, styles.optionsMenuButton)}
            onClick={() => setOptionsMenuOpen(!optionsMenuOpen)}
          >
            <SettingsIcon />
          </div>
          {optionsMenuOpen ? (
            <div className={styles.menuDropdown}>
              <div
                className={styles.menuItem}
                onClick={() => state.toggleHasZ()}
              >
                <Checkbox
                  className={styles.checkbox}
                  checked={state.hasZ}
                  readOnly
                />
                {state.hasZ ? "Disable" : "Enable"} Z coordinates
              </div>
              <div
                className={styles.menuItem}
                onClick={() => state.toggleHasM()}
              >
                <Checkbox
                  className={styles.checkbox}
                  checked={state.hasM}
                  readOnly
                />
                {state.hasM ? "Disable" : "Enable"} M values
              </div>
              <div
                className={styles.menuItem}
                onClick={() => state.toggleCleanupEmptyGeom()}
              >
                <Checkbox
                  className={styles.checkbox}
                  checked={state.cleanupEmptyGeom}
                  readOnly
                />
                Auto clean up empty geometry
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(styles.headerButton, styles.closeButton)}
        onClick={() => closeExtendedView()}
      >
        <CloseIcon />
        {!state.readonly && state.isEdited ? <span>Discard</span> : null}
      </div>
      {!state.readonly && state.isEdited ? (
        <div
          className={cn(styles.headerButton, styles.saveButton)}
          onClick={() =>
            closeExtendedView(convertFromEditableGeometry(state.data, state))
          }
        >
          <CheckIcon />
          <span>Save changes</span>
        </div>
      ) : null}
    </div>
  );
});

const DragSelection = observer(function DragSelection({
  state,
}: {
  state: PostgisEditor;
}) {
  const bounds = state.dragSelectionBounds;
  return bounds ? (
    <div
      className={styles.dragSelection}
      style={{
        top: Math.min(bounds[0][1], bounds[1][1]),
        left: Math.min(bounds[0][0], bounds[1][0]),
        width: Math.abs(bounds[1][0] - bounds[0][0]),
        height: Math.abs(bounds[1][1] - bounds[0][1]),
      }}
    />
  ) : null;
});

const LEGEND_WIDTH = 120;

const MLegend = observer(function MLegend({state}: {state: PostgisEditor}) {
  if (!state.hasM || state.minMaxM[0] === state.minMaxM[1]) return null;

  const minValStrLen = state.minMaxM[0].toString().length;
  const maxValStrLen = state.minMaxM[1].toString().length;

  return (
    <div
      className={styles.mLegend}
      style={{
        paddingLeft: `max(8px, calc(${6 - (4 + MIN_M_RADIUS)}px + ${
          minValStrLen / 2
        }ch))`,
        paddingRight: `max(4px, calc(${6 - (4 + MAX_M_RADIUS)}px + ${
          maxValStrLen / 2
        }ch))`,
      }}
    >
      <svg
        viewBox={`0 0 ${LEGEND_WIDTH} ${MAX_M_RADIUS * 2 + 8}`}
        width={LEGEND_WIDTH}
        height={MAX_M_RADIUS * 2 + 8}
      >
        <path
          d={`M ${MIN_M_RADIUS + 4} ${MAX_M_RADIUS - MIN_M_RADIUS + 4 - 1} L ${
            LEGEND_WIDTH - 4 - MAX_M_RADIUS
          } ${4 - 1} v ${MAX_M_RADIUS * 2 + 2} L ${MIN_M_RADIUS + 4} ${
            MIN_M_RADIUS + MAX_M_RADIUS + 4 + 1
          }`}
        />
        <circle
          cx={MIN_M_RADIUS + 4}
          cy={MAX_M_RADIUS + 4}
          r={MIN_M_RADIUS + 0.5}
        />
        <circle
          cx={LEGEND_WIDTH - 4 - MAX_M_RADIUS}
          cy={MAX_M_RADIUS + 4}
          r={MAX_M_RADIUS + 0.5}
        />
      </svg>
      <div className={styles.labels}>
        <div
          style={{
            marginLeft: `calc(${4 + MIN_M_RADIUS}px - ${minValStrLen / 2}ch)`,
          }}
        >
          {state.minMaxM[0]}
        </div>
        <div className={styles.mainLabel}>M value</div>
        <div
          style={{
            marginRight: `calc(${4 + MAX_M_RADIUS}px - ${maxValStrLen / 2}ch)`,
          }}
        >
          {state.minMaxM[1]}
        </div>
      </div>
    </div>
  );
});
