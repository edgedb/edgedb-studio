import {parser} from "./lang.js";

const code2 = `
SELECT default::Movie {
  id,
  title,
  year,
  description,

  actors: {
    id,
    full_name,
  }

  # computed property
  reviews := .<movie[IS Review] {
    id,
    body,
    rating,
    author: {
      id,
      name
    }
  }
}
FILTER .id = <optional uuid>$movie_id;

select 1 < 2;;;

type Review {
  required property body -> str;
  required property rating -> int64 {
    constraint min_value(0);
    constraint max_value(5);
  }
  required property flag -> bool {
    default := False;
  }

  required link author -> User;
  required link movie -> Movie;

  required property creation_time -> datetime {
    default := datetime_current();
  }
};

function foo(named only s: set of str) -> str
  using (
    SELECT s ++ <str>len(a)
  );

SELECT (
  int := 5,
  bigint := 12345n,
  string := 'string',
  dollar_string := $$some string with $ dollar symbols$$,
  dollar_string2 := $abc$some string with double $$ dollar$abc$,
  bool := true,
  float := 123.456,
  float2 := -1.7e+308,
  raw_string := r'raw string',
  multiline := 'string \\x16 \\m across \\
    multiple lines',
  illegal_bytes := b'Hello,\\x20world\\x01 \\xzz',
  datetime := cal::to_local_datetime(2020, 9, 22, 0, 0, 0)
)
`;

const code = `select {
  a := $a,
  b := <>$b,
  c := <str>$c,
  d := <optional std::str>$d,
  e := <optional>$e,
  f := <array<str>>$f,
  g := <range<int32>>$g,
  h := <multirange<int32>>$h
}`;

const tree = parser.parse(code);

printTree(tree, code);

function printTree(tree, code) {
  let indent = "";
  let cursor = 0;
  function printNode(node) {
    process.stdout.write(
      (node.name === "⚠"
        ? "\x1b[41m"
        : process.argv[2] === node.name
        ? "\x1b[44m"
        : "\x1b[2m") +
        indent +
        node.name +
        "\x1b[0m"
    );
    indent += "  ";
    cursor = node.from;
    let nc = false;
    let childNode = node.firstChild;
    if (childNode) {
      nc = true;
      process.stdout.write("\n");
    }
    while (childNode) {
      if (childNode.from !== cursor) {
        console.log(
          indent +
            "\x1b[100m" +
            code.slice(cursor, childNode.from).replaceAll("\n", "↵") +
            "\x1b[0m"
        );
      }
      printNode(childNode);
      childNode = childNode.nextSibling;
    }
    if (cursor !== node.to) {
      process.stdout.write(
        (nc ? indent : " ") +
          "\x1b[100m" +
          code.slice(cursor, node.to).replaceAll("\n", "↵") +
          "\x1b[0m" +
          "\n"
      );
      cursor = node.to;
    }
    indent = indent.slice(2);
  }

  printNode(tree.topNode);
}
