import {useEffect, useRef, useState} from "react";
import {action, computed, makeObservable, observable} from "mobx";
import {observer} from "mobx-react-lite";
import * as z from "zod";

import cn from "@dbsof/common/utils/classNames";
import {
  getLocalStorageCacheItem,
  storeLocalStorageCacheItem,
} from "@dbsof/common/utils/localStorageCache";

import {
  Checkbox,
  PinIcon,
  TiltedPinIcon,
  DragHandleIcon,
  MigrationsListIcon,
  ChevronDownIcon,
} from "@dbsof/common/newui";

import {
  DataInspector,
  FieldConfig,
  ObjectField,
  ObjectFieldType,
} from "./state";

import styles from "./fieldConfig.module.scss";
import {useGlobalDragCursor} from "@dbsof/common/hooks/globalDragCursor";

const FieldItemHeight = 40;

export function FieldConfigButton({state}: {state: DataInspector}) {
  const [popupOpen, setPopupOpen] = useState(false);

  if (!state.fieldConfig || !state.allFields) {
    return null;
  }

  return (
    <div className={styles.fieldConfigWrapper}>
      <div
        className={styles.fieldConfigButton}
        onClick={() => setPopupOpen(true)}
      >
        <MigrationsListIcon />
      </div>

      {popupOpen ? (
        <FieldConfigPopup state={state} onClose={() => setPopupOpen(false)} />
      ) : null}
    </div>
  );
}

class DraftFieldConfig {
  @observable
  order: string[];

  @observable
  selected: Set<string>;

  @observable
  pinned: Set<string>;

  constructor(
    config: FieldConfig,
    public fields: Map<string, ObjectField>
  ) {
    makeObservable(this);

    this.order = [...config.order];
    this.selected = new Set(config.selected);
    this.pinned = new Set(config.pinned);
  }

  @computed
  get pinnedOrder() {
    return this.order.filter((id) => this.pinned.has(id));
  }

  @computed
  get unpinnedOrder() {
    return this.order.filter((id) => !this.pinned.has(id));
  }

  @action
  toggleSelected(id: string) {
    if (this.selected.has(id)) {
      this.selected.delete(id);
    } else {
      this.selected.add(id);
    }
  }

  @action
  togglePinned(id: string) {
    if (this.pinned.has(id)) {
      this.pinned.delete(id);
    } else {
      this.pinned.add(id);
    }
  }

  @observable
  draggingItem: {id: string; top: number; pinned: boolean} | null = null;

  @action
  updateItemDrag(id: string, top: number) {
    const pinned = this.pinned.has(id);
    const list = pinned ? this.pinnedOrder : this.unpinnedOrder;
    top = Math.min(Math.max(0, top), (list.length - 1) * FieldItemHeight);
    const newIndex = Math.floor(top / FieldItemHeight + 0.5);
    if (newIndex !== list.indexOf(id)) {
      const replaceIndex = this.order.indexOf(list[newIndex]);
      this.order.splice(this.order.indexOf(id), 1);
      this.order.splice(replaceIndex, 0, id);
    }
    this.draggingItem = {
      id,
      top,
      pinned,
    };
  }

  @action
  endItemDrag() {
    this.draggingItem = null;
  }

  getConfig(): FieldConfig {
    return {
      order: [...this.order],
      selected: new Set(this.selected),
      pinned: new Set(this.pinned),
    };
  }

  @computed
  get fieldTypes() {
    return {
      all: this.order,
      props: this.order.filter((id) => {
        const field = this.fields.get(id)!;
        return (
          field.type === ObjectFieldType.property && field.computedExpr == null
        );
      }),
      links: this.order.filter((id) => {
        const field = this.fields.get(id)!;
        return (
          field.type === ObjectFieldType.link && field.computedExpr == null
        );
      }),
      computeds: this.order.filter(
        (id) => this.fields.get(id)!.computedExpr != null
      ),
      subtypes: this.order.filter(
        (id) => this.fields.get(id)!.subtypeName != null
      ),
    };
  }

  @computed
  get fieldsSelected() {
    const fieldTypes = this.fieldTypes;
    return {
      all: this.selected.size,
      props: fieldTypes.props.filter((id) => this.selected.has(id)).length,
      links: fieldTypes.links.filter((id) => this.selected.has(id)).length,
      computeds: fieldTypes.computeds.filter((id) => this.selected.has(id))
        .length,
      subtypes: fieldTypes.subtypes.filter((id) => this.selected.has(id))
        .length,
    };
  }

  @action
  addToSelected(ids: string[]) {
    for (const id of ids) {
      this.selected.add(id);
    }
  }

  @action
  removeFromSelected(ids: string[]) {
    for (const id of ids) {
      this.selected.delete(id);
    }
    if (this.selected.size === 0) {
      this.selected.add(
        [...this.fields.values()].find((f) => f.name === "id")!.id
      );
    }
  }
}

// convert + clean up old cached field configs
(function () {
  const data = Object.entries(localStorage)
    .map(([rawKey, val]) => {
      if (rawKey.startsWith("DataTableFieldConfig-")) {
        const key = rawKey.slice(21);
        try {
          localStorage.removeItem(rawKey);
          return [key, JSON.parse(val)];
        } catch {
          return null;
        }
      }
      return null;
    })
    .filter((entry) => entry != null);
  if (data.length) {
    localStorage.setItem("Cache-datatable-field-config", JSON.stringify(data));
  }
})();

const FieldConfigCacheName = "datatable-field-config";
const CachedFieldConfigType = z.object({
  order: z.array(z.string()),
  selected: z.array(z.number()),
  pinned: z.array(z.number()),
});

export function serialiseFieldConfig(key: string, config: FieldConfig) {
  storeLocalStorageCacheItem(
    FieldConfigCacheName,
    key,
    {
      order: config.order,
      selected: [...config.selected].map((id) => config.order.indexOf(id)),
      pinned: [...config.pinned].map((id) => config.order.indexOf(id)),
    },
    500_000
  );
}

export function deserialiseFieldConfig(key: string): FieldConfig | null {
  const configJSON = getLocalStorageCacheItem(
    FieldConfigCacheName,
    key,
    CachedFieldConfigType
  );

  if (
    !configJSON ||
    !configJSON.selected.every((i) => configJSON.order[i] != null) ||
    !configJSON.pinned.every((i) => configJSON.order[i] != null)
  ) {
    return null;
  }

  return {
    order: configJSON.order,
    selected: new Set(
      configJSON.selected.map((i: number) => configJSON.order[i])
    ),
    pinned: new Set(configJSON.pinned.map((i: number) => configJSON.order[i])),
  };
}

const FieldConfigPopup = observer(function FieldConfigPopup({
  state,
  onClose: _onClose,
}: {
  state: DataInspector;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [draftState] = useState(
    () => new DraftFieldConfig(state.fieldConfig!, state.allFields!)
  );
  const [maxHeight, setMaxHeight] = useState("100vh");

  useEffect(() => {
    const listener = () => {
      const rect = ref.current!.getBoundingClientRect();
      setMaxHeight(
        `${window.document.documentElement.clientHeight - rect.top - 24}px`
      );
    };
    listener();
    window.addEventListener("resize", listener);

    return () => {
      window.removeEventListener("resize", listener);
    };
  }, []);

  const onClose = () => {
    state.setFieldConfig(draftState.getConfig());
    _onClose();
  };

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div ref={ref} className={styles.fieldConfigPopup} style={{maxHeight}}>
        <div className={styles.selectionControls}>
          <SelectionButton
            label="Select..."
            getItems={() => {
              const types = draftState.fieldTypes;
              const selected = draftState.fieldsSelected;
              return [
                {
                  label: "All",
                  disabled: selected.all === types.all.length,
                  action: () => draftState.addToSelected(types.all),
                },
                {
                  label: "Properties",
                  disabled:
                    selected.props === types.props.length ||
                    !types.props.length,
                  action: () => draftState.addToSelected(types.props),
                },
                {
                  label: "Links",
                  disabled:
                    selected.links === types.links.length ||
                    !types.links.length,
                  action: () => draftState.addToSelected(types.links),
                },
                {
                  label: "Computeds",
                  disabled:
                    selected.computeds === types.computeds.length ||
                    !types.computeds.length,
                  action: () => draftState.addToSelected(types.computeds),
                },
                {
                  label: "Subtype fields",
                  disabled:
                    selected.subtypes === types.subtypes.length ||
                    !types.subtypes.length,
                  action: () => draftState.addToSelected(types.subtypes),
                },
              ];
            }}
          />
          <span>/</span>
          <SelectionButton
            label="Deselect..."
            getItems={() => {
              const types = draftState.fieldTypes;
              const selected = draftState.fieldsSelected;
              return [
                {
                  label: "All",
                  disabled: selected.all <= 1,
                  action: () => draftState.removeFromSelected(types.all),
                },
                {
                  label: "Properties",
                  disabled: selected.all <= 1 || !selected.props,
                  action: () => draftState.removeFromSelected(types.props),
                },
                {
                  label: "Links",
                  disabled: selected.all <= 1 || !selected.links,
                  action: () => draftState.removeFromSelected(types.links),
                },
                {
                  label: "Computeds",
                  disabled: selected.all <= 1 || !selected.computeds,
                  action: () => draftState.removeFromSelected(types.computeds),
                },
                {
                  label: "Subtype fields",
                  disabled: selected.all <= 1 || !selected.subtypes,
                  action: () => draftState.removeFromSelected(types.subtypes),
                },
              ];
            }}
          />
        </div>
        <div className={styles.listWrapper}>
          {draftState.pinned.size ? (
            <div
              key={`pinned-${draftState.pinnedOrder.length}`}
              className={cn(styles.fieldList, styles.pinnedList)}
              style={{height: draftState.pinnedOrder.length * FieldItemHeight}}
            >
              {draftState.pinnedOrder
                .filter((id) => draftState.draggingItem?.id !== id)
                .map((id) => (
                  <FieldItem
                    key={`pinned.${id}`}
                    id={id}
                    draftState={draftState}
                  />
                ))}
              {draftState.draggingItem?.pinned === true ? (
                <FieldItem
                  key={draftState.draggingItem.id}
                  id={draftState.draggingItem.id}
                  draftState={draftState}
                />
              ) : null}
            </div>
          ) : null}
          <div
            key={`unpinned-${draftState.unpinnedOrder.length}`}
            className={styles.fieldList}
            style={{height: draftState.unpinnedOrder.length * FieldItemHeight}}
          >
            {draftState.unpinnedOrder
              .filter((id) => draftState.draggingItem?.id !== id)
              .map((id) => (
                <FieldItem key={id} id={id} draftState={draftState} />
              ))}
            {draftState.draggingItem?.pinned === false ? (
              <FieldItem
                key={draftState.draggingItem.id}
                id={draftState.draggingItem.id}
                draftState={draftState}
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
});

const FieldItem = observer(function FieldItem({
  id,
  draftState,
}: {
  id: string;
  draftState: DraftFieldConfig;
}) {
  const isDragging = draftState.draggingItem?.id === id;
  const isPinned = draftState.pinned.has(id);
  const orderList = isPinned
    ? draftState.pinnedOrder
    : draftState.unpinnedOrder;
  const orderIndex = orderList.indexOf(id);

  const field = draftState.fields!.get(id)!;

  const [_, setGlobalDrag] = useGlobalDragCursor();

  return (
    <div
      className={cn(styles.fieldItem, {
        [styles.dragging]: isDragging,
        [styles.undraggable]: orderList.length <= 1,
        [styles.unselected]: !draftState.selected.has(id),
      })}
      style={{
        top: isDragging
          ? draftState.draggingItem!.top
          : orderIndex * FieldItemHeight,
      }}
    >
      <div
        className={styles.dragHandle}
        onMouseDown={(e) => {
          const startTop = e.clientY;

          const listener = (e: MouseEvent | React.MouseEvent) => {
            draftState.updateItemDrag(
              id,
              orderIndex * FieldItemHeight + e.clientY - startTop
            );
          };
          listener(e);
          setGlobalDrag("grabbing");

          window.addEventListener("mousemove", listener);
          window.addEventListener(
            "mouseup",
            () => {
              window.removeEventListener("mousemove", listener);
              draftState.endItemDrag();
              setGlobalDrag(null);
            },
            {
              once: true,
            }
          );
        }}
      >
        <DragHandleIcon />
      </div>

      <Checkbox
        checked={draftState.selected.has(id)}
        onChange={() => draftState.toggleSelected(id)}
        disabled={
          draftState.selected.size === 1 && draftState.selected.has(id)
        }
      />

      <div className={styles.details}>
        {field.subtypeName ? (
          <div className={styles.subtype}>{field.subtypeName}</div>
        ) : null}
        <div className={styles.name}>{field.name}</div>
      </div>

      <div
        className={cn(styles.pin, {[styles.pinned]: isPinned})}
        onClick={() => draftState.togglePinned(id)}
      >
        {isPinned ? <PinIcon /> : <TiltedPinIcon />}
      </div>
    </div>
  );
});

function SelectionButton({
  label,
  getItems,
}: {
  label: string;
  getItems: () => {label: string; disabled: boolean; action: () => void}[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      const listener = (e: MouseEvent) => {
        if (!ref.current?.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      window.addEventListener("mousedown", listener, {capture: true});

      return () => {
        window.removeEventListener("mousedown", listener, {capture: true});
      };
    }
  });

  return (
    <div ref={ref} className={styles.selectionButtonWrapper}>
      <div className={styles.selectionButton} onClick={() => setOpen(!open)}>
        {label} <ChevronDownIcon />
      </div>
      {open ? (
        <div className={styles.dropdown}>
          {getItems().map((item, i) => (
            <div
              key={i}
              className={cn(styles.dropdownItem, {
                [styles.disabled]: item.disabled,
              })}
              onClick={() => {
                setOpen(false);
                item.action();
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
