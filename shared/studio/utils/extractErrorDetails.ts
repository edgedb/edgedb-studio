import {ClientLibraryError} from "@dbsof/platform/client";
import {ErrorAttr} from "@dbsof/platform/client";
import {Language} from "@dbsof/platform/client";
import {utf8Decoder} from "@dbsof/platform/client";

export interface ErrorDetails {
  name: string;
  msg: string;
  hint?: string;
  details?: string;
  range?: [number, number];
}

function tryParseInt(val: Uint8Array | string | undefined) {
  if (val == null) return null;
  try {
    return parseInt(
      val instanceof Uint8Array ? utf8Decoder.decode(val) : val,
      10
    );
  } catch {
    return null;
  }
}

function readAttrStr(val: Uint8Array | string | undefined) {
  return val instanceof Uint8Array ? utf8Decoder.decode(val) : val ?? "";
}

export function extractErrorDetails(
  err: any,
  query?: string,
  lang?: Language,
  getObjectTypeNames?: () => string[]
): ErrorDetails {
  if (!(err instanceof Error)) {
    throw new Error(`Fatal Error: cannot handle non error as error: ${err}`);
  }
  const errDetails: ErrorDetails = {
    name: err.name,
    msg: (err as any)._message ?? err.message,
  };

  if ((err as any)._attrs) {
    const attrs = (err as any)._attrs as Map<number, Uint8Array | string>;
    const hint = attrs.get(ErrorAttr.hint);
    if (hint) {
      errDetails.hint = readAttrStr(hint);
    }
    const details = attrs.get(ErrorAttr.details);
    if (details) {
      errDetails.details = readAttrStr(details);
    }

    if (!query) {
      return errDetails;
    }

    const lineStart = tryParseInt(attrs.get(ErrorAttr.lineStart));
    const lineEnd = tryParseInt(attrs.get(ErrorAttr.lineEnd));
    const colStart = tryParseInt(attrs.get(ErrorAttr.utf16ColumnStart));
    const colEnd = tryParseInt(attrs.get(ErrorAttr.utf16ColumnEnd));

    if (
      lineStart != null &&
      lineEnd != null &&
      colStart != null &&
      colEnd != null
    ) {
      const lines = query.split("\n");

      const startLine = lineStart - 1;
      const startLinesLength = lines
        .slice(0, startLine)
        .reduce((sum, line) => sum + line.length + 1, 0);
      const startPos = startLinesLength + colStart;

      const endLinesLength =
        startLinesLength +
        lines
          .slice(startLine, lineEnd - 1)
          .reduce((sum, line) => sum + line.length + 1, 0);
      const endPos = endLinesLength + colEnd;

      errDetails.range = [startPos, endPos];
    } else {
      const charStart = tryParseInt(attrs.get(ErrorAttr.characterStart));
      const charEnd = tryParseInt(attrs.get(ErrorAttr.characterEnd));

      if (charStart != null && charEnd != null) {
        errDetails.range = [charStart, charEnd];
      }
    }
  }

  if (lang === Language.SQL && !errDetails.hint && getObjectTypeNames) {
    const match = errDetails.msg.match(/unknown table `(.*)`/);
    if (match) {
      const name = match[1];
      const typeNames = getObjectTypeNames();
      if (
        name.startsWith('"') &&
        name.endsWith('"') &&
        typeNames.includes(name.slice(1, -1))
      ) {
        errDetails.hint = `Try specifying the module name using SQL syntax: ${name
          .slice(1, -1)
          .split("::")
          .map((part) => (part.toLowerCase() === part ? part : `"${part}"`))
          .join(".")}`;
      } else {
        const colonised = name.replace(".", "::");
        for (const typeName of typeNames) {
          const stripped = typeName.replace(/^default::/, "");
          if (stripped.toLowerCase() === colonised) {
            errDetails.hint = `Try quoting the table name: ${stripped
              .split("::")
              .map((part) =>
                part.toLowerCase() === part ? part : `"${part}"`
              )
              .join(".")}`;
            break;
          }
        }
      }
    }
  }

  return errDetails;
}
