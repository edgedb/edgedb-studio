import {Fragment} from "react";

import {ICodec} from "@dbsof/platform/client";
import {EnumCodec} from "@dbsof/platform/client";
import {NamedTupleCodec} from "@dbsof/platform/client";
import {MultiRangeCodec, RangeCodec} from "@dbsof/platform/client";

import {renderValue} from "@dbsof/inspector/buildScalar";

import styles from "./dataGrid.module.scss";

const inspectorOverrideStyles = {
  uuid: styles.scalar_uuid,
  str: styles.scalar_str,
};

export function renderCellValue(
  value: any,
  codec: ICodec,
  nested = false
): JSX.Element {
  const kind = codec.getKind();
  if (
    value === null ||
    kind === "scalar" ||
    kind === "range" ||
    kind === "multirange"
  ) {
    return renderValue(
      value,
      codec.getKnownTypeName(),
      codec instanceof EnumCodec,
      codec instanceof RangeCodec || codec instanceof MultiRangeCodec
        ? codec.getSubcodecs()[0].getKnownTypeName()
        : undefined,
      false,
      !nested ? inspectorOverrideStyles : undefined,
      100
    ).body;
  }
  switch (kind) {
    case "set":
      return (
        <>
          {"{"}
          {(value as any[]).map((item, i) => (
            <Fragment key={i}>
              {i !== 0 ? ", " : null}
              {renderCellValue(item, codec.getSubcodecs()[0], true)}
            </Fragment>
          ))}
          {"}"}
        </>
      );
    case "array":
      return (
        <>
          [
          {(value as any[]).map((item, i) => (
            <Fragment key={i}>
              {i !== 0 ? ", " : null}
              {renderCellValue(item, codec.getSubcodecs()[0], true)}
            </Fragment>
          ))}
          ]
        </>
      );
    case "tuple":
      return (
        <>
          (
          {(value as any[]).map((item, i) => (
            <Fragment key={i}>
              {i !== 0 ? ", " : null}
              {renderCellValue(item, codec.getSubcodecs()[i], true)}
            </Fragment>
          ))}
          )
        </>
      );
    case "namedtuple": {
      const fieldNames = (codec as NamedTupleCodec).getNames();
      const subCodecs = codec.getSubcodecs();
      return (
        <>
          (
          {fieldNames.map((name, i) => (
            <Fragment key={i}>
              {i !== 0 ? ", " : null}
              {name}
              {" := "}
              {renderCellValue(value[name], subCodecs[i], true)}
            </Fragment>
          ))}
          )
        </>
      );
    }
    default:
      return <></>;
  }
}
