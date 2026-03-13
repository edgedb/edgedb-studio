export class _ReadBuffer {
  private view: DataView;
  private _offset = 0;
  constructor(private buf: Uint8Array = new Uint8Array()) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  static alloc() {
    return new _ReadBuffer();
  }
  get length() {
    return this.buf.byteLength - this._offset;
  }
  readUInt8() {
    const val = this.view.getUint8(this._offset);
    this._offset += 1;
    return val;
  }
  readUInt32() {
    const val = this.view.getUint32(this._offset);
    this._offset += 4;
    return val;
  }
  sliceInto(target: _ReadBuffer, len: number) {
    const slice = this.buf.slice(this._offset, this._offset + len);
    target.reset(slice);
    this._offset += len;
  }
  discard(len: number) {
    this._offset = Math.min(this._offset + len, this.buf.byteLength);
  }
  reset(buf: Uint8Array) {
    this.buf = buf;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    this._offset = 0;
  }
}

export interface _ICodec {
  tid?: string;
  decode(buf: _ReadBuffer, _ctx?: any): any;
}

class DummyCodec implements _ICodec {
  tid = "dummy";
  decode() {
    return null;
  }
}

export class _CodecsRegistry {
  buildCodec(): _ICodec {
    return new DummyCodec();
  }
}

export namespace Codecs {
  export type JsonCodec = {
    fromDatabase(data: any): any;
    toDatabase(data: any): any;
  };
  export type DateTimeCodec = JsonCodec;
}

export type ProtocolVersion = [number, number];
export type QueryArgs = Record<string, unknown> | undefined;

export class Options {
  static defaults() {
    return new Options();
  }
  withCodecs(_codecs: Record<string, any>) {
    return this;
  }
  withGlobals(_globals: Record<string, any>) {
    return this;
  }
  withConfig(_config: Record<string, any>) {
    return this;
  }
  makeCodecContext() {
    return {};
  }
}

export class MultiRange {}
export class Range {}
export class LocalDateTime {
  constructor(
    public year: number,
    public month: number,
    public day: number,
    public hour: number,
    public minute: number,
    public second: number,
    public millisecond: number,
    public microsecond = 0,
    public nanosecond = 0
  ) {}
}

class BaseError extends Error {}
export class AuthenticationError extends BaseError {}
export class DuplicateDatabaseDefinitionError extends BaseError {}
export class CardinalityViolationError extends BaseError {}
export class AccessError extends BaseError {}
export class UnknownDatabaseError extends BaseError {}
export class Duration {}
export class RelativeDuration {}
export class DateDuration {}
export class LocalDate {}
export class LocalTime {}
export class ConfigMemory {}
export class Float16Array {}
export class SparseVector {}
export function parseWKT(input: string) {
  return input;
}
export class ClientError extends BaseError {}
export class TransactionConflictError extends BaseError {}
export const SHOULD_RETRY = Symbol("SHOULD_RETRY");
export enum DriverCardinality {
  MANY = 0,
  AT_LEAST_ONE = 1,
  ONE = 2,
  AT_MOST_ONE = 3,
}
export enum Cardinality {
  MANY = 0,
  AT_LEAST_ONE = 1,
  ONE = 2,
  AT_MOST_ONE = 3,
}
export enum OutputFormat {
  BINARY = "binary",
}

export enum Language {
  SQL = "sql",
}

export enum Capabilities {
  NONE = 0,
  MODIFICATONS = 1 << 0,
  DDL = 1 << 1,
  PERSISTENT_CONFIG = 1 << 2,
}

export class OptionsWithAnnotations extends Options {
  annotations = new Map<string, string>();
}

export class AdminUIFetchConnection {
  static create() {
    return new AdminUIFetchConnection();
  }
  protocolVersion: ProtocolVersion = [1, 0];
  queryCodecCache = new LRU<string, [number, _ICodec, _ICodec, number]>({
    capacity: 10,
  });
  rawParse(): Promise<any[]> {
    return Promise.resolve([null, null, new DummyCodec(), new DummyCodec(), 0, null, new Uint8Array(), []]);
  }
  rawExecute(): Promise<[Uint8Array]> {
    return Promise.resolve([new Uint8Array()]);
  }
}

export type ConnectionOptions = Options;
export const localDateInstances = new WeakMap<LocalDateTime, Date>();
export class LRU<K, V> {
  private map = new Map<K, V>();
  constructor(public readonly options: {capacity: number}) {}
  has(key: K) {
    return this.map.has(key);
  }
  get(key: K) {
    return this.map.get(key);
  }
  set(key: K, value: V) {
    if (this.map.size >= this.options.capacity) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
    this.map.set(key, value);
  }
}
export default LRU;

export const ErrorAttr = {} as const;
export const utf8Decoder = new TextDecoder();
export function encodeB64(value: string) {
  return btoa(value);
}
export class ReadBuffer extends _ReadBuffer {}
export class WriteBuffer {}
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export class EnumCodec {}
export enum CodecKind {}
export class NamedTupleCodec {}
export class MultiRangeCodec {}
export class RangeCodec {}
export class ObjectCodec {}
export class SetCodec {}
export class RecordCodec {}
export class Geometry {}
export class Box2D {}
export class Box3D {}
export const PostGIS = {} as const;
export class Event {}
export const cryptoUtils = {} as const;

export type CodecKindType =
  | "scalar"
  | "object"
  | "namedtuple"
  | "record"
  | "set"
  | "array"
  | "tuple"
  | "range"
  | "multirange";

class SimpleScalarCodec implements _ICodec {
  constructor(private name: string) {}
  getKind() {
    return "scalar" as CodecKindType;
  }
  getKnownTypeName() {
    return this.name;
  }
  getSubcodecs() {
    return [];
  }
}

type SimpleField = {name: string; implicit?: boolean};

export class SimpleObjectCodec implements _ICodec {
  constructor(private fields: SimpleField[]) {}
  getKind() {
    return "object" as CodecKindType;
  }
  getSubcodecs() {
    return this.fields.map(() => new SimpleScalarCodec("std::str"));
  }
  getFields() {
    return this.fields.map((f, i) => ({
      name: f.name,
      implicit: !!f.implicit,
      getColumnName() {
        return f.name;
      },
      hasSubtypes() {
        return false;
      },
      isMandatory() {
        return true;
      },
      allowNull() {
        return true;
      },
      isImplicit() {
        return !!f.implicit;
      },
      subtypesDepth() {
        return 0;
      },
      implicitDefaultDepth() {
        return 0;
      },
      card: 1,
      kind: "property",
      required: false,
      parentField: i,
      hasServerDefault() {
        return false;
      },
      getSharedParentTypeIndexes() {
        return [];
      },
    }));
  }
}

export function buildObjectCodec(columns: string[]) {
  return new SimpleObjectCodec(columns.map((name) => ({name})));
}


const env =
  (typeof import.meta !== "undefined" && (import.meta as any).env) ||
  ({} as Record<string, string | undefined>);

export const mockMode = env.VITE_USE_MOCKS !== "false";

export function getHTTPSCRAMAuth(
  _cryptoUtils?: typeof cryptoUtils
): ((
  serverUrl: string,
  username: string,
  password: string
) => Promise<string>) {
  return async (_serverUrl: string, username: string, _password: string) => {
    const user = username?.trim() || "user";
    return Promise.resolve(`mock-token-${user}`);
  };
}
