import {useState} from "react";

import styles from "./debug.module.scss";

export function useDebugState() {
  return useState({
    showGrid: false,
    showMargins: false,
    show: false,
    showOOBMarkers: false,
    zoomFactor: 600,
  });
}

export type DebugState = ReturnType<typeof useDebugState>;

interface DebugControlsProps {
  debugState: DebugState;
  schemaState: any;
}

export function DebugControls({
  debugState: [debugState, setDebugState],
  schemaState,
}: DebugControlsProps) {
  const updateDebugState = (update: any) =>
    setDebugState({...debugState, ...update});

  const debugControls = (
    <>
      <button onClick={() => schemaState.graph.autoLayoutNodes()}>
        Auto Layout™
      </button>
      {JSON.stringify(schemaState.graph.viewport.position)}
      <br />
      {JSON.stringify(schemaState.graph.viewport.viewportRect)}
      <br />
      Zoom: {JSON.stringify(schemaState.graph.viewport.zoomLevel)}
      <label>
        Warp factor:&nbsp;
        <input
          type="number"
          value={debugState.zoomFactor}
          onChange={({target}) => {
            const val = parseInt(target.value, 10);
            updateDebugState({zoomFactor: isNaN(val) ? 1 : val});
          }}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={debugState.showGrid}
          onChange={({target}) => updateDebugState({showGrid: target.checked})}
        />
        Show Grid
      </label>
      <label>
        <input
          type="checkbox"
          checked={debugState.showMargins}
          onChange={({target}) =>
            updateDebugState({showMargins: target.checked})
          }
        />
        Show Margins
      </label>
      <label>
        <input
          type="checkbox"
          checked={schemaState.graph.debugShowAllLinks}
          onChange={({target}) =>
            schemaState.graph.setDebugShowAllLinks(target.checked)
          }
        />
        Show All Links
      </label>
      <label>
        <input
          type="checkbox"
          checked={debugState.showOOBMarkers}
          onChange={({target}) =>
            updateDebugState({showOOBMarkers: target.checked})
          }
        />
        Show Out of Bounds Markers
      </label>
      <div>
        Undos: {schemaState.graph.nodesStateHistoryUndoStack.length}{" "}
        <button onClick={schemaState.graph.undoNodesState}>Undo</button>
      </div>
      <div>
        Redos: {schemaState.graph.nodesStateHistoryRedoStack.length}{" "}
        <button onClick={schemaState.graph.redoNodesState}>Redo</button>
      </div>
      <button onClick={() => schemaState.graph.layoutLinks()}>
        Route Links
      </button>
    </>
  );

  return (
    <div className={styles.debugopts}>
      <button onClick={() => updateDebugState({show: !debugState.show})}>
        {debugState.show ? "Hide" : "Show"} Debug
      </button>
      {debugState.show ? debugControls : null}
    </div>
  );
}
