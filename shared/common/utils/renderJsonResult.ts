import {
  Float16Array,
  SparseVector,
  type _ICodec as ICodec,
  Geometry,
} from "@dbsof/platform/client";
import type {ObjectCodec} from "@dbsof/platform/client";
import type {NamedTupleCodec} from "@dbsof/platform/client";

export function renderResultAsJson(
  result: any,
  codec: ICodec,
  implicitLimit: number | null
): string {
  return `[\n${(implicitLimit != null
    ? (result as any[]).slice(0, implicitLimit)
    : (result as any[])
  )
    .map((item) => "  " + _renderToJson(item, codec, "  ", implicitLimit))
    .join(",\n")}\n]`;
}

export function _renderToJson(
  val: any,
  codec: ICodec,
  depth: string,
  implicitLimit: number | null
): string {
  if (val == null) {
    return "null";
  }

  const codecKind = codec.getKind();

  switch (codecKind) {
    case "scalar": {
      const typename = codec.getKnownTypeName();
      switch (typename) {
        case "std::int16":
        case "std::int32":
        case "std::int64":
        case "std::float32":
        case "std::float64":
        case "std::bigint":
        case "std::decimal":
        case "std::bool":
          return val.toString();
        case "std::bytes":
          return `"${val.toString("base64")}"`;
        default:
          if (val instanceof Float32Array) {
            return float32ArrayToString(val);
          }
          if (val instanceof Float16Array) {
            return float16ArrayToString(val);
          }
          if (val instanceof SparseVector) {
            return _renderSparseVectorToJSON(val);
          }
          return JSON.stringify(scalarItemToString(val, typename));
      }
    }
    case "range": {
      return _renderRangeToJSON(val, codec, depth, implicitLimit);
    }
    case "multirange": {
      return `[${[...val]
        .map((range) => _renderRangeToJSON(range, codec, depth, implicitLimit))
        .join(", ")}]`;
    }
    case "set":
    case "array":
    case "tuple": {
      const subcodecs = codec.getSubcodecs();
      return `[\n${(implicitLimit != null && codecKind === "set"
        ? (val as any[]).slice(0, implicitLimit)
        : (val as any[])
      )
        .map(
          (item, i) =>
            depth +
            "  " +
            _renderToJson(
              item,
              subcodecs[codecKind === "tuple" ? i : 0],
              depth + "  ",
              implicitLimit
            )
        )
        .join(",\n")}\n${depth}]`;
    }
    case "object":
    case "namedtuple":
    case "record": {
      const subcodecs = codec.getSubcodecs();
      const explicitNum =
        codecKind === "object"
          ? (codec as ObjectCodec).getFields().filter((f) => !f.implicit)
              .length
          : 0;
      const fields =
        codecKind === "object"
          ? (codec as ObjectCodec)
              .getFields()
              .map((f) =>
                f.implicit && !(explicitNum === 0 && f.name === "id")
                  ? null
                  : f.name
              )
          : (codec as NamedTupleCodec).getNames();
      return `{\n${fields
        .flatMap((fieldName, i) =>
          fieldName
            ? [
                depth +
                  `  "${fieldName}": ` +
                  _renderToJson(
                    val[fieldName],
                    subcodecs[i],
                    depth + "  ",
                    implicitLimit
                  ),
              ]
            : []
        )
        .join(",\n")}\n${depth}}`;
    }
    case "sparse_object":
      throw new Error("unexpected sparse_object");
  }
}

function _renderRangeToJSON(
  val: any,
  codec: ICodec,
  depth: string,
  implicitLimit: number | null
) {
  if (val.isEmpty) {
    return `{"empty": true}`;
  }
  const subcodec = codec.getSubcodecs()[0];
  return `{"lower": ${_renderToJson(
    val.lower,
    subcodec,
    depth,
    implicitLimit
  )}, "upper": ${_renderToJson(
    val.upper,
    subcodec,
    depth,
    implicitLimit
  )}, "inc_lower": ${val.incLower ? "true" : "false"}, "inc_upper": ${
    val.incUpper ? "true" : "false"
  }}`;
}

function _renderSparseVectorToJSON(val: SparseVector): string {
  return `{${[...val.indexes]
    .map(
      (index, i) =>
        `"${index}": ${val.values[i]
          .toPrecision(7)
          .replace(/(\.\d*?)0+$/, (_, $1) => ($1 === "." ? "" : $1))}`
    )
    .join(", ")}, "dim": ${val.length}}`;
}

export function scalarItemToString(item: any, typename: string): string {
  if (item instanceof Float32Array) {
    return float32ArrayToString(item);
  }
  if (item instanceof Float16Array) {
    return float16ArrayToString(item);
  }
  switch (typename) {
    case "std::bytes":
      return bufferToString(item);
    case "std::json":
      return prettyPrintJSON(item);
    case "std::datetime":
      return formatDatetime(item);
    case "ext::postgis::geometry":
    case "ext::postgis::geography":
      return (item as Geometry).toWKT(2);
    default:
      return item.toString();
  }
}

export function formatDatetime(date: Date): string {
  return date.toString() + "+00:00";
}

export function bufferToString(buf: Uint8Array): string {
  const res: string[] = [];
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

export function float32ArrayToString(vec: Float32Array | number[]): string {
  return `[${[...vec]
    .map((float) =>
      float
        .toPrecision(7)
        .replace(/(\.\d*?)0+$/, (_, $1) => ($1 === "." ? "" : $1))
    )
    .join(", ")}]`;
}

export function float16ArrayToString(vec: Float16Array | number[]): string {
  return `[${[...vec]
    .map((float) =>
      float
        .toPrecision(4)
        .replace(/(\.\d*?)0+$/, (_, $1) => ($1 === "." ? "" : $1))
    )
    .join(", ")}]`;
}

export function sparseVectorToString(vec: SparseVector | number[]): string {
  return float32ArrayToString([...vec]);
}

export function prettyPrintJSON(
  json: string,
  indentSpaces: number = 2
): string {
  const switchRegex = /["{}[\],]/g;
  let pretty = "";
  let i = 0;
  let lasti = 0;
  let indent = 0;
  while (i < json.length) {
    switchRegex.lastIndex = i;
    if (!switchRegex.exec(json)) {
      break;
    }
    i = switchRegex.lastIndex - 1;
    switch (json[i]) {
      case "{":
      case "[":
        pretty +=
          "".padStart(indent * indentSpaces, " ") +
          json.slice(lasti, i + 1).trim();
        lasti = i + 1;

        if (json[i + 1] === (json[i] === "{" ? "}" : "]")) {
          pretty += json[i + 1];
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
        const strRegex = /\\*"/g;
        strRegex.lastIndex = i + 1;
        while (true) {
          const match = strRegex.exec(json);
          if (!match) {
            throw new Error("Cannot pretty print json");
          }
          if (match[0].length % 2 === 1) {
            i = strRegex.lastIndex - 1;
            break;
          }
        }
    }
    i++;
  }
  pretty += json.slice(lasti);
  return pretty;
}
