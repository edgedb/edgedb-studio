import cn from "@dbsof/common/utils/classNames";

import {_ICodec} from "@dbsof/platform/client";
import {CodecKind} from "@dbsof/platform/client";
import {ObjectCodec} from "@dbsof/platform/client";
import {NamedTupleCodec} from "@dbsof/platform/client";
import {RecordCodec} from "@dbsof/platform/client";

import {buildScalarItem} from "./buildScalar";

import styles from "./inspector.module.scss";
import {InspectorState, NestedDataGetter} from "./state";

export enum ItemType {
  Set,
  Array,
  Object,
  Tuple,
  NamedTuple,
  Record,
  Scalar,
  Other,
}

interface _BaseItem {
  id: string;
  parent: Item | null;
  level: number;
  height?: number;
  codec: _ICodec;
  label?: JSX.Element;
  body: JSX.Element;
  fieldName?: string;
  comma: boolean;
}

export interface ArrayLikeItem extends _BaseItem {
  type: ItemType.Set | ItemType.Array | ItemType.Tuple;
  data: any[] | null;
  closingBracket: Item;
  expectedCount?: number;
}

export interface ObjectLikeItem extends _BaseItem {
  type: ItemType.Object | ItemType.NamedTuple | ItemType.Record;
  data: {[key: string]: any};
  closingBracket: Item;
}

export interface ScalarItem extends _BaseItem {
  type: ItemType.Scalar;
  index: string | number;
}

export interface OtherItem extends _BaseItem {
  type: ItemType.Other;
}

export type Item = ArrayLikeItem | ObjectLikeItem | ScalarItem | OtherItem;

export function expandItem(
  item: Item,
  expanded: Set<string>,
  expandLevels: number | undefined,
  countPrefix: string | null,
  ignorePrefix: string | null,
  loadNestedData: NestedDataGetter | null,
  state: InspectorState
): Item[] {
  if (item.type === ItemType.Scalar || item.type === ItemType.Other) {
    return [];
  }

  expanded.add(item.id);

  const shouldExpandChildren = !!expandLevels && item.level + 1 < expandLevels;

  let childItems: Item[];

  switch (item.type) {
    case ItemType.Set:
    case ItemType.Array:
    case ItemType.Tuple:
      {
        childItems = (item.data ?? [])
          .slice(
            0,
            item.type === ItemType.Set && state.implicitLimit
              ? state.implicitLimit
              : undefined
          )
          .flatMap((data, i) => {
            const subCodec =
              item.level === 0
                ? item.codec
                : item.codec.getKind() === "tuple"
                  ? item.codec.getSubcodecs()[i]
                  : item.codec.getSubcodecs()[0];

            const id = `${item.id}.${i}`;

            const childItem = buildItem(
              {
                id,
                parent: item,
                codec: subCodec,
                level: item.level + 1,
              },
              data,
              i,
              // override 'noMultiline' option if result is a single scalar
              !item.parent &&
                item.type === ItemType.Set &&
                item.data!.length === 1 &&
                subCodec.getKind() === "scalar"
                ? false
                : state.noMultiline,
              i < item.data!.length - 1
            );

            return [
              childItem,
              ...(shouldExpandChildren || expanded.has(id)
                ? expandItem(
                    childItem,
                    expanded,
                    expandLevels,
                    countPrefix,
                    ignorePrefix,
                    loadNestedData,
                    state
                  )
                : []),
            ];
          });

        if (
          item.type === ItemType.Set &&
          state.implicitLimit &&
          item.data &&
          state.implicitLimit + 1 === item.data.length
        ) {
          childItems.push({
            id: `_${item.id}.count`,
            parent: item,
            type: ItemType.Other,
            codec: item.codec,
            level: item.level + 1,
            comma: false,
            body: (
              <span className={styles.resultsHidden}>
                ... further results hidden (implicit limit{" "}
                {state.implicitLimit})
              </span>
            ),
          });
        }

        if (
          item.expectedCount !== undefined &&
          (!item.data || item.expectedCount > item.data.length)
        ) {
          const more = item.expectedCount - (item.data?.length ?? 0);

          const canLoadMoreData =
            loadNestedData &&
            (item.data?.length ?? 0) === 0 &&
            (item.parent as any)?.data &&
            item.fieldName;

          const childItem: Item = {
            id: `${item.id}.count`,
            parent: item,
            type: ItemType.Other,
            codec: item.codec,
            level: item.level + 1,
            comma: false,
            body: (
              <>
                {canLoadMoreData ? (
                  <span
                    className={cn(styles.resultsHidden, styles.loadable)}
                    onClick={async () => {
                      state.replaceItemBody(
                        childItem,
                        <span className={styles.resultsHidden}>
                          Loading...
                        </span>
                      );
                      const {data, codec} = await loadNestedData(
                        (item.parent as any).data.__tname__,
                        (item.parent as any).data.id,
                        item.fieldName!
                      );
                      const codecIndex = (
                        item.parent as any
                      ).codec.fields.findIndex(
                        (f: any) => f.name === item.fieldName!
                      );
                      if (
                        (
                          (item.parent as any).codec.codecs[
                            codecIndex
                          ] as _ICodec
                        ).getKind() === "object"
                      ) {
                        (item.parent as any).data[item.fieldName!] = data[0];
                        (item.parent as any).codec.codecs[codecIndex] = codec;
                      } else {
                        (item.parent as any).data[item.fieldName!] = data;
                        (item.parent as any).codec.codecs[
                          codecIndex
                        ].subCodec = codec;
                      }
                      const parentIndex = state._items.indexOf(item.parent!);
                      state.collapseItem(parentIndex);
                      state.expandItem(parentIndex);
                    }}
                  >
                    load {more} hidden result{more > 1 ? "s" : ""}...
                  </span>
                ) : (
                  <span className={styles.resultsHidden}>
                    ...{item.data?.length ? "further " : ""}
                    {more} result{more > 1 ? "s" : ""} hidden
                  </span>
                )}
              </>
            ),
          };
          childItems.push(childItem);
        }
      }
      break;
    case ItemType.Object:
      {
        const fields = (item.codec as ObjectCodec).getFields();
        const explicitNum = fields.filter((field) => !field.implicit).length;
        const subCodecs = item.codec.getSubcodecs();

        let explicitFieldIndex = 1;
        childItems = fields.flatMap((field, i) => {
          if (
            (field.implicit && !(!explicitNum && field.name === "id")) ||
            (countPrefix !== null && field.name.startsWith(countPrefix))
          ) {
            return [];
          }

          const id = `${item.id}.${i}`;

          const expectedCount =
            countPrefix !== null &&
            item.data[countPrefix + field.name] !== undefined
              ? parseInt(item.data[countPrefix + field.name], 10)
              : undefined;

          const childItem = buildItem(
            {
              id,
              parent: item,
              codec: subCodecs[i],
              level: item.level + 1,
              label: (
                <>
                  <span>
                    {ignorePrefix && field.name.startsWith(ignorePrefix)
                      ? field.name.slice(ignorePrefix.length)
                      : field.name}
                  </span>
                  <span>: </span>
                </>
              ),
              fieldName: field.name,
              expectedCount:
                expectedCount !== undefined && !Number.isNaN(expectedCount)
                  ? expectedCount
                  : undefined,
            },
            item.data[field.name],
            field.name,
            state.noMultiline,
            !!explicitNum && explicitFieldIndex++ < explicitNum
          );

          return [
            childItem,
            ...(shouldExpandChildren || expanded.has(id)
              ? expandItem(
                  childItem,
                  expanded,
                  expandLevels,
                  countPrefix,
                  ignorePrefix,
                  loadNestedData,
                  state
                )
              : []),
          ];
        });
      }
      break;
    case ItemType.NamedTuple:
    case ItemType.Record:
      {
        const fieldNames = (
          item.codec as NamedTupleCodec | RecordCodec
        ).getNames();
        const isRecord = item.type === ItemType.Record;
        const subCodecs = item.codec.getSubcodecs();

        childItems = fieldNames.flatMap((fieldName, i) => {
          const data = item.data[fieldName];

          const id = `${item.id}.${i}`;

          const childItem = buildItem(
            {
              id,
              parent: item,
              codec: subCodecs[i],
              level: item.level + 1,
              label: (
                <>
                  {fieldName}
                  <span>{isRecord ? ": " : " := "}</span>
                </>
              ),
              fieldName: fieldName,
            },
            data,
            fieldName,
            state.noMultiline,
            i < item.data.length - 1
          );

          return [
            childItem,
            ...(shouldExpandChildren || expanded.has(id)
              ? expandItem(
                  childItem,
                  expanded,
                  expandLevels,
                  countPrefix,
                  ignorePrefix,
                  loadNestedData,
                  state
                )
              : []),
          ];
        });
      }
      break;
    default:
      assertNever(item);
  }

  return [...childItems, item.closingBracket];
}

const itemTypes: {
  [key in Exclude<CodecKind, "range" | "multirange" | "sparse_object">]: {
    type: ItemType;
    brackets: string;
  };
} = {
  set: {type: ItemType.Set, brackets: "{}"},
  array: {type: ItemType.Array, brackets: "[]"},
  object: {type: ItemType.Object, brackets: "{}"},
  tuple: {type: ItemType.Tuple, brackets: "()"},
  namedtuple: {type: ItemType.NamedTuple, brackets: "()"},
  record: {type: ItemType.Record, brackets: "()"},
  scalar: {type: ItemType.Scalar, brackets: ""},
};

export function buildItem(
  base: {
    id: string;
    parent: Item | null;
    level: number;
    codec: _ICodec;
    label?: JSX.Element;
    fieldName?: string;
    expectedCount?: number;
  },
  data: any,
  index: string | number,
  noMultiline: boolean,
  comma?: boolean
): Item {
  if (data === null && !base.expectedCount) {
    return buildScalarItem(base, null, index, comma);
  }

  const codecKind =
    base.level === 0 || (base.expectedCount && data === null)
      ? "set"
      : base.codec.getKind();

  if (
    codecKind === "scalar" ||
    codecKind === "range" ||
    codecKind === "multirange"
  ) {
    return buildScalarItem(base, data, index, comma, noMultiline);
  }

  const {type, brackets} =
    itemTypes[codecKind as Exclude<typeof codecKind, "sparse_object">];

  return {
    ...base,
    type,
    data,
    body: (
      <>
        {type === ItemType.Object && data?.__tname__ !== "std::FreeObject" ? (
          <span className={styles.typeName}>
            {data.__tname__ ?? "Object"}{" "}
          </span>
        ) : null}
        {brackets[0]}
      </>
    ),
    comma: false,
    closingBracket: {
      id: base.id,
      parent: base.parent,
      level: base.level,
      codec: base.codec,
      type: ItemType.Other,
      comma: comma ?? false,
      body: <span>{brackets[1]}</span>,
    },
  } as Item;
}

export function assertNever(value: never): never {
  throw new Error(
    `Unhandled discriminated union member: ${JSON.stringify(value)}`
  );
}
