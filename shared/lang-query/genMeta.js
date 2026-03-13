import {execFileSync} from "child_process";
import {writeFileSync} from "fs";

const stdout = execFileSync("backend-cli", ["gen-meta-grammars", "query"], {
  encoding: "utf8",
});

const output = [];
const types = [];

let inGroup = false;
for (const line of stdout.split("\n")) {
  if (!inGroup) {
    const match = line.match(/(.+)\s+=\s+\(/);
    if (match) {
      output.push(`export const ${match[1].trim()} = [`);
      types.push(`export const ${match[1].trim()}: string[];`);
      inGroup = true;
    }
  } else {
    if (line.trim() === ")") {
      output.push("];\n");
      inGroup = false;
    } else {
      output.push(`  ${line.trim()}`);
    }
  }
}

writeFileSync("./meta.js", output.join("\n"));
writeFileSync("./meta.d.ts", types.join("\n"));
