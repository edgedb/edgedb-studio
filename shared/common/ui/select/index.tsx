import {useRef, useState, useEffect, useMemo} from "react";

import Fuzzysort from "fuzzysort";

import {highlightString} from "@dbsof/common/utils/fuzzysortHighlight";
import cn from "@dbsof/common/utils/classNames";

import styles from "./select.module.scss";
import {useIsMobile} from "../../hooks/useMobile";
import {useKeyboardShortcut} from "../../hooks/useKeyboardShortcut";
import {CrossIcon, DropdownIcon, SearchIcon, CheckIcon} from "../icons";

export interface SelectItem<T = any> {
  id: T;
  label: string | JSX.Element;
  fullLabel?: string;
  disabled?: boolean;
}

export type SelectItems<T = any> = {
  items: SelectItem<T>[];
  groups?: ({
    label: string | JSX.Element;
  } & SelectItems<T>)[];
};

export type SelectProps<T = any> = {
  className?: string;
  dropdownClassName?: string;
  fullScreen?: boolean;
  fullScreenTitle?: string;
  title?: string | JSX.Element;
  rightAlign?: boolean;
  actions?: {label: string | JSX.Element; action: () => void}[];
  searchable?: boolean;
  disabled?: boolean;
  shortcutKey?: string | null;
} & (
  | {
      placeholder?: undefined;
      items: null;
      selectedItemId?: undefined;
      onChange?: undefined;
    }
  | ((
      | {placeholder?: undefined; selectedItemId: T}
      | {placeholder: string; selectedItemId: T | null}
    ) & {
      items: SelectItems<T> | SelectItem<T>[];
      onChange: (item: SelectItem<T>) => void;
    })
);

type FlattenedItem = {type: "item"; item: SelectItem; depth: number};
type FlattenedItems = (
  | FlattenedItem
  | {
      type: "group";
      label: string | JSX.Element;
      depth: number;
    }
)[];

export function Select<T extends any>({
  className,
  dropdownClassName,
  fullScreen,
  fullScreenTitle,
  title,
  rightAlign,
  actions,
  searchable,
  disabled,
  placeholder,
  items,
  selectedItemId,
  onChange,
  shortcutKey = null,
  ...props
}: SelectProps<T>) {
  const selectRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);

  const [searchFilter, setSearchFilter] = useState("");
  const [highlightedItem, setHighlightedItem] = useState<
    SelectItem | undefined
  >();

  const hasDropdown = !!items || !!actions;

  const isMobile = useIsMobile();
  const isFullscreenMobile = useIsMobile() && !!fullScreen;

  const flattenedItems = useMemo(() => {
    if (!items) {
      return null;
    }
    if (Array.isArray(items)) {
      return items.map((item) => ({
        type: "item",
        item,
        depth: 0,
      })) as FlattenedItems;
    }
    const list: FlattenedItems = items.items.map((item) => ({
      type: "item",
      item,
      depth: 0,
    }));
    const flatten = (groups: SelectItems["groups"], depth: number) => {
      for (const group of groups ?? []) {
        list.push({type: "group", label: group.label, depth});
        list.push(
          ...(group.items.map((item) => ({
            type: "item",
            item,
            depth: depth + 1,
          })) as FlattenedItems)
        );
        flatten(group.groups, depth + 1);
      }
    };
    flatten(items.groups, 0);
    return list;
  }, [items]);

  const searchIndex = useMemo(() => {
    return searchable && flattenedItems
      ? (
          flattenedItems.filter(
            (item) => item.type === "item"
          ) as FlattenedItem[]
        ).map((item) => ({
          item,
          indexed: Fuzzysort.prepare(
            item.item.fullLabel ??
              (typeof item.item.label === "string" ? item.item.label : "")
          ),
        }))
      : null;
  }, [flattenedItems]);

  const filteredItems = useMemo(() => {
    return searchIndex && searchFilter
      ? Fuzzysort.go(searchFilter, searchIndex, {key: "indexed"})
      : null;
  }, [searchFilter, searchIndex]);

  const selectedItemIndex = items
    ? flattenedItems!.findIndex(
        (item) => item.type === "item" && item.item.id === selectedItemId
      )
    : null;
  const selectedItem =
    selectedItemIndex != null && selectedItemIndex != -1
      ? ((flattenedItems?.[selectedItemIndex] as any)?.item as SelectItem)
      : null;

  useEffect(() => {
    if (dropdownOpen) {
      setSearchFilter("");

      searchRef.current?.focus();

      const listener = (e: MouseEvent) => {
        if (!dropdownRef.current?.contains(e.target as Node)) {
          setDropdownOpen(false);
        }
      };
      window.addEventListener("click", listener, {capture: true});

      setMaxHeight(
        window.innerHeight -
          selectRef.current!.getBoundingClientRect().top -
          32
      );

      return () => {
        window.removeEventListener("click", listener, {capture: true});
      };
    }
  }, [dropdownOpen]);

  useKeyboardShortcut(shortcutKey, () => setDropdownOpen((prev) => !prev));

  function navigateFilter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      return setDropdownOpen(false);
    } else if (e.key === "Enter" && highlightedItem) {
      setDropdownOpen(false);
      return onChange?.(highlightedItem);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const applicableList: SelectItem[] = filteredItems
        ? filteredItems.map((item) => item.obj.item.item)
        : (flattenedItems || [])
            .filter((item) => item.type === "item")
            .map((item) => item.item);

      setHighlightedItem((prev) => {
        const prevSelectedItemIndex = applicableList.findIndex(
          (item) => item.id === prev?.id
        );
        return applicableList.at(
          (prevSelectedItemIndex + (e.key === "ArrowDown" ? 1 : -1)) %
            applicableList.length
        );
      });
    }
  }

  const defaultItemPaddingLeft = isMobile ? 24 : 12;

  return (
    <div
      ref={selectRef}
      className={cn(styles.select, className)}
      onClick={!disabled ? () => setDropdownOpen(true) : undefined}
      data-disabled={disabled}
      {...props}
    >
      {title ?? selectedItem?.fullLabel ?? selectedItem?.label ?? (
        <span className={styles.placeholder}>{placeholder}</span>
      )}
      {hasDropdown ? (
        <>
          <div className={styles.tabDropdownButton}>
            <DropdownIcon />
          </div>

          <div
            ref={dropdownRef}
            className={cn(styles.tabDropdown, dropdownClassName, {
              [styles.tabDropdownOpen]: dropdownOpen,
              [styles.rightAlign]: !!rightAlign,
              [styles.fullScreen]: isFullscreenMobile,
            })}
            style={isMobile ? {} : {maxHeight}}
            onClick={(e) => e.stopPropagation()}
          >
            {isFullscreenMobile && (
              <>
                <p className={styles.dropdownTitle}>{fullScreenTitle}</p>
                <button
                  className={styles.closeDropdown}
                  onClick={() => setDropdownOpen(false)}
                >
                  <CrossIcon />
                </button>
              </>
            )}
            {!!searchable &&
              (isFullscreenMobile ? (
                <div className={styles.searchFullScreen}>
                  <SearchIcon />
                  <input
                    ref={searchRef}
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                  />
                </div>
              ) : (
                <span className={styles.searchInputWrapper}>
                  <input
                    ref={searchRef}
                    className={styles.searchInput}
                    placeholder="Search..."
                    value={searchFilter}
                    onKeyDown={(e) => navigateFilter(e)}
                    onChange={(e) => setSearchFilter(e.target.value)}
                  />
                  <kbd className={styles.keyboardDiscovery}>
                    <span className={styles.modifier}>⌘</span>P
                  </kbd>
                </span>
              ))}
            {items
              ? filteredItems
                ? filteredItems.map((result) => (
                    <div
                      key={result.target}
                      className={cn(styles.dropdownItem, {
                        [styles.dropdownItemHighlighted]:
                          result.obj.item.item.id == highlightedItem?.id,
                        [styles.dropdownItemSelected]:
                          selectedItemId === result.obj.item.item.id,
                        [styles.disabled]: !!result.obj.item.item.disabled,
                        [styles.fullScreen]: isFullscreenMobile,
                      })}
                      onMouseEnter={() =>
                        setHighlightedItem(result.obj.item.item)
                      }
                      onClick={() => {
                        setDropdownOpen(false);
                        onChange(result.obj.item.item);
                      }}
                    >
                      {highlightString(
                        result.target,
                        Fuzzysort.indexes(result) as number[],
                        styles.searchHighlight
                      )}
                    </div>
                  ))
                : flattenedItems!.map((item, i) => (
                    <div
                      key={i}
                      className={cn(
                        styles.dropdownItem,
                        item.type === "item"
                          ? {
                              [styles.dropdownItemHighlighted]:
                                item.item.id == highlightedItem?.id,
                              [styles.dropdownItemSelected]:
                                selectedItemId === item.item.id,
                              [styles.disabled]: !!item.item.disabled,
                              [styles.fullScreen]: isFullscreenMobile,
                            }
                          : styles.groupHeader
                      )}
                      style={{
                        paddingLeft: `${
                          defaultItemPaddingLeft + 10 * item.depth
                        }px`,
                      }}
                      onMouseEnter={() =>
                        item.type == "item" && setHighlightedItem(item.item)
                      }
                      onClick={
                        item.type === "item"
                          ? () => {
                              setDropdownOpen(false);
                              onChange(item.item);
                            }
                          : undefined
                      }
                    >
                      {item.type === "item" ? (
                        <div className={styles.itemContent}>
                          <span>{item.item.label}</span>
                          {selectedItemId === item.item.id && <CheckIcon />}
                        </div>
                      ) : (
                        item.label
                      )}
                    </div>
                  ))
              : null}
            <div className={styles.dropdownActionsGroup}>
              {actions?.map((item, i) => (
                <div
                  key={i}
                  className={styles.dropdownItem}
                  onClick={() => {
                    setDropdownOpen(false);
                    item.action();
                  }}
                >
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
