import {types, cast, Instance} from "mobx-state-tree";

import {
  SchemaScalarType,
  SchemaFunction,
  SchemaConstraint,
} from "@dbsof/common/schemaData";

import {SchemaGraph} from "./graph";

import {SchemaObject} from "./interfaces";
import {SchemaSidepanel} from "./sidepanel";

export type {
  SchemaObject,
  SchemaProp,
  SchemaLink,
  SchemaConstraint,
  SchemaAnnotation,
  SchemaFunction,
} from "./interfaces";

export const Schema = types
  .model("Schema", {
    graph: types.optional(SchemaGraph, {viewport: {}}),
    sidepanel: types.optional(SchemaSidepanel, {}),
    objects: types.maybe(types.map(types.frozen<SchemaObject>())),
    selectedObjectName: "",
    selectedLinkName: "",
  })
  .volatile(() => ({
    functions: null as SchemaFunction[] | null,
    constraints: null as SchemaConstraint[] | null,
    scalars: null as SchemaScalarType[] | null,
  }))
  .views((self) => ({
    get isLoaded() {
      return !!self.objects;
    },
    get moduleNames() {
      const moduleNames = new Set<string>();
      for (const name of self.objects?.keys() ?? []) {
        moduleNames.add(name.split("::").slice(0, -1).join("::"));
      }
      return moduleNames;
    },
    get selectedObject() {
      return self.objects?.get(self.selectedObjectName);
    },
  }))

  .actions((self) => ({
    updateSchema(
      objects: SchemaObject[],
      functions: SchemaFunction[],
      constraints: SchemaConstraint[],
      scalars: SchemaScalarType[]
    ) {
      self.objects = cast(
        objects.reduce((objects, obj) => {
          objects[obj.name] = obj;
          return objects;
        }, {} as {[key: string]: SchemaObject})
      );
      self.functions = functions;
      self.constraints = constraints;
      self.scalars = scalars;

      self.graph.hideAllLinks = true;
      self.graph.updateGraphNodesAndLinks(objects);
      return self.graph.autoLayoutNodes();
    },
    selectObject(name: string, centerOn: boolean = false) {
      self.selectedObjectName = name;
      self.selectedLinkName = "";
      if (centerOn) {
        self.graph.centerOnNode(name);
      }
    },
    selectLink(objectName: string, linkName: string) {
      self.selectedObjectName = objectName;
      self.selectedLinkName = linkName;
    },
    deselectAll() {
      self.selectedObjectName = "";
      self.selectedLinkName = "";
    },
  }));

// eslint-disable-next-line
export interface SchemaState extends Instance<typeof Schema> {}
