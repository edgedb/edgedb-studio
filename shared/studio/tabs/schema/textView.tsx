import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {observer} from "mobx-react-lite";
import {VariableSizeList as List, ListChildComponentProps} from "react-window";

import cn from "@dbsof/common/utils/classNames";
import {useResize} from "@dbsof/common/hooks/useResize";
import {useInitialValue} from "@dbsof/common/hooks/useInitialValue";
import {Select, CrossIcon} from "@dbsof/common/newui";

import {useTabState} from "../../state";

import styles from "./textView.module.scss";

import {SearchIcon} from "../../icons";

import {
  ModuleGroup,
  TypeFilter,
  SchemaTextView as SchemaTextState,
  moduleGroupNames,
} from "./state/textView";
import {Schema} from "./state";
import {renderers} from "./renderers";
import {ModuleHeaders} from "./renderers/module";
import {CustomScrollbars} from "@dbsof/common/ui/customScrollbar";
import {useDBRouter} from "../../hooks/dbRoute";
import {useIsMobile} from "@dbsof/common/hooks/useMobile";

const typeFilters = Object.values(TypeFilter).filter(
  (v) => typeof v === "number"
) as TypeFilter[];

const scrollOffsetCache = new Map<string, number>();

export const SchemaTextView = observer(function SchemaTextView() {
  const state = useTabState(Schema).textViewState;
  const {navigate, currentPath, searchParams, locationKey} = useDBRouter();
  const [isInputVisible, setIsInputVisible] = useState(false);

  const selectedModuleGroup = currentPath[2] ?? "";

  const isMobile = useIsMobile();

  useLayoutEffect(() => {
    if (
      selectedModuleGroup !== "" &&
      (selectedModuleGroup === "user" ||
        (!moduleGroupNames.includes(selectedModuleGroup as any) &&
          state.extModuleGroupNames &&
          !state.extModuleGroupNames.includes(selectedModuleGroup as any)))
    ) {
      navigate(currentPath.slice(0, 2).join("/"), true);
    } else {
      state.setSelectedModuleGroup(
        (selectedModuleGroup || "user") as ModuleGroup
      );
    }
  }, [selectedModuleGroup, navigate, currentPath, state.extModuleGroupNames]);

  useLayoutEffect(() => {
    const typeFilter = searchParams.get("type");
    if (typeFilter !== state.selectedTypeFilter) {
      state.setSelectedTypeFilter(
        typeFilter ? (TypeFilter[typeFilter as any] as any) : null
      );
    }
    const search = searchParams.get("search");
    if (search !== state.searchText) {
      state.setSearchText(search ?? "");
    }
  }, [searchParams]);

  useLayoutEffect(() => {
    const scrollOffset = scrollOffsetCache.get(locationKey);
    if (scrollOffset !== undefined) {
      state.listRef?.scrollTo(scrollOffset);
    }

    const focusedName = searchParams.get("focus");
    state.setHighlightedItem(focusedName ?? null);

    return () => {
      scrollOffsetCache.set(locationKey, state.scrollPos);
      state.lastLocation = {
        path: currentPath.join("/"),
        searchParams: searchParams,
        scrollPos: state.scrollPos,
      };
    };
  }, [locationKey]);

  useEffect(() => {
    const lastLocation = state.lastLocation;
    if (lastLocation && !scrollOffsetCache.has(locationKey)) {
      navigate(
        {path: lastLocation.path, searchParams: lastLocation.searchParams},
        true
      );
      state.listRef?.scrollTo(lastLocation.scrollPos);
    }
  }, []);

  const filtersRef = useRef<HTMLDivElement>(null);
  const [narrowLayout] = useState(true);

  // useResize(
  //   filtersRef,
  //   (rect) => {
  //     const narrow = rect.width < 650;
  //     if (narrowLayout !== narrow) {
  //       setNarrowLayout(narrow);
  //     }
  //   },
  //   [narrowLayout]
  // );

  return (
    <div className={styles.schemaTextView}>
      <div
        ref={filtersRef}
        className={cn(styles.filterControls, {
          [styles.searchExpanded]: isInputVisible,
        })}
      >
        <div className={styles.searchRow}>
          <div className={styles.filterSelect}>
            <div className={styles.filterSelectName}>Schema</div>
            <Select
              className={styles.moduleSelect}
              items={{
                items: moduleGroupNames.map((group) => ({
                  id: group,
                  label: <span className={styles.selectItem}>{group}</span>,
                })),
                groups: state.extModuleGroupNames?.length
                  ? [
                      {
                        label: "ext::",
                        items: state.extModuleGroupNames.map((group) => ({
                          id: group,
                          label: <span>{group.slice(5)}</span>,
                        })),
                      },
                    ]
                  : undefined,
              }}
              selectedItemId={state.selectedModuleGroup}
              onChange={({id: group}) =>
                navigate(
                  `${currentPath.slice(0, 2).join("/")}/${
                    group === "user" ? "" : group
                  }`
                )
              }
            />
          </div>

          {narrowLayout ? (
            <div className={styles.filterSelect}>
              <div className={styles.filterSelectName}>Types</div>
              <Select
                className={styles.typeFilterSelect}
                items={[
                  {
                    id: -1,
                    label: "Everything",
                  },
                  ...typeFilters.map((typeFilter) => ({
                    id: typeFilter,
                    label: TypeFilter[typeFilter],
                  })),
                ]}
                selectedItemId={state.selectedTypeFilter ?? -1}
                onChange={({id: typeFilter}) => {
                  const params = new URLSearchParams(searchParams);
                  if (typeFilter === -1) {
                    params.delete("type");
                  } else {
                    params.set("type", TypeFilter[typeFilter]);
                  }
                  navigate({searchParams: params});
                }}
              />
            </div>
          ) : null}
          <div
            className={cn(styles.search, {
              [styles.expanded]:
                isMobile && (isInputVisible || searchParams.has("search")),
            })}
          >
            <SearchIcon />
            <input
              onFocus={() => setIsInputVisible(true)}
              className={cn({[styles.show]: isInputVisible})}
              placeholder={!isMobile ? "search..." : ""}
              value={state.searchText}
              onChange={(e) => {
                const searchVal = e.target.value;
                state.setSearchText(searchVal);
                const params = new URLSearchParams(searchParams);
                if (searchVal) {
                  params.set("search", searchVal);
                } else {
                  params.delete("search");
                }
                navigate(
                  {searchParams: params},
                  !!searchParams.get("search") && !!searchVal
                );
              }}
            />
            {(isMobile && isInputVisible) || searchParams.has("search") ? (
              <div
                className={styles.clearSearch}
                onClick={() => {
                  state.setSearchText("");
                  const params = new URLSearchParams(searchParams);
                  params.delete("search");
                  navigate({searchParams: params});
                  if (isMobile) setIsInputVisible(false);
                }}
              >
                <CrossIcon />
              </div>
            ) : null}
          </div>
        </div>
        {!narrowLayout ? (
          <div className={styles.typeFilters}>
            <div
              className={cn(styles.typeFilter, {
                [styles.active]: state.selectedTypeFilter === null,
              })}
              onClick={() => state.setSelectedTypeFilter(null)}
            >
              All
            </div>
            <div className={styles.separator} />
            {typeFilters.map((typeFilter) => (
              <div
                key={typeFilter}
                className={cn(styles.typeFilter, {
                  [styles.empty]: state.filteredItems[typeFilter].length === 0,
                  [styles.active]: state.selectedTypeFilter === typeFilter,
                })}
                onClick={() => state.setSelectedTypeFilter(typeFilter)}
              >
                {TypeFilter[typeFilter]} ·{" "}
                {state.filteredItems[typeFilter].length}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <SchemaTypesList />
    </div>
  );
});

const SchemaTextStateContext = createContext<SchemaTextState>(null!);

export function useSchemaTextState() {
  return useContext(SchemaTextStateContext);
}

const ListItemRenderer = observer(function ListItemRenderer({
  index,
  style,
}: ListChildComponentProps) {
  const state = useSchemaTextState();

  const resizeRef = useRef<HTMLDivElement>(null);

  const listItem = state.renderListItems.itemsList[index];

  useResize(
    resizeRef,
    ({height}) => {
      if (listItem && height && listItem.item.schemaType !== "Module") {
        state.setRenderHeight(index, listItem.item, height);
      }
    },
    [listItem, index]
  );

  if (!listItem) return null;

  const {item, matches} = listItem;

  const TypeRenderer = renderers[item.schemaType] as any;

  return (
    <div style={{position: "relative", height: "0px", top: style.top}}>
      <div
        className={cn(styles.listItem, {
          [styles.highlightedItem]:
            state.highlightedItem === (item as any).name,
        })}
        style={
          !state.searchText && item.schemaType !== "Extension"
            ? {paddingLeft: (item.module.split("::").length - 1) * 17 + "px"}
            : undefined
        }
        ref={resizeRef}
      >
        <TypeRenderer type={item} matches={matches} />
      </div>
    </div>
  );
});

const innerElementType = forwardRef<HTMLDivElement>(
  ({children, ...props}: any, ref) => (
    <div
      ref={ref}
      {...props}
      className={styles.listInner}
      style={{...props.style, width: undefined}}
    >
      {children}
      <ModuleHeaders _rerender={props.style.height} />
    </div>
  )
);

const SchemaTypesList = observer(function SchemaTypesList() {
  const state = useTabState(Schema).textViewState;

  const listItems = state.renderListItems.itemsList;

  const [containerHeight, setContainerHeight] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useResize(containerRef, ({height}) => setContainerHeight(height));

  const initialScrollOffset = useInitialValue(() => state.scrollPos);

  const listRef = useRef<List>(null);

  useEffect(() => {
    state.listRef = listRef.current;
  }, [listRef]);

  useLayoutEffect(() => {
    listRef.current?.resetAfterIndex(0);
  }, [listItems]);

  return (
    <SchemaTextStateContext.Provider value={state}>
      <div
        ref={containerRef}
        className={cn(styles.typesList, {
          [styles.searchMode]: state.searchText !== "",
        })}
      >
        <CustomScrollbars innerClass={styles.listInner}>
          <List
            ref={listRef}
            className={styles.listScrollContainer}
            innerElementType={innerElementType}
            width={"100%"}
            height={containerHeight}
            initialScrollOffset={initialScrollOffset}
            onScroll={({scrollOffset}) => (state.scrollPos = scrollOffset)}
            itemCount={listItems.length}
            itemKey={(index) => {
              const item = listItems[index].item;
              return item.schemaType === "Module"
                ? `${item.module}-${item.isEnd}`
                : item.id;
            }}
            itemSize={(index) => {
              return state.getRenderHeight(index);
            }}
          >
            {ListItemRenderer}
          </List>
        </CustomScrollbars>
      </div>
    </SchemaTextStateContext.Provider>
  );
});
