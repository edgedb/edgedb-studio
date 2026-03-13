import {reserved_keywords} from "@dbsof/lang-query/meta";

import {
  RawAbstractAnnotation,
  RawSchemaExtension,
  SchemaAnnotation,
  SchemaCardinality,
  SchemaParameterKind,
  SchemaTypemod,
  SchemaVolatility,
  RawIntrospectionResult,
  TargetDeleteAction,
  SourceDeleteAction,
  SchemaAccessPolicy,
  SchemaOperatorKind,
  SchemaTrigger,
  SchemaRewriteKind,
} from "./queries";
import {KnownScalarTypes} from "./knownTypes";
import {SchemaVersion, paramToSDL, versionGTE} from "./utils";

export {KnownScalarTypes};
export type {SchemaAnnotation, SchemaAccessPolicy, SchemaTrigger};

export interface SchemaPseudoType {
  schemaType: "Pseudo";
  id: string;
  name: string;
  escapedName: string;
}

export interface SchemaScalarType {
  schemaType: "Scalar";
  id: string;
  name: string;
  escapedName: string;
  module: string;
  shortName: string;
  abstract: boolean;
  builtin: boolean;
  from_alias: boolean;
  default: string | null;
  enum_values: string[] | null;
  arg_values: string[] | null;
  isSequence: boolean;
  knownBaseType: SchemaScalarType | null;
  bases: SchemaScalarType[];
  constraints: SchemaConstraint[];
  annotations: SchemaAnnotation[];
  isDeprecated: boolean;
}

export interface SchemaArrayType {
  schemaType: "Array";
  id: string;
  name: string;
  escapedName: string;
  abstract: boolean;
  elementType: SchemaType;
}

export interface SchemaTupleType {
  schemaType: "Tuple";
  id: string;
  name: string;
  escapedName: string;
  abstract: boolean;
  named: boolean;
  elements: {
    name: string | null;
    type: SchemaType;
  }[];
}

export interface SchemaRangeType {
  schemaType: "Range";
  id: string;
  name: string;
  escapedName: string;
  elementType: SchemaType;
}

export interface SchemaMultirangeType {
  schemaType: "Multirange";
  id: string;
  name: string;
  escapedName: string;
  elementType: SchemaType;
  rangeType: {
    schemaType: "Range";
    name: string;
    elementType: SchemaType;
  };
}

interface _SchemaPointer {
  schemaType: "Pointer";
  id: string;
  type: string;
  name: string;
  escapedName: string;
  module: string;
  shortName: string;
  abstract: boolean;
  builtin: boolean;
  "@owned"?: boolean;
  target: SchemaType | null;
  source: SchemaObjectType | null;
  required: boolean;
  readonly: boolean;
  cardinality: SchemaCardinality;
  default: string | null;
  expr: string | null;
  secret: boolean;
  constraints: SchemaConstraint[];
  annotations: SchemaAnnotation[];
  rewrites: SchemaRewrite[];
  isDeprecated: boolean;
}

export interface SchemaProperty extends _SchemaPointer {
  type: "Property";
  bases: SchemaProperty[];
}

export interface SchemaLink extends _SchemaPointer {
  type: "Link";
  target: SchemaObjectType | null;
  bases: SchemaLink[];
  properties: {[name: string]: SchemaProperty};
  onTargetDelete: TargetDeleteAction;
  onSourceDelete: SourceDeleteAction;
  indexes: SchemaIndex[];
}

export type SchemaPointer = SchemaProperty | SchemaLink;

export interface SchemaObjectType {
  schemaType: "Object";
  id: string;
  name: string;
  escapedName: string;
  module: string;
  shortName: string;
  abstract: boolean;
  builtin: boolean;
  readonly: boolean;
  from_alias: boolean;
  expr: string;
  bases: SchemaObjectType[];
  extendedBy: SchemaObjectType[];
  ancestors: SchemaObjectType[];
  descendents: SchemaObjectType[];
  constraints: SchemaConstraint[];
  annotations: SchemaAnnotation[];
  isDeprecated: boolean;
  insectionOf: SchemaObjectType[] | null;
  unionOf: SchemaObjectType[] | null;
  properties: {[name: string]: SchemaProperty};
  links: {[name: string]: SchemaLink};
  pointers: SchemaPointer[];
  indexes: SchemaIndex[];
  accessPolicies: SchemaAccessPolicy[];
  triggers: SchemaTrigger[];
}

export type SchemaType =
  | SchemaPseudoType
  | SchemaScalarType
  | SchemaArrayType
  | SchemaTupleType
  | SchemaRangeType
  | SchemaMultirangeType
  | SchemaObjectType;

export interface SchemaParam {
  name: string;
  type: SchemaType;
  default: string;
  kind: SchemaParameterKind;
  num: number;
  typemod: SchemaTypemod;
}

export interface SchemaFunction {
  schemaType: "Function";
  id: string;
  name: string;
  module: string;
  shortName: string;
  builtin: boolean;
  params: SchemaParam[];
  wrapParams: boolean;
  returnType: SchemaType;
  returnTypemod: SchemaTypemod;
  volatility: SchemaVolatility;
  language: string;
  body: string | null;
  annotations: SchemaAnnotation[];
  isDeprecated: boolean;
}

export interface SchemaOperator {
  schemaType: "Operator";
  id: string;
  name: string;
  module: string;
  shortName: string;
  builtin: boolean;
  operatorKind: SchemaOperatorKind;
  params: SchemaParam[];
  wrapParams: boolean;
  returnType: SchemaType;
  returnTypemod: SchemaTypemod;
  annotations: SchemaAnnotation[];
  isDeprecated: boolean;
}

export interface SchemaConstraint {
  schemaType: "Constraint";
  id: string;
  name: string;
  module: string;
  shortName: string;
  abstract: boolean;
  builtin: boolean;
  inheritedFields: Set<string>;
  params: (SchemaParam & {"@value": string})[];
  expr: string | null;
  subjectexpr: string | null;
  delegated: boolean;
  errmessage: string;
  annotations: SchemaAnnotation[];
  isDeprecated: boolean;
}

export interface SchemaAbstractAnnotation extends RawAbstractAnnotation {
  schemaType: "AbstractAnnotation";
  module: string;
  shortName: string;
  isDeprecated: boolean;
}

export interface SchemaIndex {
  id: string;
  expr: string;
  "@owned": boolean;
  annotations: SchemaAnnotation[];
  isDeprecated: boolean;
}

export interface SchemaAlias {
  schemaType: "Alias";
  id: string;
  name: string;
  module: string;
  shortName: string;
  builtin: boolean;
  expr: string;
  type: SchemaType;
  annotations: SchemaAnnotation[];
  isDeprecated: boolean;
}

export interface SchemaGlobal {
  schemaType: "Global";
  id: string;
  name: string;
  escapedName: string;
  module: string;
  shortName: string;
  builtin: string;
  required: boolean;
  cardinality: SchemaCardinality;
  expr: string | null;
  target: SchemaType;
  default: string;
  annotations: SchemaAnnotation[];
  isDeprecated: boolean;
}

export interface SchemaExtension extends RawSchemaExtension {
  schemaType: "Extension";
}

export interface SchemaRewrite {
  kinds: SchemaRewriteKind[];
  expr: string;
}

const knownTypes = new Set<string>(KnownScalarTypes);

export function splitName(typeName: string) {
  const parts = typeName.split("::");
  return {
    module: parts.slice(0, -1).join("::"),
    shortName: parts[parts.length - 1],
  };
}

const keywords = new Set<string>(reserved_keywords);

function escape(name: string): string {
  return !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
    keywords.has(name.toLowerCase())
    ? "`" + name.replace(/`/g, "``") + "`"
    : name;
}

export function escapeName(typeName: string, hasModule: boolean): string {
  if (hasModule) {
    return typeName.split("::").map(escape).join("::");
  }
  return escape(typeName);
}

function isDeprecated(annotations: SchemaAnnotation[] | null): boolean {
  return annotations?.some((anno) => anno.name === "std::deprecated") ?? false;
}

const secretPointers = new Set([
  "ext::auth::OAuthProviderConfig.secret",
  "ext::auth::AuthConfig.auth_signing_key",
  "ext::auth::SMTPConfig.password",
]);

export function buildTypesGraph(
  data: RawIntrospectionResult,
  version: SchemaVersion
): {
  types: Map<string, SchemaType>;
  pointers: Map<string, SchemaPointer>;
  functions: Map<string, SchemaFunction>;
  operators: Map<string, SchemaOperator>;
  constraints: Map<string, SchemaConstraint>;
  annotations: Map<string, SchemaAbstractAnnotation>;
  aliases: Map<string, SchemaAlias>;
  globals: Map<string, SchemaGlobal>;
  extensions: SchemaExtension[];
} {
  const types = new Map<string, SchemaType>();
  const pointers = new Map<string, SchemaPointer>();
  const functions = new Map<string, SchemaFunction>();
  const operators = new Map<string, SchemaOperator>();
  const constraints = new Map<string, SchemaConstraint>();
  const aliases = new Map<string, SchemaAlias>();
  const globals = new Map<string, SchemaGlobal>();

  const extendedBy = new Map<string, Set<SchemaObjectType>>();

  const patchSecretProps = !versionGTE(version, [5, 0]);

  function getType(id: string, errMessage: string) {
    const type = types.get(id);
    if (!type) {
      throw new Error(errMessage);
    }
    return type;
  }

  for (const type of data.types) {
    switch (type.type) {
      case "schema::PseudoType":
        types.set(type.id, {
          schemaType: "Pseudo",
          id: type.id,
          name: type.name,
          escapedName: escape(type.name),
        });
        break;
      case "schema::ScalarType":
        types.set(type.id, {
          schemaType: "Scalar",
          id: type.id,
          name: type.name,
          escapedName: escapeName(type.name, true),
          ...splitName(type.name),
          abstract: type.abstract,
          builtin: type.builtin,
          from_alias: type.from_alias,
          default: type.default,
          enum_values: type.enum_values,
          arg_values: type.arg_values ?? null,
          isSequence: false,
          annotations: type.annotations,
          isDeprecated: isDeprecated(type.annotations),
        } as any);
        break;
      case "schema::Array":
      case "schema::ArrayExprAlias":
        types.set(type.id, {
          schemaType: "Array",
          id: type.id,
          name: type.name,
        } as any);
        break;
      case "schema::Tuple":
      case "schema::TupleExprAlias":
        types.set(type.id, {
          schemaType: "Tuple",
          id: type.id,
          name: type.name,
          named: type.named,
        } as any);
        break;
      case "schema::Range":
      case "schema::RangeExprAlias":
        types.set(type.id, {
          schemaType: "Range",
          id: type.id,
          name: type.name,
        } as any);
        break;
      case "schema::MultiRange":
      case "schema::MultiRangeExprAlias":
        types.set(type.id, {
          schemaType: "Multirange",
          id: type.id,
          name: type.name,
        } as any);
        break;
      case "schema::ObjectType":
        types.set(type.id, {
          schemaType: "Object",
          id: type.id,
          name: type.name,
          escapedName: escapeName(type.name, true),
          ...splitName(type.name),
          abstract: type.abstract,
          builtin: type.builtin,
          readonly: false,
          from_alias: type.from_alias,
          expr: type.expr,
          annotations: type.annotations,
          isDeprecated: isDeprecated(type.annotations),
          properties: {},
          links: {},
          pointers: [],
          indexes: type.indexes?.map((i) => ({
            ...i,
            isDeprecated: isDeprecated(i.annotations),
          })),
          accessPolicies: type.access_policies,
          triggers: type.triggers ?? [],
        } as any);
        for (const baseId of type.baseIds) {
          if (!extendedBy.has(baseId)) {
            extendedBy.set(baseId, new Set());
          }
          extendedBy.get(baseId)!.add(types.get(type.id) as SchemaObjectType);
        }
        break;
      default:
        throw new Error(`unknown type: ${type.type}`);
    }
  }

  for (const func of data.functions) {
    const params = func.params.map((param) => ({
      name: param.name,
      kind: param.kind,
      num: param.num,
      type: getType(
        param.typeId,
        `cannot find type id: ${param.typeId} for param ${param.name} of function ${func.name}`
      ),
      typemod: param.typemod,
      default: param.default,
    }));

    let wrapParams = false;
    let paramsLen = 0;
    for (let i = 0; i < params.length; i++) {
      paramsLen +=
        paramToSDL(params[i]).length + (i !== params.length - 1 ? 2 : 0);
      if (paramsLen > 30) {
        wrapParams = true;
        break;
      }
    }

    functions.set(func.id, {
      schemaType: "Function",
      id: func.id,
      name: func.name,
      ...splitName(func.name),
      builtin: func.builtin,
      params,
      wrapParams,
      returnType: getType(
        func.returnTypeId,
        `cannot find type id: ${func.returnTypeId} for return type of function ${func.name}`
      ),
      returnTypemod: func.return_typemod,
      volatility: func.volatility,
      language: func.language,
      body: func.body,
      annotations: func.annotations,
      isDeprecated: isDeprecated(func.annotations),
    });
  }

  for (const op of data.operators) {
    const params = op.params.map((param) => ({
      name: param.name,
      kind: param.kind,
      num: param.num,
      type: getType(
        param.typeId,
        `cannot find type id: ${param.typeId} for param ${param.name} of operator ${op.name}`
      ),
      typemod: param.typemod,
      default: param.default,
    }));

    let wrapParams = false;
    let paramsLen = 0;
    for (let i = 0; i < params.length; i++) {
      paramsLen +=
        paramToSDL(params[i]).length + (i !== params.length - 1 ? 2 : 0);
      if (paramsLen > 30) {
        wrapParams = true;
        break;
      }
    }

    operators.set(op.id, {
      schemaType: "Operator",
      id: op.id,
      name: op.name,
      ...splitName(op.name),
      builtin: op.builtin,
      operatorKind: op.operator_kind,
      params,
      wrapParams,
      returnType: getType(
        op.returnTypeId,
        `cannot find type id: ${op.returnTypeId} for return type of operator ${op.name}`
      ),
      returnTypemod: op.return_typemod,
      annotations: op.annotations,
      isDeprecated: isDeprecated(op.annotations),
    });
  }

  for (const constraint of data.constraints) {
    constraints.set(constraint.id, {
      schemaType: "Constraint",
      id: constraint.id,
      name: constraint.name,
      ...splitName(constraint.name),
      abstract: constraint.abstract,
      builtin: constraint.builtin,
      inheritedFields: new Set(constraint.inherited_fields),
      params: constraint.params.map((param) => ({
        name: param.name,
        kind: param.kind,
        num: param.num,
        type: getType(
          param.typeId,
          `cannot find type id: ${param.typeId} for param ${param.name} of constraint ${constraint.name}`
        ),
        typemod: param.typemod,
        default: param.default,
        "@value": param["@value"],
      })),
      expr: constraint.expr,
      subjectexpr: constraint.subjectexpr,
      delegated: constraint.delegated,
      errmessage: constraint.errmessage,
      annotations: constraint.annotations,
      isDeprecated: isDeprecated(constraint.annotations),
    });
  }

  for (const pointer of data.pointers) {
    const isLink = pointer.type === "schema::Link";

    pointers.set(pointer.id, {
      schemaType: "Pointer",
      id: pointer.id,
      type: pointer.type === "schema::Link" ? "Link" : "Property",
      name: pointer.name,
      escapedName: escapeName(pointer.name, pointer.abstract),
      ...((pointer.abstract
        ? splitName(pointer.name)
        : {module: null, shortName: pointer.name}) as any),
      abstract: pointer.abstract,
      builtin: pointer.builtin,
      target: pointer.targetId
        ? getType(
            pointer.targetId,
            `cannot find target id: ${pointer.targetId} for ${
              isLink ? "link" : "property"
            } ${pointer.name} (id: ${pointer.id})`
          )
        : null,
      source: null,
      required: pointer.required,
      readonly: pointer.readonly,
      cardinality: pointer.cardinality,
      default: pointer.default,
      expr: pointer.expr,
      secret: pointer.secret ?? false,
      constraints: pointer.constraintIds.map((id) => {
        const constraint = constraints.get(id);
        if (!constraint) {
          throw new Error(
            `cannot find constraint type id: ${id} for ${
              isLink ? "link" : "property"
            } ${pointer.name} (id: ${pointer.id})`
          );
        }
        return constraint;
      }),
      annotations: pointer.annotations,
      rewrites: Object.values(
        (pointer.rewrites ?? []).reduce((rewrites, rewrite) => {
          if (!rewrites[rewrite.expr]) {
            rewrites[rewrite.expr] = {
              kinds: [rewrite.kind],
              expr: rewrite.expr,
            };
          } else {
            rewrites[rewrite.expr].kinds.push(rewrite.kind);
          }
          return rewrites;
        }, {} as {[expr: string]: SchemaRewrite})
      ),
      isDeprecated: isDeprecated(pointer.annotations),
      onTargetDelete: pointer.on_target_delete,
      onSourceDelete: pointer.on_source_delete,
      indexes: pointer.indexes?.map((i) => ({
        ...i,
        isDeprecated: isDeprecated(i.annotations),
      })),
    } as SchemaPointer);
  }

  for (const pointer of data.pointers) {
    pointers.get(pointer.id)!.bases = pointer.baseIds
      .map((id) => {
        const basePointer = pointers.get(id);
        if (!basePointer) {
          throw new Error(
            `cannot find base type id: ${id} for pointer type ${pointer.name}`
          );
        }
        return basePointer;
      })
      .filter(
        (base) => base.name !== "std::property" && base.name !== "std::link"
      ) as any;
    if (pointer.type === "schema::Link") {
      (pointers.get(pointer.id) as SchemaLink).properties =
        pointer.properties!.reduce((linkProps, p) => {
          const prop = pointers.get(p.id) as SchemaProperty;

          if (!prop) {
            throw new Error(
              `cannot find link property id: ${p.id} on link ${pointer.name} (id: ${pointer.id})`
            );
          }

          if (prop.name !== "target" && prop.name !== "source") {
            prop["@owned"] = p["@owned"];

            linkProps[prop.name] = prop;
          }

          return linkProps;
        }, {} as any);
    }
  }

  for (const alias of data.aliases) {
    const type = getType(
      alias.typeId,
      `cannot find type id: ${alias.typeId} for alias type ${alias.name}`
    );
    aliases.set(alias.id, {
      schemaType: "Alias",
      id: alias.id,
      name: alias.name,
      ...splitName(alias.name),
      builtin: alias.builtin,
      expr: alias.expr,
      type,
      annotations: alias.annotations,
      isDeprecated: isDeprecated(alias.annotations),
    });
  }

  for (const global of data.globals) {
    const target = getType(
      global.targetId,
      `cannot find type id: ${global.targetId} for global type ${global.name}`
    );
    globals.set(global.id, {
      schemaType: "Global",
      id: global.id,
      name: global.name,
      escapedName: escapeName(global.name, true),
      ...splitName(global.name),
      builtin: global.builtin,
      required: global.required,
      cardinality: global.cardinality,
      expr: global.expr,
      target,
      default: global.default,
      annotations: global.annotations,
      isDeprecated: isDeprecated(global.annotations),
    });
  }

  for (const type of data.types) {
    switch (type.type) {
      case "schema::ScalarType": {
        const t = types.get(type.id) as SchemaScalarType;
        t.bases = type.baseIds.map(
          (id) =>
            getType(
              id,
              `cannot find base type id: ${id} for scalar type ${type.name}`
            ) as SchemaScalarType
        );
        t.constraints = type.constraintIds.map((id) => {
          const constraint = constraints.get(id);
          if (!constraint) {
            throw new Error(
              `cannot find constraint type id: ${id} for scalar type ${type.name}`
            );
          }
          return constraint;
        });
        break;
      }
      case "schema::Array":
      case "schema::ArrayExprAlias": {
        const elementType = types.get(type.element_type_id!);
        if (!elementType) {
          throw new Error(
            `cannot find element type id: ${type.element_type_id} for array type ${type.name}`
          );
        }
        const t = types.get(type.id) as SchemaArrayType;
        t.elementType = elementType;
        break;
      }
      case "schema::Tuple":
      case "schema::TupleExprAlias": {
        const t = types.get(type.id) as SchemaTupleType;
        t.elements = type.element_types!.map((el) => {
          const elType = types.get(el.type_id);
          if (!elType) {
            throw new Error(
              `cannot find element type id: ${el.type_id} for tuple type ${type.name}`
            );
          }
          return {type: elType, name: t.named ? el.name : null};
        });
        break;
      }
      case "schema::Range":
      case "schema::RangeExprAlias":
      case "schema::MultiRange":
      case "schema::MultiRangeExprAlias": {
        const elementType = types.get(type.range_element_type_id!);
        if (!elementType) {
          throw new Error(
            `cannot find element type id: ${type.range_element_type_id} for range type ${type.name}`
          );
        }
        (types.get(type.id) as SchemaRangeType).elementType = elementType;

        if (type.type === "schema::MultiRange") {
          (types.get(type.id) as SchemaMultirangeType).rangeType = {
            schemaType: "Range",
            name: `range<${elementType.name}>`,
            elementType,
          };
        }
        break;
      }
      case "schema::ObjectType": {
        const t = types.get(type.id) as SchemaObjectType;
        t.bases = type.baseIds.map(
          (id) =>
            getType(
              id,
              `cannot find base type id: ${id} for object type ${type.name}`
            ) as SchemaObjectType
        );
        t.extendedBy = [...(extendedBy.get(type.id) ?? [])];
        t.constraints = type.constraintIds.map((id) => {
          const constraint = constraints.get(id);
          if (!constraint) {
            throw new Error(
              `cannot find constraint type id: ${id} for object type ${type.name}`
            );
          }
          return constraint;
        });
        t.insectionOf = type.intersectionOfIds!.length
          ? type.intersectionOfIds!.map(
              (id) =>
                getType(
                  id,
                  `cannot find insection type id: ${id} for object type ${type.name}`
                ) as SchemaObjectType
            )
          : null;
        t.unionOf = type.unionOfIds!.length
          ? type.unionOfIds!.map(
              (id) =>
                getType(
                  id,
                  `cannot find union type id: ${id} for object type ${type.name}`
                ) as SchemaObjectType
            )
          : null;
        for (const p of type.pointers!) {
          const pointer = pointers.get(p.id)!;

          if (pointer.type === "Link" && pointer.name === "__type__") {
            continue;
          }

          if (patchSecretProps) {
            const keys = [t.name, ...t.bases.map((b) => b.name)].map(
              (name) => `${name}.${pointer.name}`
            );
            for (const key of keys) {
              if (secretPointers.has(key)) {
                pointer.secret = true;
                break;
              }
            }
          }

          pointer["@owned"] = p["@owned"];
          pointer.source = t;

          (pointer.type === "Link" ? t.links : t.properties)[pointer.name] =
            pointer as any;
          t.pointers.push(pointer as any);
        }
        if (t.unionOf?.length) {
          // Prettify name of union type placeholders
          t.name = t.unionOf.map((ut) => ut.name).join(" | ");
        }
        break;
      }
      default:
        break;
    }
  }

  for (const type of types.values()) {
    if (type.schemaType === "Scalar" && !type.enum_values) {
      if (knownTypes.has(type.name)) {
        type.knownBaseType = null;
      } else {
        const bases = [...type.bases];
        while (bases.length) {
          const base = bases.pop()!;
          if (base.name === "std::sequence") {
            type.isSequence = true;
          }
          if (knownTypes.has(base.name)) {
            type.knownBaseType = base;
            break;
          } else {
            bases.push(...base.bases);
          }
        }
        if (!type.abstract && type.bases.length && !type.knownBaseType) {
          throw new Error(
            `cannot find known base type for scalar type: ${type.name}`
          );
        }
      }
    }
    if (
      type.schemaType === "Array" ||
      type.schemaType === "Tuple" ||
      type.schemaType === "Range" ||
      type.schemaType === "Multirange"
    ) {
      const [name, escapedName] = getNameOfSchemaType(type);
      type.name = name;
      type.escapedName = escapedName;
    }
    if (type.schemaType === "Object") {
      const ancestors = new Set<SchemaObjectType>();
      const queue = [...type.bases];
      while (queue.length) {
        const item = queue.pop()!;
        ancestors.add(item);
        queue.unshift(...item.bases);
      }

      const descendents = new Set<SchemaObjectType>();
      queue.push(...type.extendedBy);
      while (queue.length) {
        const item = queue.pop()!;
        descendents.add(item);
        queue.unshift(...item.extendedBy);
      }

      type.ancestors = [...ancestors].reverse();
      type.descendents = [...descendents];

      if (type.ancestors.some((t) => t.name === "cfg::ConfigObject")) {
        type.readonly = true;
      }
    }
  }

  return {
    types,
    pointers,
    functions,
    operators,
    constraints,
    annotations: new Map(
      data.annotations.map((anno) => [
        anno.id,
        {
          schemaType: "AbstractAnnotation",
          ...anno,
          ...splitName(anno.name),
          isDeprecated: isDeprecated(anno.annotations),
        },
      ])
    ),
    aliases,
    globals,
    extensions: data.extensions.map((ext) => ({
      schemaType: "Extension",
      ...ext,
    })),
  };
}

/**
 * @returns Returns tuple type [name, escapedName]
 */
export function getNameOfSchemaType(type: SchemaType): [string, string] {
  switch (type.schemaType) {
    case "Scalar":
    case "Pseudo":
    case "Object":
      return [type.name, type.escapedName];
    case "Array": {
      const [name, escaped] = getNameOfSchemaType(type.elementType);
      return [`array<${name}>`, `array<${escaped}>`];
    }
    case "Tuple": {
      const elements = type.elements.map<[string, string]>((element) => {
        const [name, escaped] = getNameOfSchemaType(element.type);
        return [
          `${element.name ? `${element.name}: ` : ""}${name}`,
          `${element.name ? `${element.name}: ` : ""}${escaped}`,
        ];
      });
      return [
        `tuple<${elements.map((item) => item[0]).join(", ")}>`,
        `tuple<${elements.map((item) => item[1]).join(", ")}>`,
      ];
    }
    case "Range":
      return [
        `range<${type.elementType.name}>`,
        `range<${type.elementType.escapedName}>`,
      ];
    case "Multirange":
      return [
        `multirange<${type.elementType.name}>`,
        `multirange<${type.elementType.escapedName}>`,
      ];
    default:
      throw new Error(`unknown schema type: ${(type as any).schemaType}`);
  }
}
