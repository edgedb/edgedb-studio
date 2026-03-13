import {
  Box2D,
  Box3D,
  ConfigMemory,
  DateDuration,
  Duration,
  Float16Array,
  LocalDate,
  LocalDateTime,
  LocalTime,
  parseWKT,
  RelativeDuration,
  SparseVector,
} from "@dbsof/platform/client";

const parsers: {
  [typename: string]: (val: string, typeArgs: string[] | null) => any;
} = {
  "std::str": (val: string) => val,
  "std::json": (val: string) => val,
  "std::bool": (val: string) => {
    return val !== "" && val !== "false";
  },
  "std::int16": (val: string) => {
    if (!/^-?[0-9]+$/.test(val)) {
      throw new Error("Invalid integer");
    }
    const int = parseInt(val, 10);
    if (int < -32768 || int > 32767) {
      throw new Error("Integer out of range");
    }
    return int;
  },
  "std::int32": (val: string) => {
    if (!/^-?[0-9]+$/.test(val)) {
      throw new Error("Invalid integer");
    }
    const int = parseInt(val, 10);
    if (int < -2147483648 || int > 2147483647) {
      throw new Error("Integer out of range");
    }
    return int;
  },
  "std::int64": (val: string) => {
    if (!/^-?[0-9]+$/.test(val)) {
      throw new Error("Invalid integer");
    }
    const int = BigInt(val);
    if (
      int < BigInt("-9223372036854775808") ||
      int > BigInt("9223372036854775807")
    ) {
      throw new Error("Integer out of range");
    }
    return int;
  },
  "std::float32": (val: string) => {
    const float = Number(val);
    if (Number.isNaN(float)) {
      throw new Error("Invalid float");
    }
    return float;
  },
  "std::float64": (val: string) => {
    const float = Number(val);
    if (Number.isNaN(float)) {
      throw new Error("Invalid float");
    }
    return float;
  },
  "std::bigint": (val: string) => {
    try {
      return BigInt(val);
    } catch {
      throw new Error("Invalid bigint");
    }
  },
  "std::decimal": (val: string) => {
    if (!/^-?[0-9]+.[0-9]+([eE][-+]?[0-9]+)?$/.test(val)) {
      throw new Error("Invalid decimal");
    }
    return val;
  },
  "std::uuid": (val: string) => {
    if (
      !/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(
        val
      )
    ) {
      throw new Error("Invalid uuid");
    }
    return val;
  },
  "std::bytes": (val: string) => {
    const bytes: number[] = [];
    const bytesRegex = /\\[tnr\\]|\\x[0-9a-fA-F]{2}|[\x20-\x5b\x5d-\x7e]/g;
    let lastIndex = 0;
    let match;
    while ((match = bytesRegex.exec(val)) !== null) {
      if (lastIndex !== match.index) {
        throw new Error("Invalid bytes");
      }
      if (match[0].startsWith("\\")) {
        switch (match[0][1]) {
          case "x":
            bytes.push(parseInt(match[0].slice(2), 16));
            break;
          case "t":
            bytes.push(9);
            break;
          case "n":
            bytes.push(10);
            break;
          case "r":
            bytes.push(13);
            break;
          case "\\":
            bytes.push(92);
            break;
        }
      } else {
        bytes.push(match[0].charCodeAt(0));
      }
      lastIndex = match.index + match[0].length;
    }
    return new Uint8Array(bytes);
  },
  "std::datetime": (val: string) => {
    const date = new Date(val);
    const match = val.match(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(?:Z|[+-]\d{2}(?::\d{2})?)$/
    );
    if (Number.isNaN(date.getTime()) || !match) {
      throw new Error(
        "Invalid datetime, expected format: [YYYY]-[MM]-[DD]T[HH]:[MM]:[SS][+|-][HH]:[MM]"
      );
    }
    const year = date.getUTCFullYear();
    if (year < 1 || year > 9999) {
      throw new Error("Year must be between 1 and 9999");
    }
    const fSeconds = (match[1] ?? "").padEnd(6, "0");

    return new LocalDateTime(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      Number(fSeconds.slice(0, 3)),
      Number(fSeconds.slice(3, 6))
    );
  },
  "cal::local_datetime": (val: string) => {
    const [_match, _year, month, day, hour, minute, second, _fSeconds] =
      val.match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/
      ) ?? [];
    if (!_match) {
      throw new Error(
        "invalid local datetime, expected format: [YYYY]-[MM]-[DD]T[HH]:[MM]:[SS]"
      );
    }
    const fSeconds = (_fSeconds ?? "").padEnd(6, "0");
    const year = Number(_year);

    if (year < 1 || year > 9999) {
      throw new Error("Year must be between 1 and 9999");
    }

    return new LocalDateTime(
      year,
      Number(month),
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      Number(fSeconds.slice(0, 3)),
      Number(fSeconds.slice(3, 6))
    );
  },
  "cal::local_date": (val: string) => {
    const [_match, _year, month, day] =
      val.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
    if (!_match) {
      throw new Error("invalid local date, expected format: [YYYY]-[MM]-[DD]");
    }
    const year = Number(_year);

    if (year < 1 || year > 9999) {
      throw new Error("Year must be between 1 and 9999");
    }

    return new LocalDate(year, Number(month), Number(day));
  },
  "cal::local_time": (val: string) => {
    const [_match, hour, minute, second, _fSeconds] =
      val.match(/^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/) ?? [];
    if (!_match) {
      throw new Error("invalid local time, expected format: [HH]:[MM]:[SS]");
    }
    const fSeconds = (_fSeconds ?? "").padEnd(6, "0");

    return new LocalTime(
      Number(hour),
      Number(minute),
      Number(second),
      Number(fSeconds.slice(0, 3)),
      Number(fSeconds.slice(3, 6))
    );
  },
  "std::duration": (val: string) => {
    let duration: Duration;
    try {
      duration = Duration.from(val);
    } catch {
      throw new Error("Invalid duration");
    }
    for (const field of ["years", "months", "weeks", "days"]) {
      if ((duration as any)[field] !== 0) {
        throw new Error(`duration cannot contain ${field}`);
      }
    }
    return duration;
  },
  "cal::relative_duration": (val: string) => {
    let d: Duration;
    try {
      d = Duration.from(val.toLowerCase().includes("t") ? val : `${val}T0S`);
    } catch {
      throw new Error("Invalid relative duration");
    }
    for (const field of ["nanoseconds"]) {
      if ((d as any)[field] !== 0) {
        throw new Error(`relative duration cannot contain ${field}`);
      }
    }
    return new RelativeDuration(
      d.years,
      d.months,
      d.weeks,
      d.days,
      d.hours,
      d.minutes,
      d.seconds,
      d.milliseconds,
      d.microseconds
    );
  },
  "cal::date_duration": (val: string) => {
    let d: Duration;
    try {
      d = Duration.from(val.toLowerCase().includes("t") ? val : `${val}T0S`);
    } catch {
      throw new Error("Invalid date duration");
    }
    for (const field of [
      "hours",
      "minutes",
      "seconds",
      "milliseconds",
      "microseconds",
      "nanoseconds",
    ]) {
      if ((d as any)[field] !== 0) {
        throw new Error(`date duration cannot contain ${field}`);
      }
    }
    return new DateDuration(d.years, d.months, d.weeks, d.days);
  },
  "cfg::memory": (val: string) => {
    const [_match, size, unit] = val.match(/^(\d+)(B|[KMGTP]iB)$/) ?? [];
    if (!_match) {
      throw new Error("invalid config memory");
    }
    let bytes = BigInt(size);
    for (
      let i = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"].indexOf(unit);
      i > 0;
      i--
    ) {
      bytes = bytes * BigInt(1024);
    }
    return new ConfigMemory(bytes);
  },
  "ext::pgvector::vector": (val: string, typeArgs) => {
    return Float32Array.from(_parseFloatArray(val, typeArgs));
  },
  "ext::pgvector::halfvec": (val: string, typeArgs) => {
    return Float16Array.from(_parseFloatArray(val, typeArgs));
  },
  "ext::pgvector::sparsevec": (val: string) => {
    let objMode = false;
    val = val.trim();
    if (val.startsWith("{")) {
      val = val.replace(/^\{|\}$/g, "");
      objMode = true;
    } else {
      val = val.replace(/^\[|\]$/g, "");
    }
    const parts = val.split(",");
    if (parts[0].includes(":")) {
      objMode = true;
    }

    let length: number | null = null;
    const map: Record<number, number> = {};
    if (objMode) {
      for (const part of parts) {
        let [index, val] = part.split(":");
        val = val?.trim();
        if (!val) {
          throw new Error(`Invalid index:val pair '${part}'`);
        }
        index = index.trim();
        if (
          (index.startsWith(`"`) || index.startsWith(`'`)) &&
          index[index.length - 1] === index[0]
        ) {
          index = index.slice(1, -1);
        }
        if (index === "dim" && length === null) {
          const len = Number(val);
          if (Number.isNaN(len) || !Number.isInteger(len)) {
            throw new Error(`Invalid vector length '${val}'`);
          }
          length = len;
        } else {
          const indexInt = Number(index);
          if (Number.isNaN(indexInt) || !Number.isInteger(indexInt)) {
            throw new Error(`Invalid index '${index}'`);
          }
          const float = Number(val);
          if (Number.isNaN(float) || !val.trim()) {
            throw new Error(`Invalid float value '${val}' for index ${index}`);
          }
          map[indexInt] = float;
        }
      }
      if (length === null) {
        throw new Error(`Expected 'dim' key`);
      }
    } else {
      let i = 0;
      for (const part of parts) {
        const float = Number(part.trim());
        if (Number.isNaN(float) || !part.trim()) {
          throw new Error(`Invalid float value`);
        }
        if (float !== 0) {
          map[i] = float;
        }
        i++;
      }
      length = parts.length;
    }

    return new SparseVector(length, map);
  },
  "ext::postgis::geometry": (val: string) => {
    return parseWKT(val);
  },
  "ext::postgis::geography": (val: string) => {
    return parseWKT(val);
  },
  "ext::postgis::box2d": (val: string) => {
    return _parseBox(val, false);
  },
  "ext::postgis::box3d": (val: string) => {
    return _parseBox(val, true);
  },
};
parsers["std::cal::local_time"] = parsers["cal::local_time"];
parsers["std::cal::local_date"] = parsers["cal::local_date"];
parsers["std::cal::local_datetime"] = parsers["cal::local_datetime"];
parsers["std::cal::relative_duration"] = parsers["cal::relative_duration"];
parsers["std::cal::date_duration"] = parsers["cal::date_duration"];

export {parsers};

function _parseFloatArray(val: string, typeArgs: string[] | null): number[] {
  const vec = val
    .trim()
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((num) => {
      const float = Number(num);
      if (Number.isNaN(float) || num.trim() === "") {
        throw new Error(`Invalid float "${num}" in vector`);
      }
      return float;
    });

  if (typeArgs?.[0] && vec.length !== Number(typeArgs[0])) {
    throw new Error(
      `invalid vector length ${vec.length}, expected ${typeArgs[0]}`
    );
  }

  return vec;
}

const _num = "-?[0-9]+(?:\\.[0-9]+)?";
const box2dRegex = new RegExp(
  `^box\\(\\s*(${_num})\\s+(${_num})\\s*,\\s*(${_num})\\s+(${_num})\\s*\\)$`,
  "i"
);
const box3dRegex = new RegExp(
  `^box3d\\(\\s*(${_num})\\s+(${_num})\\s+(${_num})\\s*,\\s*(${_num})\\s+(${_num})\\s+(${_num})\\s*\\)$`,
  "i"
);
function _parseBox(val: string, box3d: boolean): Box2D | Box3D {
  const m = val.trim().match(box3d ? box3dRegex : box2dRegex);
  if (!m) {
    throw new Error(`invalid ${box3d ? "box3d" : "box2d"}`);
  }
  return box3d
    ? new Box3D(
        [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])],
        [parseFloat(m[4]), parseFloat(m[5]), parseFloat(m[6])]
      )
    : new Box2D(
        [parseFloat(m[1]), parseFloat(m[2])],
        [parseFloat(m[3]), parseFloat(m[4])]
      );
}
