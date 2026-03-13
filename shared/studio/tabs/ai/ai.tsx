import {useEffect, useLayoutEffect} from "react";
import {Observer, observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";

import {useTabState} from "../../state";
import {useDBRouter} from "../../hooks/dbRoute";

import {AIAdminState} from "./state";
import {ProvidersTab} from "./providers";
import {PlaygroundTab} from "./playground";
import {PromptsTab} from "./prompts";

import styles from "./aiAdmin.module.scss";
import {WarningIcon} from "@dbsof/common/newui";

const aiAdminTabs = [
  {
    path: "",
    label: "Playground",
    element: <PlaygroundTab />,
  },
  {
    path: "prompts",
    label: "Prompts",
    element: <PromptsTab />,
  },
  {
    path: "providers",
    label: "Providers",
    element: <ProvidersTab />,
    warning: (
      <Observer
        render={() => {
          const state = useTabState(AIAdminState);
          return state.indexesWithoutProviders?.length ? (
            <WarningIcon />
          ) : null;
        }}
      />
    ),
  },
];

const AIAdminPage = observer(function AIAdminPage() {
  const state = useTabState(AIAdminState);

  useEffect(() => {
    state.refreshConfig();
  }, []);

  const {navigate, currentPath} = useDBRouter();

  const activePath = currentPath.slice(2).join("/");

  useEffect(() => {
    state.setLastSelectedTab(currentPath.slice(2).join("/"));
  }, [currentPath]);

  useLayoutEffect(() => {
    if (currentPath.length == 2 && state.lastSelectedTab) {
      navigate(`${currentPath.join("/")}/${state.lastSelectedTab}`, true);
    }
  }, []);

  return (
    <div className={styles.mainLayout}>
      <div className={styles.tabs}>
        {aiAdminTabs.map((tab) => (
          <div
            key={tab.path}
            className={cn(styles.tab, {
              [styles.active]: activePath === tab.path,
            })}
            onClick={() => {
              navigate(
                [...currentPath.slice(0, 2), tab.path]
                  .join("/")
                  .replace(/\/$/, "")
              );
            }}
          >
            {tab.label}
            {tab.warning}
          </div>
        ))}
      </div>

      <div className={styles.tabContent}>
        {aiAdminTabs.find((tab) => tab.path === activePath)?.element}
      </div>
    </div>
  );
});

export default AIAdminPage;
