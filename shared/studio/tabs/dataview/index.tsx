import {useEffect, useMemo} from "react";
import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";

import styles from "./dataview.module.scss";

import {useModal} from "@dbsof/common/hooks/useModal";
import {Theme, useTheme} from "@dbsof/common/hooks/useTheme";
import {
  Button,
  Select,
  SyncIcon,
  ChevronDownIcon,
  FilterIcon,
  CrossIcon,
  CheckIcon,
} from "@dbsof/common/newui";
import {Button as MobButton} from "@dbsof/common/ui/mobile";

import {useTabState, useDatabaseState} from "../../state";
import {
  DataView as DataViewState,
  DataInspector as DataInspectorState,
} from "./state";
import {DatabaseTabSpec} from "../../components/databasePage";
import {useDBRouter} from "../../hooks/dbRoute";

import {CodeEditor} from "@dbsof/code-editor";

import DataInspectorTable from "./dataInspector";

import {ReviewEditsModal} from "./reviewEditsModal";

import {ObjectTypeSelect} from "../../components/objectTypeSelect";

import {BackArrowIcon} from "./icons";
import {BackIcon, TabDataExplorerIcon, WarningIcon} from "../../icons";
import {useIsMobile} from "@dbsof/common/hooks/useMobile";
import {CloseButton} from "@dbsof/common/ui/mobile";

export const DataView = observer(function DataView() {
  const dbState = useDatabaseState();
  const state = useTabState(DataViewState);
  const {navigate, currentPath} = useDBRouter();

  const stack = state.inspectorStack;

  useEffect(() => {
    const basePath = currentPath.slice(0, 2).join("/");
    const path = currentPath.slice(2).join("/");
    if (!path && state.lastSelectedPath) {
      navigate(`${basePath}/${state.lastSelectedPath}`, true);
    } else if (dbState.schemaData) {
      const updatedPath = state.updateFromPath(path ?? "");
      if (updatedPath !== null) {
        navigate(
          `${basePath}/${updatedPath
            .map((part) => encodeURIComponent(part).replace(/%3A/g, ":"))
            .join("/")}`,
          true
        );
      }
    }
  }, [currentPath, dbState.schemaData]);

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
  usesSessionState: true,
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
  const {navigate, currentPath} = useDBRouter();

  const basePath = currentPath.slice(0, 2).join("/");

  const stack = dataviewState.inspectorStack;

  const inspectorState = stack[stackIndex];

  const nestedPath = stackIndex > 0 ? stack[stack.length - 1] : null;

  const isMobile = useIsMobile();

  return (
    <div
      className={cn(styles.dataviewCard, {
        [styles.nestedView]: stackIndex > 0,
      })}
    >
      <div className={cn(styles.header, {[styles.nested]: !!nestedPath})}>
        {!nestedPath ? (
          <>
            <ObjectTypeSelect
              className={styles.objectSelect}
              fullScreen
              fullScreenTitle="Object type"
              objectTypes={dataviewState.objectTypes}
              selectedObjectType={stack[0].objectType!}
              action={(objectType) => {
                navigate(`${basePath}/${objectType.name}`);
                dataviewState.selectObject(objectType.id);
              }}
            />
          </>
        ) : (
          <>
            <div
              className={styles.backButton}
              onClick={() => {
                navigate(currentPath.slice(0, -2).join("/"));
                dataviewState.closeLastNestedView();
              }}
            >
              {isMobile ? <BackIcon /> : <BackArrowIcon />}
            </div>
            <div className={styles.nestedPathSteps}>
              <div className={styles.nestedPathStep}>
                <div className={styles.pathStepName}>
                  {nestedPath.parentObject?.objectTypeName}
                </div>
                <div className={styles.pathStepIdent}>
                  {typeof nestedPath.parentObject!.id === "string" ? (
                    <span>{nestedPath.parentObject!.id}</span>
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

        {!isMobile &&
        inspectorState.parentObject &&
        !(
          inspectorState.parentObject.isComputedLink ||
          inspectorState.parentObject.readonly
        ) ? (
          <Button
            kind="outline"
            onClick={() => inspectorState.toggleEditLinkMode()}
          >
            {inspectorState.parentObject.editMode
              ? "Close edit mode"
              : "Edit links"}
          </Button>
        ) : null}

        {!isMobile && (
          <div className={styles.rowCount}>
            {inspectorState.rowCount !== null ? (
              <>
                {inspectorState.rowCount} Item
                {inspectorState.rowCount === 1 ? "" : "s"}
                <Button
                  kind="outline"
                  className={styles.refreshDataButton}
                  onClick={() => inspectorState._refreshData(true)}
                >
                  <SyncIcon />
                </Button>
              </>
            ) : (
              <span>loading...</span>
            )}
          </div>
        )}

        <div className={styles.headerButtons}>
          {dataviewState.edits.hasPendingEdits ? (
            <>
              <Button
                kind="primary"
                className={styles.reviewChanges}
                onClick={() =>
                  openModal(<ReviewEditsModal state={dataviewState} />, true)
                }
              >
                Review Changes
              </Button>
            </>
          ) : null}

          {!inspectorState.objectType?.readonly &&
          inspectorState.insertTypeNames.length &&
          (!inspectorState.parentObject ||
            inspectorState.parentObject.editMode) ? (
            inspectorState.insertTypeNames.length > 1 ? (
              <Select
                className={styles.insertSelect}
                title="Insert..."
                items={null}
                actions={inspectorState.insertTypeNames.map((name) => ({
                  label: name,
                  action: () =>
                    dataviewState.edits.createNewRow(name, inspectorState),
                }))}
                rightAlign
              />
            ) : (
              <Button
                kind="outline"
                onClick={() =>
                  dataviewState.edits.createNewRow(
                    inspectorState.insertTypeNames[0],
                    inspectorState
                  )
                }
              >
                Insert {inspectorState.insertTypeNames[0].split("::").pop()}
              </Button>
            )
          ) : null}

          <Button
            kind="outline"
            className={cn(styles.filterButton, {
              [styles.filterOpen]: inspectorState.filterPanelOpen,
              [styles.filterActive]: !!inspectorState.filter[0],
            })}
            leftIcon={<FilterIcon className={styles.filterIcon} />}
            rightIcon={<ChevronDownIcon className={styles.arrowIcon} />}
            onClick={() => {
              inspectorState.setFilterPanelOpen(
                !inspectorState.filterPanelOpen
              );
            }}
          >
            Filter
          </Button>
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
      <div
        className={cn(styles.dataFetchingError, {
          [styles.showError]: inspectorState.dataFetchingError !== null,
        })}
      >
        <WarningIcon />
        Failed to fetch data
      </div>
    </div>
  );
});

interface FilterPanelProps {
  state: DataInspectorState;
}

const FilterPanel = observer(function FilterPanel({state}: FilterPanelProps) {
  const [_, theme] = useTheme();

  const keybindings = useMemo(
    () => [
      {
        key: "Mod-Enter",
        run: () => {
          state.applyFilter();
          return true;
        },
        preventDefault: true,
      },
    ],
    [state]
  );

  const applyFilterOnMobile = async () => {
    await state.applyFilter();
    if (state.filter[0]) state.setFilterPanelOpen(false);
  };

  const removeFilter = () => {
    state.clearFilter();
    state.setFilterPanelOpen(false);
  };

  return (
    <div className={styles.filterPanel}>
      <p className={styles.title}>Filter</p>

      <CodeEditor
        className={styles.editor}
        code={state.filterEditStr}
        onChange={(value) => state.setFilterEditStr(value)}
        useDarkTheme={theme === Theme.dark}
        keybindings={keybindings}
        noPadding
      />

      <div className={styles.filterActions}>
        <div className={styles.filterError}>{state.errorFilter?.error}</div>

        <Button
          kind="primary"
          className={styles.clearFilterButton}
          leftIcon={<CrossIcon />}
          disabled={!state.filter[0] && !state.filterEdited}
          onClick={() => state.clearFilter()}
        >
          Clear
        </Button>

        <Button
          className={styles.disableFilterButton}
          leftIcon={<CrossIcon />}
          disabled={!state.filter[0]}
          onClick={() => state.disableFilter()}
        >
          Disable filter
        </Button>

        <Button
          kind="primary"
          className={styles.applyFilterButton}
          leftIcon={<CheckIcon />}
          disabled={!state.filterEdited}
          onClick={() => state.applyFilter()}
        >
          {state.filter[0] ? "Update filter" : "Apply filter"}
        </Button>
      </div>
      <div className={styles.filterActionsMob}>
        <p className={styles.filterErrorMobile}>{state.errorFilter?.error}</p>

        <MobButton
          className={styles.filterBtn}
          disabled={!state.filter[0] && !state.errorFilter?.error}
          onClick={removeFilter}
          label="Remove Filter"
        />
        <MobButton
          className={styles.filterBtn}
          disabled={!state.filterEdited}
          onClick={applyFilterOnMobile}
          label="Apply"
        />
        <CloseButton
          className={styles.closeFilterPanel}
          onClick={() => state.setFilterPanelOpen(false)}
        />
      </div>
    </div>
  );
});
