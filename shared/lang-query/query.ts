import type {LRParser} from "@lezer/lr";
import {LRLanguage, LanguageSupport} from "@codemirror/language";
import {styleTags, tags as t} from "@lezer/highlight";

// @ts-ignore
import {parser as _parser} from "./lang";

const parser = _parser as LRParser;

export {parser};

export const queryLanguage = LRLanguage.define({
  parser: parser.configure({
    props: [
      styleTags({
        BuiltinName: t.standard(t.name),
        Bool: t.bool,
        Comment: t.comment,
        Name: t.name,
        ModuleName: t.special(t.name),
        Keyword: t.keyword,
        Operator: t.operator,
        "RawStringPrefix ByteStringPrefix": t.special(t.string),
        "String ByteString": t.string,
        "StringEscape ByteEscape": t.escape,
        Number: t.number,
        BigNumberPostfix: t.special(t.number),
        Punctuation: t.punctuation,
        CompoundTypeName: t.typeName,
        QueryParameterName: t.variableName,
        "( )": t.paren,
        "{ }": t.brace,
        "[ ]": t.squareBracket,
      }),
    ],
  }),
  languageData: {
    closeBrackets: {brackets: ["[", "{", "(", '"', "'"]},
    indentOnInput: /^\s*[\}]$/,
    commentTokens: {
      line: "#",
    },
  },
});

export function queryLanguageSupport() {
  return new LanguageSupport(queryLanguage);
}
