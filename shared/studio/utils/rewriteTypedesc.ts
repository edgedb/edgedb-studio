import {ReadBuffer, WriteBuffer} from "@dbsof/platform/client";

// converts a v1 encoded typedesc to a v2 encoded typedesc
export function rewriteTypedesc(oldDesc: Uint8Array): Uint8Array {
  const oldBuf = new ReadBuffer(oldDesc);

  const typenames = new Map<string, string>();
  const typedescs: [string, Uint8Array][] = [];
  while (oldBuf.length) {
    const descBuf = _rewrite(oldBuf, typenames);
    if (descBuf) {
      typedescs.push(descBuf);
    }
  }

  const newBuf = new WriteBuffer();
  for (const [tid, typedesc] of typedescs) {
    if (typenames.has(tid)) {
      const finalise = newBuf.writeDeferredSize();
      newBuf
        .writeBuffer(typedesc.subarray(0, 17))
        .writeString(typenames.get(tid)!)
        .writeBuffer(typedesc.subarray(21));
      finalise();
    } else {
      newBuf.writeBytes(typedesc);
    }
  }

  return newBuf.unwrap();
}

const CTYPE_SET = 0;
const CTYPE_SHAPE = 1;
const CTYPE_SCALAR = 3;
const CTYPE_TUPLE = 4;
const CTYPE_NAMEDTUPLE = 5;
const CTYPE_ARRAY = 6;
const CTYPE_ENUM = 7;
const CTYPE_INPUT_SHAPE = 8;
const CTYPE_RANGE = 9;
const CTYPE_MULTIRANGE = 12;

function _rewrite(
  oldBuf: ReadBuffer,
  typenames: Map<string, string>
): [string, Uint8Array] | null {
  const t = oldBuf.readUInt8();
  const tid = oldBuf.readUUID();

  if (t >= 0x7f && t <= 0xff) {
    if (t === 0xff) {
      const typeName = oldBuf.readString();
      typenames.set(tid, typeName);
    } else {
      oldBuf.discard(oldBuf.readUInt32());
    }
    return null;
  }

  const newBuf = new WriteBuffer();

  newBuf.writeUInt8(t);
  // @ts-ignore
  oldBuf.pos -= 16;
  newBuf.writeBuffer(oldBuf.readBuffer(16));

  switch (t) {
    case CTYPE_SHAPE:
    case CTYPE_INPUT_SHAPE: {
      if (t === CTYPE_SHAPE) {
        newBuf.writeUInt8(0).writeInt16(-1);
      }

      const els = oldBuf.readUInt16();
      newBuf.writeUInt16(els);
      for (let i = 0; i < els; i++) {
        newBuf.writeBuffer(oldBuf.readBuffer(5));
        newBuf.writeBytes(oldBuf.readBuffer(oldBuf.readUInt32()));
        newBuf.writeUInt16(oldBuf.readUInt16());

        if (t === CTYPE_SHAPE) {
          newBuf.writeInt16(-1);
        }
      }
      break;
    }

    case CTYPE_SET: {
      newBuf.writeUInt16(oldBuf.readUInt16());
      break;
    }

    case CTYPE_SCALAR: {
      const pos = oldBuf.readUInt16();
      newBuf.writeString("").writeUInt8(0).writeUInt16(1).writeUInt16(pos);
      break;
    }

    case CTYPE_ARRAY: {
      newBuf.writeString("").writeUInt8(0).writeUInt16(0);
      newBuf.writeBuffer(oldBuf.readBuffer(8));
      break;
    }

    case CTYPE_TUPLE: {
      newBuf.writeString("").writeUInt8(0).writeUInt16(0);
      const els = oldBuf.readUInt16();
      newBuf.writeUInt16(els).writeBuffer(oldBuf.readBuffer(els * 2));
      break;
    }

    case CTYPE_NAMEDTUPLE: {
      newBuf.writeString("").writeUInt8(0).writeUInt16(0);
      const els = oldBuf.readUInt16();
      newBuf.writeUInt16(els);
      for (let i = 0; i < els; i++) {
        const len = oldBuf.readUInt32();
        newBuf.writeUInt32(len).writeBuffer(oldBuf.readBuffer(len + 2));
      }
      break;
    }

    case CTYPE_ENUM: {
      newBuf.writeString("").writeUInt8(0).writeUInt16(0);
      const els = oldBuf.readUInt16();
      newBuf.writeUInt16(els);
      for (let i = 0; i < els; i++) {
        const len = oldBuf.readUInt32();
        newBuf.writeUInt32(len).writeBuffer(oldBuf.readBuffer(len));
      }
      break;
    }

    case CTYPE_RANGE:
    case CTYPE_MULTIRANGE: {
      newBuf.writeString("").writeUInt8(0).writeUInt16(0);
      newBuf.writeUInt16(oldBuf.readUInt16());
      break;
    }
  }

  return [tid, newBuf.unwrap()];
}
