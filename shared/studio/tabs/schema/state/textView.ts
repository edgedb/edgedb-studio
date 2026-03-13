import {
  action,
  autorun,
  computed,
  observable,
  reaction,
  runInAction,
  when,
} from "mobx";
import {arraySet, getParent, model, Model, prop} from "mobx-keystone";
import Fuzzysort from "fuzzysort";
import type {VariableSizeList as List} from "react-window";

import {
  SchemaObjectType,
  SchemaFunction,
  SchemaScalarType,
  SchemaConstraint,
  SchemaPointer,
  SchemaAbstractAnnotation,
  SchemaExtension,
  SchemaAlias,
  SchemaGlobal,
  SchemaOperator,
} from "@dbsof/common/schemaData";

import {dbCtx} from "../../../state";
import {Schema} from ".";

export type ModuleGroup = "user" | "stdlib" | "system" | `ext::${string}`;
export const moduleGroupNames: ModuleGroup[] = ["user", "stdlib", "system"];

export enum TypeFilter {
  objects,
  functions,
  scalars,
  constraints,
  aliases,
  other,
}

const stdlibModules = new Set(["std", "cal", "math", "fts"]);

export type SchemaItem =
  | SchemaObjectType
  | SchemaScalarType
  | SchemaFunction
  | SchemaOperator
  | SchemaConstraint
  | SchemaPointer
  | SchemaAbstractAnnotation
  | SchemaAlias
  | SchemaGlobal
  | SchemaExtension;

export interface SchemaModule {
  schemaType: "Module";
  module: string;
  depth: number;
  isEnd?: boolean;
  startIndex?: number;
  endIndex?: number;
  submodules?: SchemaModule[];
}

export function getModuleGroup(
  item: Exclude<SchemaItem, SchemaExtension>
): ModuleGroup {
  return item.builtin
    ? stdlibModules.has(item.module)
      ? "stdlib"
      : "system"
    : item.module.startsWith("ext::")
    ? (item.module as `ext::${string}`)
    : "user";
}

export type SearchMatches = {[path: string]: readonly number[]};
export type ListItem = {
  item: SchemaItem | SchemaModule;
  matches?: SearchMatches;
};

const fuzzysortOptions = {
  key: "target",
};

interface FuzzysortIndexItem {
  target: Fuzzysort.Prepared;
  item: SchemaItem;
  path?: string;
  inherited?: boolean;
}
type FuzzysortIndex = FuzzysortIndexItem[];

function buildSearchIndex(items: SchemaItem[]): FuzzysortIndex {
  return items.flatMap((item) => [
    {target: Fuzzysort.prepare(item.name), item},
    ...(item.schemaType === "Object"
      ? item.pointers.flatMap((p) => [
          {
            target: Fuzzysort.prepare(p.name),
            item,
            path: p.name,
            inherited: !p["@owned"],
          },
          ...(p.type === "Link"
            ? Object.values(p.properties).map((lp) => ({
                target: Fuzzysort.prepare(lp.name),
                item,
                path: `${p.name}.${lp.name}`,
                inherited: !p["@owned"],
              }))
            : []),
        ])
      : []),
  ]);
}

@model("SchemaTextView")
export class SchemaTextView extends Model({
  searchText: prop<string>("").withSetter(),
  selectedModuleGroup: prop<ModuleGroup>("user").withSetter(),
  selectedTypeFilter: prop<TypeFilter | null>(null).withSetter(),
  toggledItems: prop(() => arraySet<string>()),
}) {
  scrollPos = 0;
  listRef: List | null = null;

  lastLocation: {
    path: string;
    searchParams: URLSearchParams;
    scrollPos: number;
  } | null = null;

  renderHeights = new Map<string, number>();

  @action
  setRenderHeight(index: number, item: SchemaItem, height: number) {
    if (this.renderHeights.get(item.id) !== height) {
      this.renderHeights.set(item.id, height);
      this.listRef?.resetAfterIndex(index);
    }
  }

  getRenderHeight(index: number) {
    const item = this.renderListItems.itemsList[index]?.item;
    return !item || item.schemaType === "Module"
      ? 42
      : this.renderHeights.get(item.id) ?? 42;
  }

  @observable.ref
  fuzzysortIndex: FuzzysortIndex = [];

  onAttachedToRootStore() {
    const disposeIndexUpdate = autorun(() => {
      const index = buildSearchIndex(this.moduleGroupItems);
      runInAction(() => {
        this.fuzzysortIndex = index;
      });
    });

    const disposeScrollReset = reaction(
      () =>
        this.searchText + this.selectedModuleGroup + this.selectedTypeFilter,
      () => this.listRef?.scrollTo(0)
    );

    const parentState = getParent<Schema>(this)!;
    const disposeSelectedGraphObject = reaction(
      () => parentState.schemaState?.selectedObjectName,
      (selectedObjName) => {
        if (
          selectedObjName &&
          selectedObjName !== (this.highlightedItem ?? "")
        ) {
          const schemaType = dbCtx
            .get(this)!
            .schemaData?.objectsByName.get(selectedObjName);
          if (schemaType) {
            this.goToItem(schemaType, false);
          }
        }
      }
    );

    return () => {
      disposeIndexUpdate();
      disposeScrollReset();
      disposeSelectedGraphObject();
    };
  }

  @action
  toggleItemCollapse(id: string) {
    if (this.toggledItems.has(id)) {
      this.toggledItems.delete(id);
    } else {
      this.toggledItems.add(id);
    }
  }

  @observable.ref
  highlightedItem: string | null = null;

  @action
  setHighlightedItem(name: string | null) {
    this.highlightedItem = name;
    const schemaState = getParent<Schema>(this)!.schemaState;

    schemaState?.selectObject(name ?? "", true);
  }

  @action
  async goToItem(item: SchemaItem, updateGraph = true) {
    if (item.schemaType === "Extension") return;

    const moduleGroup = getModuleGroup(item);
    if (
      moduleGroup !== this.selectedModuleGroup ||
      this.searchText ||
      this.selectedTypeFilter !== null
    ) {
      this.setSelectedModuleGroup(moduleGroup);
      this.setSelectedTypeFilter(null);
      this.setSearchText("");

      await when(() => !!this.renderListItems);
    }

    const listIndex = this.renderListItems.itemsList.findIndex(
      ({item: listItem}) =>
        listItem.schemaType !== "Module" && listItem === item
    );

    if (listIndex !== -1) {
      runInAction(() => (this.highlightedItem = item.name));
      this.listRef?.scrollToItem(listIndex, "center");

      if (updateGraph) {
        const schemaState = getParent<Schema>(this)!.schemaState;

        schemaState?.selectObject(
          item.schemaType === "Object" && !item.builtin ? item.name : "",
          true
        );
      }
    }
  }

  @computed
  get allSchemaItems(): Exclude<SchemaItem, SchemaExtension>[] {
    const schemaData = dbCtx.get(this)!.schemaData;
    if (!schemaData) return [];

    return [
      ...[...schemaData.globals.values()].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
      ...[...schemaData.scalars.values()]
        .filter((s) => !s.from_alias)
        .sort((a, b) => a.name.localeCompare(b.name)),
      ...[...schemaData.pointers.values()]
        .filter((p) => p.abstract)
        .sort((a, b) => a.name.localeCompare(b.name)),
      ...[...schemaData.annotations.values()].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
      ...[...schemaData.aliases.values()].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
      ...[...schemaData.objects.values()]
        .filter((o) => !o.from_alias && !o.unionOf)
        .sort((a, b) => a.name.localeCompare(b.name)),
      ...[...schemaData.functions.values()].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
      ...[...schemaData.constraints.values()]
        .filter((t) => t.abstract)
        .sort((a, b) => a.name.localeCompare(b.name)),
      ...[...schemaData.operators.values()].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    ];
  }

  @computed
  get extModuleGroupNames(): `ext::${string}`[] | null {
    const schemaData = dbCtx.get(this)!.schemaData;

    const moduleNames = schemaData?.shortNamesByModule.keys();

    return moduleNames
      ? ([...moduleNames].filter((name) =>
          name.startsWith("ext::")
        ) as `ext::${string}`[])
      : null;
  }

  @computed
  get moduleGroupItems(): SchemaItem[] {
    const schemaData = dbCtx.get(this)!.schemaData;

    const items = this.allSchemaItems;

    switch (this.selectedModuleGroup) {
      case "user":
        return [
          ...(schemaData?.extensions ?? []),
          ...items.filter(
            (type) => !type.builtin && !type.module.startsWith("ext::")
          ),
        ];
      case "stdlib":
        return items.filter(
          (type) =>
            type.builtin &&
            stdlibModules.has(type.module) &&
            !type.isDeprecated
        );

      case "system":
        return items.filter(
          (type) =>
            type.builtin &&
            !stdlibModules.has(type.module) &&
            !type.isDeprecated
        );
      default:
        return items.filter(
          (type) => type.module === this.selectedModuleGroup
        );
    }
  }

  @computed
  get searchFilteredItems(): ListItem[] {
    if (this.searchText) {
      const results = Fuzzysort.go(
        this.searchText,
        this.fuzzysortIndex,
        fuzzysortOptions
      );
      return [
        ...results
          .reduce(
            (items, result) => {
              if (!items.has(result.obj.item)) {
                items.set(result.obj.item, {
                  item: result.obj.item,
                  matches: {},
                  score: -Infinity,
                });
              }
              const item = items.get(result.obj.item)!;
              item.matches[result.obj.path ?? ""] = Fuzzysort.indexes(
                result
              ) as number[];
              const score = result.obj.inherited
                ? result.score - 1
                : result.score;
              item.score = item.score > score ? item.score : score;
              return items;
            },
            new Map<
              SchemaItem,
              {
                item: SchemaItem;
                matches: SearchMatches;
                score: number;
              }
            >()
          )
          .values(),
      ].sort((a, b) => b.score - a.score);
    } else {
      return this.moduleGroupItems.map((item) => ({item}));
    }
  }

  @computed
  get filteredItems() {
    const items = this.searchFilteredItems;

    const groups = {
      all: items,
      [TypeFilter.objects]: [] as ListItem[],
      [TypeFilter.functions]: [] as ListItem[],
      [TypeFilter.scalars]: [] as ListItem[],
      [TypeFilter.constraints]: [] as ListItem[],
      [TypeFilter.aliases]: [] as ListItem[],
      [TypeFilter.other]: [] as ListItem[],
    };

    for (const item of items) {
      switch (item.item.schemaType) {
        case "Object":
          groups[TypeFilter.objects].push(item);
          break;
        case "Function":
          groups[TypeFilter.functions].push(item);
          break;
        case "Scalar":
          groups[TypeFilter.scalars].push(item);
          break;
        case "Constraint":
          groups[TypeFilter.constraints].push(item);
          break;
        case "Alias":
          groups[TypeFilter.aliases].push(item);
          break;
        default:
          groups[TypeFilter.other].push(item);
      }
    }

    return groups;
  }

  @computed
  get renderListItems(): {itemsList: ListItem[]; modulesList: SchemaModule[]} {
    const items = this.filteredItems[this.selectedTypeFilter ?? "all"];

    if (this.searchText) {
      return {itemsList: items, modulesList: []};
    }

    const exts: ListItem[] = [];
    type NestedModule = {
      items: ListItem[];
      submodules: {[key: string]: NestedModule};
    };
    const modules: {[key: string]: NestedModule} = {};
    const modulesMap = new Map<string, NestedModule>();

    const getModule = (moduleName: string) => {
      let module = modulesMap.get(moduleName);
      if (!module) {
        module = {
          items: [],
          submodules: {},
        };
        modulesMap.set(moduleName, module);
        const moduleParts = moduleName.split("::");
        if (moduleParts.length === 1) {
          modules[moduleName] = module;
        } else {
          const parentModule = getModule(moduleParts.slice(0, -1).join("::"));
          parentModule.submodules[moduleParts[moduleParts.length - 1]] =
            module;
        }
      }
      return module;
    };

    for (const item of items) {
      if (item.item.schemaType === "Extension") {
        exts.push(item);
        continue;
      }

      getModule(item.item.module).items.push(item);
    }

    const sortAndFlattenModules = (
      modules: {
        [key: string]: NestedModule;
      },
      startIndex: number,
      depth: number
    ): [ListItem[], SchemaModule[]] => {
      const sortedModules = Object.entries(modules).sort((a, b) =>
        a[0].localeCompare(b[0])
      );

      let i = startIndex;
      const itemsList: ListItem[] = [];
      const headerItems: SchemaModule[] = [];
      for (const [name, {items, submodules}] of sortedModules) {
        const [submoduleItems, moduleHeaders] = sortAndFlattenModules(
          submodules,
          i + items.length + 1,
          depth + 1
        );
        const endIndex = i + items.length + submoduleItems.length + 1;

        const header = {
          schemaType: "Module",
          module: name,
          depth,
          startIndex: i,
          endIndex: endIndex,
          submodules: moduleHeaders,
        } as SchemaModule;
        headerItems.push(header);

        itemsList.push({item: header}, ...items, ...submoduleItems, {
          item: {
            schemaType: "Module",
            module: name,
            depth,
            isEnd: true,
          } as SchemaModule,
        });
        i = endIndex + 1;
      }

      return [itemsList, headerItems];
    };

    const [itemsList, modulesList] = sortAndFlattenModules(
      modules,
      exts.length,
      0
    );

    return {itemsList: [...exts, ...itemsList], modulesList};
  }
}
