import {useEffect, useRef, useState} from "react";
import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";

import {PostgisEditor} from "./state";

import styles from "./postgisViewer.module.scss";
import {
  CloseIcon,
  ToolbarCircularIcon,
  ToolbarLineIcon,
  ToolbarPointIcon,
  ToolbarPolygonIcon,
  ToolbarSelectIcon,
  ToolbarTriangleIcon,
} from "./icons";
import {ChevronDownIcon} from "@dbsof/common/newui";
import {Box} from "./editableGeom/types";

export const FloatingToolbar = observer(function FloatingToolbar({
  state,
}: {
  state: PostgisEditor;
}) {
  if (state.data instanceof Box) return null;

  if (state.readonly) {
    return state.editingGeom ? (
      <div className={styles.floatingToolbar}>
        <ToolbarButton
          icon={<CloseIcon />}
          label="Exit Geometry"
          shortcut="Esc"
          selected={false}
          hidden={false}
          expanded
          onClick={() => state.endEditingGeom()}
        />
      </div>
    ) : null;
  }

  return (
    <div className={styles.floatingToolbar}>
      <ToolbarButton
        icon={<CloseIcon />}
        label="Finish Editing"
        shortcut="Esc"
        selected={false}
        hidden={!state.editingGeom}
        onClick={() => state.endEditingGeom()}
      />
      {state.editingGeom ? <div className={styles.spacer} /> : null}
      <ToolbarButton
        icon={<ToolbarSelectIcon />}
        label="Select/Move"
        shortcut="V"
        selected={state.editingMode === null}
        hidden={!state.availableModes.has(null)}
        onClick={() => state.setEditingMode(null)}
      />
      <ToolbarButton
        icon={<ToolbarPointIcon />}
        label="Add Point"
        shortcut="P"
        selected={state.editingMode === "point"}
        hidden={!state.availableModes.has("point")}
        onClick={() => state.setEditingMode("point")}
      />
      <ToolbarButtonGroup
        buttons={[
          {
            id: "line",
            icon: <ToolbarLineIcon />,
            label: "Add LineString",
            shortcut: "L",
            selected: state.editingMode === "line",
            hidden: !state.availableModes.has("line"),
            onClick: () => state.setEditingMode("line"),
          },
          {
            id: "circular",
            icon: <ToolbarCircularIcon />,
            label: "Add CircularString",
            shortcut: "C",
            selected: state.editingMode === "circular",
            hidden: !state.availableModes.has("circular"),
            onClick: () => state.setEditingMode("circular"),
          },
        ]}
        selectedButton={state.selectedLineButtonMode}
      />
      <ToolbarButtonGroup
        buttons={[
          {
            id: "polygon",
            icon: <ToolbarPolygonIcon />,
            label: "Add Polygon",
            shortcut: "S",
            selected: state.editingMode === "polygon",
            hidden: !state.availableModes.has("polygon"),
            onClick: () => state.setEditingMode("polygon"),
          },
          {
            id: "triangle",
            icon: <ToolbarTriangleIcon />,
            label: "Add Triangle",
            shortcut: "T",
            selected: state.editingMode === "triangle",
            hidden: !state.availableModes.has("triangle"),
            onClick: () => state.setEditingMode("triangle"),
          },
        ]}
        selectedButton={state.selectedPolyButtonMode}
      />
      <ToolbarButton
        icon={<ToolbarPolygonIcon />}
        label="Add Ring"
        shortcut="R"
        selected={state.editingMode === "ring"}
        hidden={!state.availableModes.has("ring")}
        onClick={() => state.setEditingMode("ring")}
      />
      {state.availableGeomActions.size ? (
        <div className={styles.spacer} />
      ) : null}
      <ToolbarButton
        icon={<ToolbarPolygonIcon />}
        label="Ungroup Selection"
        shortcut="⌘ + U"
        selected={false}
        hidden={!state.availableGeomActions.has("ungroup")}
        onClick={() => state.applyGeomAction("ungroup")}
      />
      <ToolbarButtonGroup
        buttons={[
          {
            id: "group-multi",
            icon: <ToolbarPolygonIcon />,
            label: `Group into Multi${
              [...state.selectedGeoms][0]?.kind ?? ""
            }`,
            shortcut: "⌘ + G",
            selected: false,
            hidden: !state.availableGeomActions.has("group-multi"),
            onClick: () => state.applyGeomAction("group-multi"),
          },
          {
            id: "",
            icon: <ToolbarPolygonIcon />,
            label: "Group into GeometryCollection",
            shortcut: "⌘ + ⌥ + G",
            selected: false,
            hidden: !state.availableGeomActions.has("group-collection"),
            onClick: () => state.applyGeomAction("group-collection"),
          },
        ]}
        selectedButton={state.selectedPolyButtonMode}
      />
    </div>
  );
});

interface ToolbarButtonProps {
  icon: JSX.Element;
  label: string;
  shortcut: string;
  selected: boolean;
  hidden: boolean;
  expanded?: boolean;
  onClick: () => void;
}

function ToolbarButton({
  icon,
  selected,
  hidden,
  onClick,
  label,
  shortcut,
  expanded,
}: ToolbarButtonProps) {
  return (
    <div
      className={cn(styles.toolbarButton, {
        [styles.selected]: selected,
        [styles.hidden]: hidden,
        [styles.expanded]: !!expanded,
      })}
      onClick={onClick}
    >
      {icon}

      <div className={styles.tooltipLabel}>
        {label}
        <span className={styles.shortcut}>{shortcut}</span>
      </div>
    </div>
  );
}

function ToolbarButtonGroup<Modes extends string>({
  buttons,
  selectedButton,
}: {
  buttons: (ToolbarButtonProps & {id: Modes})[];
  selectedButton: Modes;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (menuOpen) {
      const listener = (e: MouseEvent) => {
        if (!menuRef.current?.contains(e.target as Node)) {
          setMenuOpen(false);
        }
      };
      window.addEventListener("mousedown", listener, {capture: true});

      return () => {
        window.removeEventListener("mousedown", listener, {capture: true});
      };
    }
  }, [menuOpen]);

  const availableButtons = buttons.filter((button) => !button.hidden);

  const selected =
    availableButtons.find((button) => button.id === selectedButton) ??
    availableButtons[0];

  if (!selected) return null;

  return (
    <div className={styles.toolbarGroupWrapper}>
      <ToolbarButton {...selected} />
      {availableButtons.length > 1 ? (
        <>
          <div
            className={styles.toolbarGroupShowMenu}
            onClick={() => setMenuOpen(true)}
          >
            <ChevronDownIcon />
          </div>

          <div
            ref={menuRef}
            className={cn(styles.toolbarGroupMenu, {
              [styles.menuOpen]: menuOpen,
            })}
          >
            {buttons.map((button) => (
              <div
                key={button.id}
                className={styles.menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  button.onClick();
                }}
              >
                {button.icon}
                {button.label}
                <span className={styles.shortcut}>{button.shortcut}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
