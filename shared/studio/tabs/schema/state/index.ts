import {autorun, observable} from "mobx";
import {model, Model, prop} from "mobx-keystone";

import {type SchemaState} from "@dbsof/node-graph";

import {dbCtx} from "../../../state/database";

import {SplitViewState} from "@dbsof/common/ui/splitView/model";

import {SchemaTextView} from "./textView";

export enum SchemaViewType {
  Text,
  Graph,
  TextGraph,
}

@model("Schema")
export class Schema extends Model({
  viewType: prop<SchemaViewType>(SchemaViewType.TextGraph).withSetter(),

  splitView: prop(() => new SplitViewState({sizes: [50, 50]})),
  textViewState: prop(() => new SchemaTextView({})),
}) {
  @observable.ref
  schemaState: SchemaState | null = null;

  onAttachedToRootStore() {
    const updateSchemaDisposer = autorun(() => {
      const schemaData = dbCtx.get(this)!.schemaData;
      if (this.schemaState && schemaData) {
        this.schemaState.updateSchema(
          this.textViewState.moduleGroupItems
            .filter((type) => type.schemaType === "Object")
            .map((o) => ({
              name: o.name,
              is_abstract: o.abstract,
              from_alias: o.from_alias,
              expr: o.expr,
              inherits_from: o.bases
                .filter((b) => b.name !== "std::Object")
                .map((b) => b.name),
              inherited_by: [],
              constraints: o.constraints.map((c) => ({
                name: c.name,
                params: c.params
                  .filter((p) => p.name !== "__subject__")
                  .map((p) => ({name: p.name, "@value": p["@value"]})),

                delegated: c.delegated,
              })),
              annotations: o.annotations,
              properties: Object.values(o.properties).map((p) => ({
                name: p.name,
                targetName: p.target!.name,
                targetId: p.target!.id,
                required: p.required,
                readonly: p.readonly,
                cardinality: p.cardinality,
                expr: p.expr,
                default: p.default!,
                constraints: p.constraints,
                annotations: p.annotations,
              })),
              links: Object.values(o.links).map((l) => ({
                name: l.name,
                targetNames: l.target!.unionOf
                  ? l.target!.unionOf.map((t) => t.name)
                  : [l.target!.name],
                required: l.required,
                readonly: l.readonly,
                cardinality: l.cardinality,
                expr: l.expr,
                default: l.default!,
                constraints: l.constraints,
                annotations: l.annotations,
                properties: Object.values(l.properties).map((p) => ({
                  name: p.name,
                  targetName: p.target!.name,
                  targetId: p.target!.id,
                  required: p.required,
                  readonly: p.readonly,
                  cardinality: p.cardinality,
                  expr: p.expr,
                  default: p.default!,
                  constraints: p.constraints,
                  annotations: p.annotations,
                })),
              })),
            })),
          [...schemaData.functions.values()],
          [...schemaData.constraints.values()].filter((c) => c.abstract),
          [...schemaData.scalars.values()]
        );
      }
    });

    return () => {
      updateSchemaDisposer();
    };
  }
}
