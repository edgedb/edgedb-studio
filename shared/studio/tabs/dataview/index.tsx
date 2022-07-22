import {useEffect} from "react";
import {observer} from "mobx-react";
import {useParams, useNavigate} from "react-router-dom";

import cn from "@edgedb/common/utils/classNames";

import {formatUUID} from "@edgedb/inspector/v2/buildScalar";

import styles from "./dataview.module.scss";

import {useModal} from "@edgedb/common/hooks/useModal";
import {Theme, useTheme} from "@edgedb/common/hooks/useTheme";

import {useTabState, useDatabaseState} from "../../state";
import {
  DataView as DataViewState,
  DataInspector as DataInspectorState,
} from "./state";
import {DatabaseTabSpec} from "../../components/databasePage";

import {CodeEditor} from "@edgedb/code-editor";

import DataInspectorTable from "./dataInspector";

import {ReviewEditsModal} from "./reviewEditsModal";

import {ApplyFilterIcon, BackArrowIcon, ClearFilterIcon} from "./icons";
import {ChevronDownIcon, FilterIcon, TabDataExplorerIcon} from "../../icons";
import {Select} from "@edgedb/common/ui/select";
import Button from "@edgedb/common/ui/button";

export const DataView = observer(function DataView() {
  const dbState = useDatabaseState();
  const state = useTabState(DataViewState);
  const params = useParams();
  const navigate = useNavigate();

  const stack = state.inspectorStack;

  const path = params["*"];
  useEffect(() => {
    if (stack.length) {
      if (!path) {
        navigate(stack[0].objectType!.name, {replace: true});
      } else {
        const updatedPath = state.updateFromPath(path);
        if (updatedPath) {
          navigate(updatedPath, {replace: true});
        }
      }
    }
  }, [path, stack.length]);

  return (
    <div className={styles.dataview}>
      {stack.length > 1 ? <div className={styles.stackedCard} /> : null}
      {stack.length ? (
        <DataInspectorView stackIndex={stack.length - 1} />
      ) : (
        <div className={cn(styles.dataviewCard, styles.loadingSkeleton)}>
          {dbState.schemaData
            ? "No object types in schema"
            : "Loading schema..."}
        </div>
      )}
    </div>
  );
});

export const dataviewTabSpec: DatabaseTabSpec = {
  path: "data",
  allowNested: true,
  label: "Data Explorer",
  icon: (active) => <TabDataExplorerIcon active={active} />,
  state: DataViewState,
  element: <DataView />,
};

interface DataInspectorViewProps {
  stackIndex: number;
}

const DataInspectorView = observer(function DataInspectorView({
  stackIndex,
}: DataInspectorViewProps) {
  const dataviewState = useTabState(DataViewState);
  const {openModal} = useModal();
  const navigate = useNavigate();
  const path = useParams()["*"]!;

  const stack = dataviewState.inspectorStack;

  const inspectorState = stack[stackIndex];

  const nestedPath = stackIndex > 0 ? stack[stack.length - 1] : null;

  return (
    <div
      className={cn(styles.dataviewCard, {
        [styles.nestedView]: stackIndex > 0,
      })}
    >
      <div className={styles.header}>
        {!nestedPath ? (
          <>
            <Select
              className={cn(styles.headerSelect, styles.objectSelect)}
              items={dataviewState.objectTypes.map(({id, name}) => {
                const [modName, typeName] = name.split(/::/);
                return {
                  label: (
                    <>
                      <span className={styles.modName}>{modName}::</span>
                      {typeName}
                    </>
                  ),
                  action: () => {
                    navigate(name);
                    dataviewState.selectObject(id);
                  },
                };
              })}
              selectedItemIndex={dataviewState.objectTypes.indexOf(
                stack[0]?.objectType!
              )}
            />
          </>
        ) : (
          <>
            <div
              className={styles.backButton}
              onClick={() => {
                navigate(path.split("/").slice(0, -2).join("/"));
                dataviewState.closeLastNestedView();
              }}
            >
              <BackArrowIcon />
            </div>
            <div className={styles.nestedPathSteps}>
              <div className={styles.nestedPathStep}>
                <div className={styles.pathStepName}>
                  {nestedPath.parentObject?.objectTypeName}
                </div>
                <div className={styles.pathStepIdent}>
                  {typeof nestedPath.parentObject!.id === "string" ? (
                    <span>{formatUUID(nestedPath.parentObject!.id)}</span>
                  ) : (
                    <span style={{fontStyle: "italic"}}>new object</span>
                  )}
                </div>
              </div>
              <div className={styles.nestedPathStep}>
                <div className={styles.pathStepName}>
                  .{nestedPath.parentObject?.fieldName}
                </div>
                <div className={styles.pathStepIdent}>
                  <span>{nestedPath.objectType!.name}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {inspectorState.parentObject &&
        !inspectorState.parentObject.isComputedLink ? (
          <div
            className={styles.headerButton}
            onClick={() => inspectorState.toggleEditLinkMode()}
          >
            {inspectorState.parentObject.editMode
              ? "Close edit mode"
              : "Edit links"}
          </div>
        ) : null}

        <div className={styles.rowCount}>{inspectorState?.rowCount} Items</div>

        <div className={styles.headerButtons}>
          {dataviewState.edits.hasPendingEdits ? (
            <>
              <div
                className={cn(styles.headerButton, styles.reviewChanges)}
                onClick={() =>
                  openModal(<ReviewEditsModal state={dataviewState} />)
                }
              >
                Review Changes
              </div>
            </>
          ) : null}

          {inspectorState.insertTypeNames.length &&
          (!inspectorState.parentObject ||
            inspectorState.parentObject.editMode) ? (
            inspectorState.insertTypeNames.length > 1 ? (
              <Select
                className={styles.headerSelect}
                title="Insert..."
                items={null}
                actions={inspectorState.insertTypeNames.map((name) => ({
                  label: name,
                  action: () => dataviewState.edits.createNewRow(name),
                }))}
              />
            ) : (
              <div
                className={styles.headerButton}
                onClick={() =>
                  dataviewState.edits.createNewRow(
                    inspectorState.insertTypeNames[0]
                  )
                }
              >
                Insert {inspectorState.insertTypeNames[0].split("::")[1]}
              </div>
            )
          ) : null}

          <div
            className={cn(styles.filterButton, {
              [styles.open]: inspectorState.filterPanelOpen,
              [styles.filterActive]: !!inspectorState.filter,
            })}
            onClick={() => {
              inspectorState.setFilterPanelOpen(
                !inspectorState.filterPanelOpen
              );
            }}
          >
            <FilterIcon className={styles.filterIcon} />
            Filter
            <ChevronDownIcon className={styles.openIcon} />
          </div>
        </div>
      </div>

      {inspectorState.filterPanelOpen ? (
        <FilterPanel state={inspectorState} />
      ) : null}

      <DataInspectorTable
        key={inspectorState.$modelId}
        state={inspectorState}
        edits={dataviewState.edits}
      />
    </div>
  );
});

interface FilterPanelProps {
  state: DataInspectorState;
}

const FilterPanel = observer(function FilterPanel({state}: FilterPanelProps) {
  const [_, theme] = useTheme();

  return (
    <div className={styles.filterPanel}>
      <CodeEditor
        code={state.filterEditStr}
        onChange={(value) => state.setFilterEditStr(value)}
        useDarkTheme={theme === Theme.dark}
      />

      <div className={styles.filterActions}>
        <div className={styles.filterError}>{state.filterError}</div>

        <Button
          className={styles.clearFilterButton}
          label="Clear"
          icon={<ClearFilterIcon />}
          leftIcon
          disabled={!state.filter && !state.filterEdited}
          onClick={() => state.clearFilter()}
        />

        <Button
          className={styles.disableFilterButton}
          label="Disable Filter"
          icon={<ClearFilterIcon />}
          leftIcon
          disabled={!state.filter}
          onClick={() => state.disableFilter()}
        />

        <Button
          className={styles.applyFilterButton}
          label={state.filter ? "Update Filter" : "Apply Filter"}
          icon={<ApplyFilterIcon />}
          leftIcon
          disabled={!state.filterEdited}
          onClick={() => state.applyFilter()}
        />
      </div>
    </div>
  );
});
