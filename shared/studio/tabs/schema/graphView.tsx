import {useLayoutEffect} from "react";
import {observer} from "mobx-react-lite";

import {
  Schema as SchemaState,
  NodeGraph,
  schemaContext,
  useDebugState,
  DebugControls,
  NodeGraphMinimap,
} from "@dbsof/node-graph";

import type {Schema} from "./state";

import styles from "./schema.module.scss";
import {runInAction} from "mobx";

const SchemaGraphView = observer(function SchemaGraphView({
  state,
}: {
  state: Schema;
}) {
  const debugState = useDebugState();

  useLayoutEffect(() => {
    if (!state.schemaState) {
      runInAction(() => {
        state.schemaState = SchemaState.create();
      });
    }
  }, [state.schemaState]);

  return state.schemaState ? (
    <schemaContext.Provider value={state.schemaState}>
      {process.env.NODE_ENV === "development" ? (
        <DebugControls
          debugState={debugState}
          schemaState={state.schemaState}
        />
      ) : null}
      <NodeGraph debug={debugState[0]} />
      <NodeGraphMinimap className={styles.minimap} />
    </schemaContext.Provider>
  ) : null;
});

export default SchemaGraphView;
