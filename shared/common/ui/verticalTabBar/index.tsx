"use client";

import {useEffect, useReducer, useRef, useState} from "react";

import cn from "@dbsof/common/utils/classNames";

import styles from "./verticalTabBar.module.scss";
import {ChevronIcon} from "../icons";

import {Tab as BaseTab, BaseTabBarProps} from "../navtabs/interfaces";
import {useTooltips} from "../../hooks/useTooltips";

export interface Tab<Id extends string> extends BaseTab<Id> {
  loading?: boolean;
}

export interface VerticalTabBarProps<TabId extends string>
  extends BaseTabBarProps<TabId> {
  className?: string;
  tabs: Tab<TabId>[];
  onTabChange: (tab: Tab<TabId>) => void;
  noExpand?: boolean;
}

export function VerticalTabBar<TabId extends string>({
  className,
  tabs,
  currentTabId,
  Link,
  onTabChange,
  noExpand,
}: VerticalTabBarProps<TabId>) {
  const [globalShowTooltips] = useTooltips();

  const [expanded, setExpanded] = useReducer(
    (_: any, val: boolean) => {
      localStorage.setItem("nebula_ui_tabbar_expanded", JSON.stringify(val));
      return val;
    },
    false,
    () => {
      if (noExpand) return false;
      try {
        return (
          JSON.parse(
            localStorage.getItem("nebula_ui_tabbar_expanded") ?? ""
          ) === true
        );
      } catch {
        return false;
      }
    }
  );
  const [showTabTooltips, setShowTabTooltips] = useState(false);
  const tabMouseEnterTimeout = useRef<number | null>(null);
  const tabMouseLeaveTimeout = useRef<number | null>(null);

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "m" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const currentIndex = tabs.findIndex((tab) => tab.id === currentTabId);
        if (currentIndex !== -1) {
          onTabChange(
            tabs[
              (tabs.length + currentIndex + (e.shiftKey ? -1 : 1)) %
                tabs.length
            ]
          );
        }
      }
    };

    window.addEventListener("keydown", listener);

    return () => {
      window.removeEventListener("keydown", listener);
    };
  }, [currentTabId]);

  return (
    <div
      className={cn(styles.tabs, className, {
        [styles.expanded]: expanded,
        [styles.showTooltips]:
          !expanded && showTabTooltips && globalShowTooltips,
      })}
    >
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          className={cn(styles.tab, {
            [styles.tabSelected]: tab.id === currentTabId,
          })}
          to={tab.id}
          onMouseEnter={() => {
            if (tabMouseLeaveTimeout.current) {
              clearTimeout(tabMouseLeaveTimeout.current);
              tabMouseLeaveTimeout.current = null;
            }
            if (!tabMouseEnterTimeout.current) {
              tabMouseEnterTimeout.current = setTimeout(() => {
                setShowTabTooltips(true);
              }, 500) as unknown as number;
            }
          }}
          onMouseLeave={() => {
            if (!tabMouseLeaveTimeout.current) {
              tabMouseLeaveTimeout.current = setTimeout(() => {
                if (tabMouseEnterTimeout.current) {
                  clearTimeout(tabMouseEnterTimeout.current);
                  tabMouseEnterTimeout.current = null;
                }
                setShowTabTooltips(false);
              }, 200) as unknown as number;
            }
          }}
        >
          <div className={styles.tabInner}>
            <div className={styles.icon}>
              {tab.icon(tab.id === currentTabId)}
            </div>
            <div className={styles.tabLabel}>{tab.label}</div>
          </div>
          <div className={styles.tabTooltip}>{tab.label}</div>
          {tab.loading != null ? (
            <div
              className={cn(styles.loadingDot, {
                [styles.active]: tab.loading,
              })}
            />
          ) : null}
        </Link>
      ))}
      <div className={styles.actions}>
        {!noExpand ? (
          <div
            className={styles.action}
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronIcon className={styles.expandIcon} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
