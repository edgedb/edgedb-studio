import {useEffect, useMemo} from "react";
import {observer} from "mobx-react-lite";

import styles from "./databaseDashboard.module.scss";

import {useInstanceState} from "../../state/instance";
import {useDatabaseState} from "../../state/database";
import {DatabaseTabSpec} from "../../components/databasePage";
import {useDBRouter} from "../../hooks/dbRoute";

import {DocsQuickstartIcon, DocsIcon} from "../../icons/docs";

import {ArrowRightIcon, Button} from "@dbsof/common/newui";
import {CustomScrollbars} from "@dbsof/common/ui/customScrollbar";
import Spinner from "@dbsof/common/ui/spinner";

import {
  HeaderDatabaseIcon,
  TabDashboardIcon,
  TabDataExplorerIcon,
  TabReplIcon,
  TabSchemaIcon,
  TabEditorIcon,
} from "../../icons";

export const DatabaseDashboard = observer(function DatabaseDashboard() {
  const dbState = useDatabaseState();
  const {navigate, currentPath} = useDBRouter();

  const navigateToTab = (tabPath: string) =>
    navigate(`${currentPath[0]}/${tabPath}`);

  useEffect(() => {
    if (dbState.schemaId != null) {
      return dbState.updateObjectCount();
    }
  }, [dbState.schemaId]);

  if (dbState.schemaId == null) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.loading}>
          <Spinner size={20} />
          Loading schema...
        </div>
      </div>
    );
  }

  if (dbState.schemaId.endsWith("__empty")) {
    return <FirstRunDashboard />;
  }

  return (
    <CustomScrollbars
      className={styles.dashboardWrapper}
      innerClass={styles.dashboardLayout}
    >
      <div className={styles.dashboard}>
        <div className={styles.dashboardLayout}>
          <div className={styles.dbName}>
            <HeaderDatabaseIcon />
            <span>{dbState.name}</span>
          </div>

          <div className={styles.buttons}>
            <Button
              kind="primary"
              className={styles.button}
              leftIcon={<TabReplIcon />}
              onClick={() => navigateToTab("repl")}
            >
              Open REPL
            </Button>

            <Button
              kind="primary"
              className={styles.button}
              leftIcon={<TabEditorIcon />}
              onClick={() => navigateToTab("editor")}
            >
              Open Editor
            </Button>

            <Button
              kind="primary"
              className={styles.button}
              leftIcon={<TabSchemaIcon />}
              onClick={() => navigateToTab("schema")}
            >
              Schema Viewer
            </Button>

            <Button
              kind="primary"
              className={styles.button}
              leftIcon={<TabDataExplorerIcon />}
              onClick={() => navigateToTab("data")}
            >
              Data Viewer
            </Button>
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statValue}>
                {dbState.objectCount ?? "-"}
              </div>
              <div className={styles.statLabel}>objects</div>
            </div>

            <div className={styles.stat}>
              <div className={styles.statValue}>
                {dbState.schemaData
                  ? [...dbState.schemaData.objects.values()].filter(
                      (o) => !o.builtin
                    ).length
                  : "-"}
              </div>
              <div className={styles.statLabel}>object types</div>
            </div>
          </div>

          <div className={styles.docButtons}>
            <a href="https://example.com/docs/quickstart">
              <DocsQuickstartIcon />
              <span>5-min Quickstart</span>
            </a>

            <a href="https://example.com/docs" target="_blank">
              <DocsIcon />
              <span>Documentation</span>
            </a>
          </div>
        </div>
      </div>
    </CustomScrollbars>
  );
});

export const dashboardTabSpec: DatabaseTabSpec = {
  path: "",
  label: "Dashboard",
  icon: (active) => <TabDashboardIcon active={active} />,
  usesSessionState: false,
  element: <DatabaseDashboard />,
};

export function fetchExampleSchema(): Promise<string> {
  return import("./exampleSchema.mjs").then(({schemaScript}) => schemaScript);
}

const FirstRunDashboard = observer(function FirstRunDashboard() {
  const instanceState = useInstanceState();
  const dbState = useDatabaseState();
  const {navigate} = useDBRouter();

  const exampleDBExists = instanceState.databaseNames?.includes("_example");
  const dbOrBranch = useMemo(() => {
    for (const func of dbState.schemaData?.functions.values() ?? []) {
      if (func.name === "sys::get_current_branch") return "branch";
    }
    return "database";
  }, [dbState.schemaData]);

  return (
    <CustomScrollbars
      className={styles.firstDashboardWrapper}
      innerClass={styles.dashboardLayout}
    >
      <div className={styles.firstDashboard}>
        <div className={styles.firstDashboardLayout}>
          <div className={styles.dbName}>
            <HeaderDatabaseIcon />
            <span>{dbState.name}</span>
          </div>
          <div className={styles.congrats}>
            Your new {dbOrBranch} is ready!
          </div>

          <div className={styles.importData}>
            <h3>First time using Studio?</h3>
            <p>
              {exampleDBExists ? "Switch to the" : "Create an"} example{" "}
              {dbOrBranch} with our "movies" schema and data set, and play with
              the web UI right away.
            </p>
            <div>
              <Button
                kind="primary"
                loading={instanceState.creatingExampleDB}
                rightIcon={exampleDBExists ? <ArrowRightIcon /> : undefined}
                onClick={
                  exampleDBExists
                    ? () => navigate("_example")
                    : async () => {
                        await instanceState.createExampleDatabase(
                          fetchExampleSchema()
                        );
                        navigate("_example");
                      }
                }
              >
                {instanceState.creatingExampleDB
                  ? `Creating example ${dbOrBranch}...`
                  : exampleDBExists
                  ? `Switch to example ${dbOrBranch}`
                  : `Create example ${dbOrBranch}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </CustomScrollbars>
  );
});
