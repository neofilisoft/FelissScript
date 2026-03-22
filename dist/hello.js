#!/usr/bin/env node
const sdk = require("../sdk");

const source = "// begin include modules/math_utils.flss\nfn square(x: int) {\n    return x * x\n}\n\nfn double(x: int) {\n    return x * 2\n}\n\n// end include modules/math_utils.flss\n\nclass Person {\n    name: str = \"\"\n    age: int = 0\n\n    fn init(self, name: str, age: int) {\n        self.name = name\n        self.age = age\n    }\n}\n\nfn describe(p: Person) {\n    return `${p.name} (${p.age})`\n}\n\nlet user = new Person(\"Feliss\", 7)\nshow \"FelissScript SDK is alive\"\nshow describe(user)\nshow `square(6) = ${square(6)}`\nshow `double(21) = ${double(21)}`\n";

try {
  sdk.runSource(source, {
    cwd: "C:\\Users\\BEST\\Desktop\\flss\\examples",
    onOutput: (line) => console.log(line),
    onErrorOutput: (line) => console.error(line),
  });
} catch (error) {
  console.error('[flss build-runner]', error.message);
  process.exit(1);
}
