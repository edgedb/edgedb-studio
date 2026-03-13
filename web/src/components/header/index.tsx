import {observer} from "mobx-react-lite";

import {HeaderTabs} from "@dbsof/studio/components/headerNav";

import {ThemeSwitcher} from "@dbsof/common/ui/themeSwitcher";
import {UserMenu} from "@dbsof/common/newui/userMenu";
import {UserIcon} from "@dbsof/common/newui";
import cn from "@dbsof/common/utils/classNames";

import {LogoLocal} from "@dbsof/common/ui/icons/logo";

import appState from "../../state/store";
import {clearAuthToken} from "../../state/models/app";

import styles from "./header.module.scss";

export const Logo = ({className}: {className?: string}) => {
  return <LogoLocal className={cn(className, styles.logo)} />;
};

export const Header = observer(function Header() {
  const username = appState.instanceState._authProvider.getAuthUser?.();

  return (
    <div className={styles.header}>
      <Logo />
      <HeaderTabs keys={["instance", "database"]} />

      <div className={styles.controls}>
        <ThemeSwitcher className={styles.themeSwitcher} />
        <UserMenu
          className={styles.userMenu}
          avatar={
            username ? (
              <div className={styles.userInitial}>
                {username.slice(0, 2).toUpperCase()}
              </div>
            ) : (
              <UserIcon className={styles.userIcon} />
            )
          }
          name={username ?? "admin"}
          signout={{action: () => clearAuthToken()}}
        />
      </div>
    </div>
  );
});
