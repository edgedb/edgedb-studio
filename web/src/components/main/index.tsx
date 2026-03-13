import {useEffect} from "react";
import {useMatch, useRoutes, Link} from "react-router-dom";
import {observer} from "mobx-react-lite";

import {HeaderTab} from "@dbsof/studio/components/headerNav";
import {HeaderInstanceIcon} from "@dbsof/studio/icons";

import {useAppState} from "../../state/providers";

import styles from "./main.module.scss";
import headerNavStyles from "@dbsof/studio/components/headerNav/headerNav.module.scss";

import {InstancePage} from "../instancePage";
import {DatabasePage} from "../databasePage";

const Main = observer(function Main() {
  const appState = useAppState();
  const match = useMatch(":databaseName/*");

  const instanceName = appState.instanceState.instanceName;

  useEffect(() => {
    document.title = instanceName
      ? `${instanceName}${
          match ? ` / ${match.params.databaseName}` : ""
        } | Studio Local`
      : "Studio Local";
  }, [instanceName, match]);

  return (
    <>
      <HeaderTab headerKey="instance">
        <Link className={headerNavStyles.headerNavButton} to={"/"}>
          <HeaderInstanceIcon />
          <div className={headerNavStyles.title}>
            {instanceName ?? (
              <span className={styles.loading}>loading...</span>
            )}
          </div>
        </Link>
      </HeaderTab>

      {useRoutes([
        {
          path: "/",
          element: <InstancePage />,
        },
        {
          path: ":databaseName/*",
          element: <DatabasePage />,
        },
      ])}
    </>
  );
});

export default Main;
