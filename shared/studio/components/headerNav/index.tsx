import {
  createContext,
  Fragment,
  PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from "react";
import {ObservableMap} from "mobx";
import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";

import {SessionStateControls} from "../sessionState";

import styles from "./headerNav.module.scss";

export const HeaderNavContext = createContext<
  ObservableMap<string, JSX.Element>
>(null!);

export function HeaderNavProvider({children}: PropsWithChildren<{}>) {
  const [headerTabs] = useState(
    () => new ObservableMap<string, JSX.Element>()
  );

  return (
    <HeaderNavContext.Provider value={headerTabs}>
      {children}
    </HeaderNavContext.Provider>
  );
}

export function HeaderTab({
  headerKey,
  children,
}: PropsWithChildren<{headerKey: string}>) {
  const headerTabs = useContext(HeaderNavContext);

  useEffect(() => {
    headerTabs.set(headerKey, <>{children}</>);

    return () => {
      headerTabs.delete(headerKey);
    };
  }, [headerKey, children]);

  return null;
}

interface HeaderTabsProps {
  keys: string[];
  className?: string;
}

export const HeaderTabs = observer(function HeaderTabs({
  keys,
  className,
}: HeaderTabsProps) {
  const headerTabs = useContext(HeaderNavContext);

  const tabs: JSX.Element[] = [];
  for (const key of keys) {
    const el = headerTabs.get(key);
    if (el) {
      if (tabs.length) {
        tabs.push(<TabSep key={tabs.length} />);
      }
      tabs.push(<Fragment key={key}>{el}</Fragment>);
    } else {
      break;
    }
  }

  return (
    <div className={cn(styles.tabs, className)}>
      {tabs}
      <SessionStateControls />
    </div>
  );
});

export function TabSep() {
  return (
    <svg
      width="8"
      height="17"
      viewBox="0 0 8 17"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={styles.tabSep}
    >
      <path
        d="M7.66602 0.78125L1.73828 16.2207H0.185547L6.12305 0.78125H7.66602Z"
        fill="currentColor"
      />
    </svg>
  );
}
