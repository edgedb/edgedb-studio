import {lazy, Suspense} from "react";
import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";

import SplitView from "@dbsof/common/ui/splitView";
import SwitcherButton from "@dbsof/common/ui/switcherButton";

import styles from "./schema.module.scss";

import {useTabState} from "../../state";
import {Schema, SchemaViewType} from "./state";

import {DatabaseTabSpec} from "../../components/databasePage";

import {
  SchemaViewGraphIcon,
  SchemaViewTextGraphIcon,
  SchemaViewTextIcon,
  TabSchemaIcon,
} from "../../icons";

import {SchemaTextView} from "./textView";
import {useIsMobile} from "@dbsof/common/hooks/useMobile";
import {LabelsSwitch, switchState} from "@dbsof/common/ui/switch";

const _SchemaGraphView = lazy(() => import("./graphView"));

function SchemaGraphView({state}: {state: Schema}) {
  return (
    <div className={styles.schemaGraphView}>
      <Suspense fallback={null}>
        <_SchemaGraphView state={state} />
      </Suspense>
    </div>
  );
}

export const SchemaView = observer(function SchemaView() {
  const schemaState = useTabState(Schema);
  const isMobile = useIsMobile();

  const isGraphView = schemaState.viewType === SchemaViewType.Graph;

  return (
    <div className={cn(styles.schema)}>
      {schemaState.viewType === SchemaViewType.Text ? (
        <SchemaTextView />
      ) : null}
      {isGraphView ? <SchemaGraphView state={schemaState} /> : null}
      {schemaState.viewType === SchemaViewType.TextGraph ? (
        <SplitView
          views={[<SchemaTextView />, <SchemaGraphView state={schemaState} />]}
          state={schemaState.splitView}
          minViewSize={20}
        />
      ) : null}

      {isMobile ? (
        <LabelsSwitch
          className={styles.viewSwitch}
          labels={["Text", "Graph"]}
          value={isGraphView ? switchState.right : switchState.left}
          onChange={() =>
            schemaState.setViewType(
              isGraphView ? SchemaViewType.Text : SchemaViewType.Graph
            )
          }
        />
      ) : (
        <div className={cn(styles.toolbar)}>
          <div className={styles.switcherLabel}>View Layout</div>
          <div className={styles.viewSwitcher}>
            <SwitcherButton
              items={[
                {
                  id: SchemaViewType.Text,
                  label: "Text",
                  icon: (
                    <SchemaViewTextIcon className={styles.viewSwitcherIcon} />
                  ),
                },
                {
                  id: SchemaViewType.Graph,
                  label: "Graph",
                  icon: (
                    <SchemaViewGraphIcon className={styles.viewSwitcherIcon} />
                  ),
                },
                {
                  id: SchemaViewType.TextGraph,
                  label: "Text/Graph",
                  icon: (
                    <SchemaViewTextGraphIcon
                      className={styles.viewSwitcherIcon}
                    />
                  ),
                },
              ]}
              selected={schemaState.viewType}
              onChange={(type) => schemaState.setViewType(type)}
            />
          </div>
        </div>
      )}
    </div>
  );
});

export const schemaTabSpec: DatabaseTabSpec = {
  path: "schema",
  allowNested: true,
  label: "Schema",
  icon: (active) => <TabSchemaIcon active={active} />,
  usesSessionState: false,
  state: Schema,
  element: <SchemaView />,
};
