import {
  model,
  Model,
  prop,
  arraySet,
  createContext,
  modelAction,
  modelFlow,
  _async,
  _await,
  ArraySet,
  idProp,
} from "mobx-keystone";
import {action, computed, observable} from "mobx";
import {_ICodec} from "@dbsof/platform/client";

import {prettyPrintJSON} from "@dbsof/common/utils/renderJsonResult";

import {Item, buildItem, expandItem, ItemType} from "./buildItem";

export type {Item};

export interface InspectorResult {
  data: any[];
  codec: _ICodec;
}

export const resultGetterCtx =
  createContext<
    (state: InspectorState) => Promise<InspectorResult | undefined>
  >();

export type NestedDataGetter = (
  objectType: string,
  objectId: string,
  fieldName: string
) => Promise<{data: any; codec: _ICodec}>;

export function createInspector(
  result: any[] & {_codec: _ICodec},
  implicitLimit: number | null,
  extendedViewerIds: Set<string>,
  openExtendedView: (item: Item) => void
) {
  const inspector = new InspectorState({
    implicitLimit:
      implicitLimit != null && !Number.isNaN(implicitLimit)
        ? implicitLimit
        : null,
    noMultiline: true,
  });
  inspector._extendedViewIds = extendedViewerIds;
  inspector._openExtendedView = openExtendedView;
  inspector.initData({data: result, codec: result._codec});
  return inspector;
}

@model("edb/Inspector")
export class InspectorState extends Model({
  $modelId: idProp,
  expanded: prop<ArraySet<string> | undefined>(),
  scrollPos: prop<number>(0).withSetter(),

  autoExpandDepth: prop<number | null>(null),
  countPrefix: prop<string | null>(null),
  ignorePrefix: prop<string | null>(null),
  implicitLimit: prop<number | null>(null),
  noMultiline: prop<boolean>(false),
}) {
  @observable.shallow
  _items: Item[] = [];
  _jsonModeData: string | null = null;

  loadingData = false;

  @observable
  hoverId: string | null = null;

  @action.bound
  setHoverId(id: string | null) {
    this.hoverId = id;
  }

  @observable
  selectedIndex: number | null = null;

  @action.bound
  setSelectedIndex(index: number | null) {
    this.selectedIndex =
      index !== null
        ? Math.max(0, Math.min(index, this._items.length - 1))
        : null;
  }

  @action
  selectSiblingIndex(index: number | null, dir: 1 | -1) {
    if (index === null) {
      this.selectedIndex = 0;
      return;
    }

    const level = this._items[index].level;
    for (
      let i = index + dir, end = dir === 1 ? this._items.length : -1;
      i !== end;
      i += dir
    ) {
      if (
        this._items[i].type !== ItemType.Other &&
        this._items[i].level === level
      ) {
        this.selectedIndex = i;
        break;
      }
    }
  }

  _extendedViewIds: Set<string> | null = null;
  _openExtendedView: ((item: Item) => void) | null = null;

  hasExtendedView(item: Item | null): boolean {
    return (
      (this._openExtendedView != null &&
        item?.type === ItemType.Scalar &&
        (item.parent as any).data[item.index] != null &&
        this._extendedViewIds?.has(item.codec.getKnownTypeName())) ??
      false
    );
  }

  openExtendedView(item: Item | null) {
    if (this.hasExtendedView(item)) {
      this._openExtendedView!(item!);
    }
  }

  loadNestedData: NestedDataGetter | null = null;

  getItems() {
    if (!this._items.length) {
      this.initData();
    }

    return this._items;
  }

  @computed
  get totalItemsLines() {
    return this._items.reduce((sum, item) => sum + (item.height ?? 1), 0);
  }

  @modelFlow
  initData = _async(function* (
    this: InspectorState,
    result?: InspectorResult,
    jsonMode: boolean = false
  ) {
    if (this.loadingData) {
      return;
    }

    if (!result) {
      const resultGetter = resultGetterCtx.get(this);
      if (resultGetter) {
        this.loadingData = true;
        result = yield* _await(resultGetter(this));
        this.loadingData = false;
      }
    }

    let shouldAutoExpand = false;

    if (!this.expanded) {
      this.expanded = arraySet();
      shouldAutoExpand = true;
    }

    if (result) {
      if (jsonMode) {
        const rawJson = `[${result.data.join(", ")}]`;
        this._items = [
          buildItem(
            {id: ".", parent: null, level: -1, codec: result.codec},
            rawJson,
            0,
            false
          ),
        ];
        this._jsonModeData = prettyPrintJSON(rawJson);
      } else {
        this._items = [
          buildItem(
            {
              id: ".",
              parent: null,
              level: 0,
              codec: result.codec,
            },
            result.data,
            0,
            this.noMultiline
          ),
        ];
        this.expandItem(
          0,
          shouldAutoExpand ? this.autoExpandDepth ?? 4 : undefined
        );
      }
    }
  });

  @modelAction
  replaceItemBody(item: Item, body: JSX.Element) {
    this._items[this._items.indexOf(item)] = {...item, body};
  }

  @modelAction
  expandItem(index: number, expandLevels?: number) {
    const item = this._items[index];

    if (
      item.type !== ItemType.Scalar &&
      item.type !== ItemType.Other &&
      !this.expanded!.has(item.id)
    ) {
      const expandedItems = expandItem(
        item,
        this.expanded!,
        expandLevels,
        this.countPrefix,
        this.ignorePrefix,
        this.loadNestedData,
        this
      );
      this._items.splice(index + 1, 0, ...expandedItems);
    }
  }

  @modelAction
  collapseItem(index: number) {
    const item = this._items[index];

    if (
      item.type !== ItemType.Scalar &&
      item.type !== ItemType.Other &&
      this.expanded!.has(item.id)
    ) {
      const itemEndIndex = this._items.indexOf(
        (item as any).closingBracket,
        index
      );

      if (itemEndIndex !== -1) {
        this.expanded!.delete(item.id);
        this._items.splice(index + 1, itemEndIndex - index);
      }
    }
  }
}
