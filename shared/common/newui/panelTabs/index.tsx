import cn from "@dbsof/common/utils/classNames";

import styles from "./panelTabs.module.scss";

export interface PanelTabsProps<TabId extends string> {
  className?: string;
  tabs: {id: TabId; label: string | JSX.Element}[];
  selectedTabId: TabId;
  setSelectedTabId: (id: TabId) => void;
}

export function PanelTabs<TabId extends string = string>({
  className,
  tabs,
  selectedTabId,
  setSelectedTabId,
}: PanelTabsProps<TabId>) {
  return (
    <div className={cn(styles.panelTabs, className)}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(styles.tab, {
            [styles.active]: selectedTabId === tab.id,
          })}
          onClick={() => setSelectedTabId(tab.id)}
        >
          {tab.label}
        </div>
      ))}
    </div>
  );
}
