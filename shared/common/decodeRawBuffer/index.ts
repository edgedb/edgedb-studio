import {_CodecsRegistry, _ReadBuffer, _ICodec, Options} from "@dbsof/platform/client";
import type {ProtocolVersion} from "@dbsof/platform/client";

export type ResultSet = Array<any> & {_codec: _ICodec};

export function decode(
  registry: InstanceType<typeof _CodecsRegistry>,
  outCodecBuf: Uint8Array,
  resultBuf: Uint8Array,
  options: Options,
  protocolVersion: ProtocolVersion = [0, 10]
): ResultSet | null {
  let result: ResultSet | null = null;

  if (outCodecBuf.length) {
    const codec = registry.buildCodec(outCodecBuf, protocolVersion);

    result = new Array() as ResultSet;

    const buf = new _ReadBuffer(resultBuf);
    const codecReadBuf = _ReadBuffer.alloc();
    while (buf.length > 0) {
      const msgType = buf.readUInt8();
      const len = buf.readUInt32();

      if (msgType !== 68 || len <= 4) {
        throw new Error("invalid data packet");
      }

      buf.sliceInto(codecReadBuf, len - 4);
      codecReadBuf.discard(6);
      const val = codec.decode(codecReadBuf, options.makeCodecContext());
      result.push(val);
    }

    result._codec = codec;
  }

  return result;
}
