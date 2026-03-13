import {ExternalTokenizer} from "@lezer/lr";
import {
  reservedKeyword,
  unreservedKeyword,
  opHack,
  Bool,
  BuiltinName,
  RawStringPrefix,
  ByteStringPrefix,
  dollarString,
  BigNumberPostfix,
} from "./lang.terms.js";
import {
  reserved_keywords,
  unreserved_keywords,
  constraint_builtins,
  fn_builtins,
  type_builtins,
  index_builtins,
} from "./meta.js";

const reservedKeywords = new Set(reserved_keywords);
const unreservedKeywords = new Set(unreserved_keywords);
const builtins = new Set([
  ...constraint_builtins,
  ...fn_builtins,
  ...type_builtins,
  ...index_builtins,
]);

const chars = {
  '"': 34,
  $: 36,
  "'": 39,
  "-": 45,
  ["0"]: 48,
  ["9"]: 57,
  ">": 62,
  A: 65,
  Z: 90,
  _: 95,
  a: 97,
  b: 98,
  n: 110,
  r: 114,
  z: 122,
};
const whitespace = new Set(
  " \n\r\t".split("").map((char) => char.charCodeAt(0))
);

export function specializeIdent(ident) {
  const lident = ident.toLowerCase();
  if (lident === "true" || lident === "false") {
    return Bool;
  }
  if (reservedKeywords.has(lident)) {
    return reservedKeyword;
  }
  if (unreservedKeywords.has(lident)) {
    return unreservedKeyword;
  }
  if (builtins.has(ident)) {
    return BuiltinName;
  }
  return -1;
}

export const strPrefix = new ExternalTokenizer((input) => {
  const prefix = input.next;
  if (prefix === chars.b || prefix === chars.r) {
    input.advance();
    if (input.next === chars[`"`] || input.next === chars[`'`]) {
      input.acceptToken(prefix === 98 ? ByteStringPrefix : RawStringPrefix);
    }
  }
});

export const dollarStr = new ExternalTokenizer((input) => {
  if (input.next !== chars.$) return;
  let delim = [];
  let next = input.advance();
  while (next !== -1 && next !== chars.$) {
    if (
      (next >= chars["a"] && next <= chars["z"]) ||
      (next >= chars["A"] && next <= chars["Z"]) ||
      next === chars._ ||
      (delim.length > 0 && next >= chars["0"] && next <= chars["9"])
    ) {
      delim.push(next);
      next = input.advance();
    } else {
      return;
    }
  }
  delim.push(chars.$);

  next = input.advance();
  while (next !== -1) {
    if (next === chars.$) {
      let noMatch = false;
      for (let i = 0; i < delim.length; i++) {
        next = input.advance();
        if (next !== delim[i]) {
          noMatch = true;
          break;
        }
      }
      if (!noMatch) {
        input.acceptToken(dollarString, 1);
        return;
      }
    } else {
      next = input.advance();
    }
  }
});

export const operatorHacks = new ExternalTokenizer((input) => {
  if (input.next === chars["-"] && input.peek(1) !== chars[">"]) {
    input.advance();
    input.acceptToken(opHack);
  }
});

export const bigNumber = new ExternalTokenizer((input) => {
  if (input.next === chars["n"] && !whitespace.has(input.peek(-1))) {
    input.advance();
    input.acceptToken(BigNumberPostfix);
  }
});
