const parser = require("@babel/parser")
const traverse = require("@babel/traverse").default
const generate = require("@babel/generator").default
const t = require("@babel/types");
const vm = require("vm");


function fix_data_functions(ast){
    var visitors = {
        FunctionDeclaration(path){
            if(path.node.body.body.length != 2){
                return
            }
            
            //hardcoding declarations[0] works because all data functions have a single variable with name "r" in them
            var _node = path.node.body.body.filter((_node) => (t.isVariableDeclaration(_node) && t.isArrayExpression(_node.declarations[0].init) && _node.declarations[0].id.name == "r"))
            if (_node.length <= 0){
                return
            }

            console.log("data function found " + path.node.id.name)
            const data_function_path = path

            //uncomment this and the logs after, to understand what this visitor does
            // console.log("data function before fixing")
            // console.log(generate(data_function_path.node).code)

            // vm setup
            var context = vm.createContext()
            var data_function_js = new vm.Script(generate(path.node).code)
            data_function_js.runInContext(context)

            var { referencePaths } = path.scope.getBinding(path.node.id.name)
            var deob_ref = referencePaths.find(function(path){
                return t.isVariableDeclarator(path.parentPath.parentPath.node)
            })

            var deobfuscator_function = deob_ref.findParent(function(parent_path){
                return t.isFunctionDeclaration(parent_path)
            })
            
            console.log("deobfuscator function found " + deobfuscator_function.node.id.name + " for data function " + path.node.id.name)
            var function_js = new vm.Script(generate(deobfuscator_function.node).code)
            function_js.runInContext(context)

            var ref = path.node.body.body.filter((_node) => (t.isCallExpression(ref.node) && ref.node.arguments.length == 1 && ref.node.arguments[0].name == data_function_path.node.id.name))
            if (ref.length <= 0){
                console.log(`no fixer function found for ${data_function_path.node.id.name}`)
                return
            } 

            ref = ref.parentPath
            console.log(`fixer function found for ${data_function_path.node.id.name}`)

            // the "!" is to used to make sure the function is immediatly defined and invoked "iife" 
            var fixer_js = new vm.Script("!" + generate(ref.node).code)
            fixer_js.runInContext(context)
            var arr = eval(`context.${data_function_path.node.id.name}()`)
            const array_node = t.arrayExpression(
                arr.map(str => t.stringLiteral(str))
            );
            console.log("fixing data function " + data_function_path.node.id.name)
            
            data_function_path.traverse({
                ArrayExpression(arr_path){
                    arr_path.replaceWith(array_node)
                    arr_path.stop()
                }
            })
            //delete the fixer function
            //parent path is unnary expression "the ! before the function"
            if (t.isUnaryExpression(ref.parentPath.node)){
                ref.parentPath.remove()
            }else{
                ref.remove()
            }
             
            // console.log("data function after fixing")
            // console.log(generate(data_function_path.node).code)
        }
    }
    traverse(ast, visitors)
}

module.exports = fix_data_functions;