import React, {PropsWithChildren} from "react";
import {LocalDateTime, _ICodec} from "edgedb";

import cn from "@edgedb/common/utils/classNames";

import {EnumCodec} from "edgedb/dist/codecs/enum";

import {Item, ItemType} from "./buildItem";

import styles from "./inspector.module.scss";

export function buildScalarItem(
  base: {
    id: string;
    parent: Item | null;
    level: number;
    codec: _ICodec;
    label?: JSX.Element;
  },
  data: any,
  comma?: boolean
): Item {
  const {body, height} = renderValue(
    data,
    base.codec.getKnownTypeName(),
    base.codec instanceof EnumCodec
  );

  return {
    ...base,
    type: ItemType.Scalar,
    height: height,
    body: (
      <>
        {body}
        {comma ? "," : ""}
      </>
    ),
  };
}

type TagProps = {
  name: string;
};

function ScalarTag({name, children}: PropsWithChildren<TagProps>) {
  return (
    <span className={styles.scalar_tag}>
      <span className={styles.scalar_tag_open}>{"<"}</span>
      <span className={styles.scalar_tag_name}>{name}</span>
      <span className={styles.scalar_tag_close}>{">"}</span>
      {children}
    </span>
  );
}

export function renderValue(
  value: any,
  knownTypeName: string,
  isEnum: boolean,
  showTypeTag: boolean = true,
  overrideStyles: {[key: string]: string} = {}
): {body: JSX.Element; height?: number} {
  if (value == null) {
    return {body: <span className={styles.scalar_empty}>{"{}"}</span>};
  }

  const Tag = showTypeTag
    ? ScalarTag
    : ({children}: PropsWithChildren<{}>) => <>{children}</>;

  switch (knownTypeName) {
    case "std::bigint":
    case "std::decimal":
      return {
        body: (
          <span className={styles.scalar_number}>
            {value.toString()}
            <span className={styles.scalar_mod}>n</span>
          </span>
        ),
      };
    case "std::int16":
    case "std::int32":
    case "std::int64":
    case "std::float64":
      return {
        body: <span className={styles.scalar_number}>{value.toString()}</span>,
      };
    case "std::float32":
      // https://en.wikipedia.org/wiki/Single-precision_floating-point_format
      // 23 bits of significand + 1 implicit bit = 24 bits of precision
      // log10(2**24) = 7.225... so 7 decimal digits of precision
      return {
        body: (
          <span className={styles.scalar_number}>
            {(value as number).toPrecision(7).replace(/\.?0+$/, "")}
          </span>
        ),
      };
    case "std::bool":
      return {
        body: (
          <span className={styles.scalar_boolean}>
            {JSON.stringify(value)}
          </span>
        ),
      };
    case "std::uuid":
      return {
        body: (
          <Tag name="uuid">
            <span className={cn(styles.scalar_string, overrideStyles.uuid)}>
              {formatUUID(value.toString())}
            </span>
          </Tag>
        ),
      };
    case "std::datetime":
      return {
        body: (
          <Tag name={knownTypeName}>
            <span className={styles.scalar_string}>
              {formatDatetime(value)}
            </span>
          </Tag>
        ),
      };
    case "cal::local_datetime":
    case "cal::local_time":
    case "cal::local_date":
    case "std::duration":
      return {
        body: (
          <Tag name={knownTypeName}>
            <span className={styles.scalar_string}>{value.toString()}</span>
          </Tag>
        ),
      };

    case "std::json":
      value = prettyPrintJSON(value);
    case "std::str": {
      const str = strToString(value);
      return {
        body: <span className={styles.scalar_string}>{str}</span>,
        height: str.split("\n").length,
      };
    }
  }

  if (value instanceof Buffer) {
    return {
      body: (
        <span className={styles.scalar_bytes}>
          <span className={styles.scalar_mod}>b</span>
          {bufferToString(value)}
        </span>
      ),
    };
  }

  if (isEnum) {
    return {
      body: (
        <span>
          {showTypeTag ? (
            <span className={styles.typeName}>{knownTypeName}.</span>
          ) : null}
          <b>{value.toString()}</b>
        </span>
      ),
    };
  }

  return {
    body: (
      <Tag name={knownTypeName}>
        <b>{value.toString()}</b>
      </Tag>
    ),
  };
}

export function scalarItemToString(item: any, typename: string): string {
  switch (typename) {
    case "std::uuid":
      return formatUUID(item);
    case "std::bytes":
      return bufferToString(item);
    case "std::json":
      return prettyPrintJSON(item);
    case "std::datetime":
      return formatDatetime(item);
    default:
      return item.toString();
  }
}

export function formatUUID(uuid: string): string {
  return (
    uuid.slice(0, 8) +
    "-" +
    uuid.slice(8, 12) +
    "-" +
    uuid.slice(12, 16) +
    "-" +
    uuid.slice(16, 20) +
    "-" +
    uuid.slice(20)
  );
}

function formatDatetime(date: LocalDateTime): string {
  return date.toString() + "+00:00";
}

function bufferToString(buf: Buffer): string {
  const res = [];
  for (let i = 0; i < buf.length; i++) {
    const char = buf[i];
    if (char < 32 || char > 126) {
      switch (char) {
        case 9:
          res.push("\\t");
          break;
        case 10:
          res.push("\\n");
          break;
        case 13:
          res.push("\\r");
          break;
        default:
          res.push(`\\x${char.toString(16).padStart(2, "0").toLowerCase()}`);
      }
    } else if (char === 34) {
      res.push('\\"');
    } else {
      res.push(String.fromCharCode(char));
    }
  }
  return `"${res.join("")}"`;
}

function strToString(value: string): string {
  const escape = (str: string) => {
    const split = str.split(/(\n|\\\\|\\')/g);
    if (split.length === 1) {
      return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    }

    const ret = [];
    for (let i = 0; i < split.length; i++) {
      if (i % 2) {
        ret.push(split[i]);
      } else {
        ret.push(split[i].replace(/\\/g, "\\\\").replace(/'/g, "\\'"));
      }
    }

    return ret.join("");
  };

  return escape(value);
}

export function prettyPrintJSON(
  json: string,
  indentSpaces: number = 2
): string {
  let pretty = "";
  let i = 0;
  let lasti = 0;
  let indent = 0;
  while (i < json.length) {
    switch (json[i]) {
      case "{":
      case "[":
        pretty +=
          "".padStart(indent * indentSpaces, " ") +
          json.slice(lasti, i + 1).trim();
        lasti = i + 1;

        if (json[i + 1] === (json[i] === "{" ? "}" : "]")) {
          pretty += "]";
          lasti++;
          i++;
        } else {
          pretty += "\n";
          indent++;
        }
        break;
      case "}":
      case "]":
        pretty +=
          "".padStart(indent * indentSpaces, " ") +
          json.slice(lasti, i).trim() +
          "\n";
        indent--;
        pretty += json[i].padStart(indent * indentSpaces + 1, " ");
        lasti = i + 1;
        break;
      case ",":
        const line = json.slice(lasti, i).trim();
        if (line) {
          pretty += "".padStart(indent * indentSpaces, " ") + line;
        }
        pretty += ",\n";
        lasti = i + 1;
        break;
      case '"':
        while (true) {
          i = json.indexOf('"', i + 1);
          if (json[i - 1] !== "\\") break;
        }
    }
    i++;
  }
  pretty += json.slice(lasti);
  return pretty;
}
