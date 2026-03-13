import {types, getParentOfType} from "mobx-state-tree";

import {
  SchemaScalarType,
  SchemaFunction,
  SchemaConstraint,
} from "@dbsof/common/schemaData";

import Fuse from "fuse.js";

import {Schema} from ".";

export enum SidepanelTabType {
  inspector = "inspector",
  objects = "objects",
  functions = "functions",
  scalars = "scalars",
  constraints = "constraints",
}

type FilterMatchRange = readonly [number, number][];

export interface FilterMatches {
  [key: string]: FilterMatchRange;
}

function createSchemaSidepanelFilter<T>(
  name: string,
  itemsGetter: (schemaState: any) => T[],
  fuseOptions: Fuse.IFuseOptions<T>
) {
  return types
    .model("SchemaSidepanelFilter-" + name, {
      filterValue: types.optional(types.string, ""),
    })
    .views((self) => ({
      get _items(): T[] {
        return itemsGetter(getParentOfType(self, Schema) as any);
      },
      get _fuse() {
        return new Fuse(this._items, {
          ...fuseOptions,
          includeMatches: true,
          threshold: 0.5,
        });
      },
      get filteredItems(): {
        items: T[];
        matches: Map<T, FilterMatches>;
      } {
        const filterValue = self.filterValue.trim();
        if (!filterValue)
          return {
            items: this._items,
            matches: new Map(),
          };
        const filtered = this._fuse.search(self.filterValue.trim());
        const items = [];
        const matches = new Map();
        for (const item of filtered) {
          items.push(item.item);
          if (item.matches) {
            matches.set(
              item.item,
              item.matches.reduce<FilterMatches>((_matches, match) => {
                const key =
                  match.key! +
                  (match.refIndex !== undefined ? "." + match.refIndex : "");
                _matches[key] = match.indices;
                return _matches;
              }, {})
            );
          }
        }
        return {items, matches};
      },
    }))
    .actions((self) => ({
      updateFilterValue(value: string) {
        self.filterValue = value;
      },
    }));
}

export const SchemaSidepanel = types
  .model("SchemaSidepanel", {
    selectedTab: types.optional(
      types.enumeration<SidepanelTabType>(Object.values(SidepanelTabType)),
      SidepanelTabType.inspector
    ),
    functions: types.optional(
      createSchemaSidepanelFilter<SchemaFunction>(
        "Functions",
        (schemaState) => schemaState.functions,
        {keys: ["name", "params.name"]}
      ),
      {}
    ),
    constraints: types.optional(
      createSchemaSidepanelFilter<SchemaConstraint>(
        "Constraints",
        (schemaState) => schemaState.constraints,
        {keys: ["name", "params.name"]}
      ),
      {}
    ),
    scalars: types.optional(
      createSchemaSidepanelFilter<SchemaScalarType>(
        "Scalars",
        (schemaState) => schemaState.scalars,
        {keys: ["name"]}
      ),
      {}
    ),
  })
  .actions((self) => ({
    setSelectedTab(tab: SidepanelTabType) {
      self.selectedTab = tab;
    },
  }));
