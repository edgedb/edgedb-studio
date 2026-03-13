import {SchemaObjectType, SchemaParam} from ".";

export function resolveObjectTypeUnion(
  type: SchemaObjectType
): SchemaObjectType[] {
  if (type.unionOf) {
    return type.unionOf.flatMap(resolveObjectTypeUnion);
  }
  // todo: handle intersection types?
  return [type];
}

export function paramToSDL(param: SchemaParam) {
  return `${
    param.kind !== "PositionalParam"
      ? param.kind === "NamedOnlyParam"
        ? "named only "
        : "variadic "
      : ""
  }${param.name}: ${
    param.typemod !== "SingletonType"
      ? param.typemod === "SetOfType"
        ? "set of "
        : "optional "
      : ""
  }${param.type.name}${param.default ? ` = ${param.default}` : ""}`;
}

const versionStages = ["dev", "alpha", "beta", "rc", "final"] as const;

export type SchemaVersion = [
  number,
  number,
  (typeof versionStages)[number],
  number
];
export type PartialSchemaVersion = [number, number];

export function versionGTE(
  a: SchemaVersion,
  b: SchemaVersion | PartialSchemaVersion
) {
  if (a[0] === b[0]) {
    if (a[1] === b[1] && b[2]) {
      const as = versionStages.indexOf(a[2]);
      const bs = versionStages.indexOf(b[2]);
      if (as === bs) {
        return a[3] >= b[3]!;
      }
      return as > bs;
    }
    return a[1] >= b[1];
  }
  return a[0] > b[0];
}
