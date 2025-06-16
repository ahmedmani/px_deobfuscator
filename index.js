const parser = require("@babel/parser")
const traverse = require("@babel/traverse").default
const generate = require("@babel/generator").default
const t = require("@babel/types");
const vm = require("vm");
const data_function_visitor = require("./visitors/data_function_visitor");
const aggregate_deobfuscator_visitor = require("./visitors/aggregate_deobfuscator_visitor");
const { readFileSync, writeFile } = require("fs");


var code = readFileSync("./obfuscated_captcha.js", "utf8")
ast = parser.parse(code)
data_function_visitor(ast)
aggregate_deobfuscator_visitor(ast)
