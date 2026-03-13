import {computed} from "mobx";
import {
  model,
  Model,
  modelAction,
  objectMap,
  ObjectMap,
  prop,
} from "mobx-keystone";

import {escapeName} from "@dbsof/common/schemaData";

import {parsers} from "../dataEditor";

export enum OpKind {
  infix,
  prefix,
}
export interface OpDef {
  kind: OpKind;
  op: string;
  types?: Set<string>;
}

export const operators: Map<string, OpDef> = new Map(
  [
    {kind: OpKind.infix, op: "="},
    {kind: OpKind.infix, op: "!="},
    {kind: OpKind.infix, op: "?="},
    {kind: OpKind.infix, op: "?!="},
    {kind: OpKind.infix, op: "<"},
    {kind: OpKind.infix, op: ">"},
    {kind: OpKind.infix, op: "<="},
    {kind: OpKind.infix, op: ">="},
    {kind: OpKind.infix, op: "like", types: new Set(["std::str"])},
    {kind: OpKind.infix, op: "ilike", types: new Set(["std::str"])},

    {kind: OpKind.prefix, op: "exists"},
    {kind: OpKind.prefix, op: "not exists"},
  ].map((def) => [def.op, def])
);

export const infixOperators = [...operators.values()].filter(
  (op) => op.kind === OpKind.infix
);
export const prefixOperators = [...operators.values()].filter(
  (op) => op.kind === OpKind.prefix
);

@model("QueryBuilder")
export class QueryBuilderState extends Model({
  root: prop<QueryBuilderShape>(() => new QueryBuilderShape({})).withSetter(),
}) {
  @computed
  get canRunQuery() {
    return this.root.typename !== null && !this.root.hasErrors;
  }

  @computed
  get query() {
    return `select ${escapeName(this.root.typename!, true)} ${renderQuery(
      this.root,
      ""
    )}`;
  }
}

export interface OrderByExpr {
  expr: string;
  dir?: "asc" | "desc";
  empty?: "first" | "last";
}

@model("QueryBuilder/Shape")
export class QueryBuilderShape extends Model({
  typename: prop<string | null>(null),
  props: prop<ObjectMap<string | null>>(() => objectMap()),
  links: prop<ObjectMap<QueryBuilderShape>>(() => objectMap()),
  filter: prop<FilterGroup>(() => new FilterGroup({})),
  orderBy: prop<OrderByExpr[]>(() => []),
  offset: prop<string | null>(null),
  limit: prop<string | null>(null),
}) {
  @modelAction
  toggleProp(propName: string, active: boolean, polyType?: string) {
    if (active) {
      this.props.set(propName, polyType ?? null);
    } else {
      this.props.delete(propName);
    }
  }

  @modelAction
  toggleLink(linkName: string, active: boolean, polyType?: string) {
    if (active) {
      this.links.set(linkName, new _QueryBuilderShape({typename: polyType}));
    } else {
      this.links.delete(linkName);
    }
  }

  @modelAction
  setOrderBy(orderExpr: OrderByExpr | undefined, expr: string | null) {
    if (orderExpr) {
      if (expr) {
        orderExpr.expr = expr;
      } else {
        this.orderBy = this.orderBy.filter((o) => o !== orderExpr);
      }
    } else if (expr) {
      this.orderBy.push({expr});
    }
  }

  @modelAction
  updateOrderBy(
    orderExpr: OrderByExpr,
    update: {dir?: "asc" | "desc"; empty?: "first" | "last"}
  ) {
    orderExpr.dir = update.dir ?? orderExpr.dir;
    orderExpr.empty = update.empty ?? orderExpr.empty;
  }

  @modelAction
  setOffset(val: string | null) {
    if (val === null) {
      this.offset = null;
    } else {
      const int = parseInt(val, 10);
      this.offset = Number.isNaN(int) ? "" : int.toString();
    }
  }

  @modelAction
  setLimit(val: string | null) {
    if (val === null) {
      this.limit = null;
    } else {
      const int = parseInt(val, 10);
      this.limit = Number.isNaN(int) ? "" : int.toString();
    }
  }

  @computed
  get hasErrors(): boolean {
    return (
      this.offset === "" ||
      this.limit === "" ||
      this.filter.hasErrors ||
      [...this.links.values()].some((shape) => shape.hasErrors)
    );
  }
}

const _QueryBuilderShape = QueryBuilderShape;

@model("QueryBuilder/FilterGroup")
export class FilterGroup extends Model({
  kind: prop<"and" | "or">("and"),
  exprs: prop<(FilterExpr | FilterGroup)[]>(() => []),
}) {
  @modelAction
  addExpr() {
    this.exprs.push(new FilterExpr({}));
  }

  @modelAction
  addGroup() {
    this.exprs.push(
      new _FilterGroup({
        kind: this.kind === "and" ? "or" : "and",
        exprs: [new FilterExpr({}), new FilterExpr({})],
      })
    );
  }

  @modelAction
  removeAtIndex(index: number) {
    this.exprs.splice(index, 1);
  }

  @modelAction
  toggleKind() {
    this.kind = this.kind === "and" ? "or" : "and";
  }

  @computed
  get hasErrors(): boolean {
    return this.exprs.some((expr) =>
      expr instanceof FilterExpr ? expr.errMessage !== null : expr.hasErrors
    );
  }
}

const _FilterGroup = FilterGroup;

@model("QueryBuilder/FilterExpr")
export class FilterExpr extends Model({
  prop: prop<string>(".id"),
  propType: prop<string>("std::uuid"),
  op: prop<string>("="),
  val: prop<string>("").withSetter(),
}) {
  @modelAction
  updateProp(prop: string, type: string, setInfix: boolean = false) {
    this.prop = prop;
    this.propType = type;
    if (
      (setInfix && !this.isInfixOp) ||
      (this.isInfixOp && !this.infixOps.includes(this.op))
    ) {
      this.op = "=";
    }
  }

  @computed
  get isInfixOp() {
    return operators.get(this.op)!.kind === OpKind.infix;
  }

  @computed
  get infixOps() {
    return infixOperators
      .filter((op) => !op.types || op.types.has(this.propType))
      .map(({op}) => op);
  }

  @modelAction
  updateOp(op: string) {
    this.op = op;
  }

  @computed
  get errMessage(): string | null {
    if (this.isInfixOp && parsers[this.propType]) {
      try {
        parsers[this.propType](this.val, null);
        return null;
      } catch (err) {
        return (err as any).message;
      }
    }
    return null;
  }
}

function renderQuery(query: QueryBuilderShape, indent: string): string {
  return `{\n${indent + "  "}${[
    ...[...query.props].map(
      ([name, type]) =>
        (type ? `[is ${escapeName(type, true)}].` : "") +
        (name.startsWith("@")
          ? `@${escapeName(name.slice(1), false)}`
          : escapeName(name, false))
    ),
    ...[...query.links].map(
      ([name, subQuery]) =>
        `${
          subQuery.typename
            ? `[is ${escapeName(subQuery.typename, true)}].`
            : ""
        }${escapeName(name, false)}: ${renderQuery(subQuery, indent + "  ")}`
    ),
  ].join(`,\n  ${indent}`)}\n${indent}}${
    query.filter.exprs.length
      ? `\n${indent}filter ${renderFilterGroup(query.filter, indent)}`
      : ""
  }${
    query.orderBy.length
      ? `\n${indent}order by ${query.orderBy
          .map(
            (orderExpr) =>
              `${escapePropName(orderExpr.expr)}${
                orderExpr.dir ? " " + orderExpr.dir : ""
              }${orderExpr.empty ? " empty " + orderExpr.empty : ""}`
          )
          .join(`\n${indent}  then `)}`
      : ""
  }${query.offset != null ? `\n${indent}offset ${query.offset}` : ""}${
    query.limit != null ? `\n${indent}limit ${query.limit}` : ""
  }`;
}

function renderFilterGroup(group: FilterGroup, indent: string): string {
  return group.exprs
    .map((expr) =>
      expr instanceof FilterExpr
        ? renderFilterExpr(expr)
        : `(${renderFilterGroup(expr, indent)})`
    )
    .join(` ${group.kind} `);
}

function escapePropName(prop: string) {
  const [typeIntersection, propName] = prop.split(".");
  return `${
    typeIntersection
      ? `[is ${escapeName(typeIntersection.slice(4, -1), true)}]`
      : ""
  }.${escapeName(propName, false)}`;
}

function renderFilterExpr(expr: FilterExpr): string {
  const opDef = operators.get(expr.op);
  if (!opDef) {
    throw new Error(`unknown operator ${expr.op}`);
  }
  const prop = escapePropName(expr.prop);
  if (opDef.kind === OpKind.prefix) {
    return `${opDef.op} ${prop}`;
  } else {
    return `${prop} ${expr.op} ${
      expr.propType && expr.propType !== "std::str" ? `<${expr.propType}>` : ""
    }${JSON.stringify(expr.val)}`;
  }
}
