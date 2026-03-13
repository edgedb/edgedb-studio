import {useEffect} from "react";
import {observer} from "mobx-react-lite";

import styles from "./authAdmin.module.scss";

import {useTabState} from "../../state";

import {AuthAdminState, _providersInfo} from "./state";

import {CustomScrollbars} from "@dbsof/common/ui/customScrollbar";
import {WebhooksTab} from "./webhooks";

import {PanelTabs} from "@dbsof/common/newui/panelTabs";
import {ConfigTab} from "./config";
import {SMTPConfigTab} from "./smtp";
import {ProvidersTab} from "./providers";

export const AuthAdmin = observer(function AuthAdmin() {
  const state = useTabState(AuthAdminState);

  useEffect(() => {
    state.refreshConfig();
  }, []);

  return (
    <CustomScrollbars
      className={styles.scrollWrapper}
      innerClass={styles.scrollContent}
    >
      <div className={styles.scrollContent}>
        <PanelTabs
          className={styles.tabs}
          tabs={[
            {id: "config", label: "Config"},
            ...(state.hasWebhooksSchema
              ? [{id: "webhooks", label: "Webhooks"} as const]
              : []),
            {id: "providers", label: "Providers / UI"},
            {id: "smtp", label: "SMTP"},
          ]}
          selectedTabId={state.selectedTab}
          setSelectedTabId={(id) => state.setSelectedTab(id)}
        />

        {state.selectedTab === "config" ? (
          <ConfigTab />
        ) : state.selectedTab === "providers" ? (
          <ProvidersTab />
        ) : state.selectedTab === "webhooks" ? (
          <WebhooksTab />
        ) : (
          <SMTPConfigTab />
        )}
      </div>
    </CustomScrollbars>
  );
});

export default AuthAdmin;
