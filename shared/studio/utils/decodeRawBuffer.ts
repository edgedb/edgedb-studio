import {_CodecsRegistry, Codecs, LocalDateTime} from "@dbsof/platform/client";
import {Options} from "@dbsof/platform/client";
import {ProtocolVersion, QueryArgs} from "@dbsof/platform/client";
import {decode as _decode, ResultSet} from "@dbsof/common/decodeRawBuffer";
import {localDateInstances} from "@dbsof/platform/client";

export type {ResultSet};

function newCodecsRegistry() {
  return new _CodecsRegistry();
}

export const codecsRegistry = newCodecsRegistry();

const jsonCodec: Codecs.JsonCodec = {
  fromDatabase(data) {
    return data;
  },
  toDatabase(data: string) {
    return data;
  },
};

const datetimeCodec: Codecs.DateTimeCodec = {
  fromDatabase(data) {
    const bi_ms = data / BigInt(1000);
    let us = Number(data - bi_ms * BigInt(1000));
    let ms = Number(bi_ms);
    if (us < 0) {
      us += 1000;
      ms -= 1;
    }

    const date = new Date(ms);
    return new LocalDateTime(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
      us
    );
  },
  toDatabase(data: LocalDateTime) {
    const ms = BigInt(localDateInstances.get(data)!.getTime());
    let us =
      ms * BigInt(1000) +
      BigInt(
        data.hour * 36e8 +
          data.minute * 6e7 +
          data.second * 1e6 +
          data.millisecond * 1e3 +
          data.microsecond
      );

    if (
      (data.nanosecond === 500 && Math.abs(data.microsecond) % 2 === 1) ||
      data.nanosecond > 500
    ) {
      us += BigInt(1);
    }

    return us;
  },
};

export const baseOptions = Options.defaults().withCodecs({
  "std::int64": {
    fromDatabase(data) {
      return data;
    },
    toDatabase(data: bigint) {
      return data;
    },
  },
  "std::datetime": datetimeCodec,
  "std::pg::timestamptz": datetimeCodec,
  "std::json": jsonCodec,
  "std::pg::json": jsonCodec,
});

export function decode(
  outCodecBuf: Uint8Array,
  resultBuf: Uint8Array,
  options: Options,
  protocolVersion: ProtocolVersion,
  newCodec: boolean = false
): ResultSet | null {
  return _decode(
    newCodec ? newCodecsRegistry() : codecsRegistry,
    outCodecBuf,
    resultBuf,
    options,
    protocolVersion
  );
}

export type QueryParams = QueryArgs;
