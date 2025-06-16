const parser = require("@babel/parser")
const traverse = require("@babel/traverse").default
const generate = require("@babel/generator").default
const t = require("@babel/types");
const vm = require("vm");



//TODO: evaluate references like this Bq(r - -1789 - 863, n) when working with aggregates of aggregates 
//so the visitor can be called on generated code recursively

//there is two types of references to deobfuscate functions direct references and calls aggregated by other functions these do substractions of the paremeters
//before passing them to the real deobfuscate function
function remove_aggregate_function(path){
    console.log("aggregate function found " + path.node.id.name)
    var deob_function_name = path.node.body.body[0].argument.callee.name
    var args = path.node.body.body[0].argument.arguments
    
    var call_expression_node = path.node.body.body[0].argument
    var call_expression_path = path.get("body.body")[0].get("argument")

    var args_flipped = path.node.params[0].name == args[1].name
    var operation = args[0].operator
    console.log("are arguments flipepd: " + args_flipped) 
    // console.log(generate(path.node.body.body[0].argument).code)

    var aggregate_refs = path.scope.parent.getBinding(path.node.id.name).referencePaths 
    for (ref of aggregate_refs){
        ref = ref.parentPath

        //false && is for debugging
        if(t.isCallExpression(ref.node) && ref.node.arguments.every((_node) => !t.isIdentifier(_node))){
            console.log("aggregate call found")
            console.log(generate(ref.node).code)
            var first_arg_node, second_arg_node;
            if (args_flipped){
                first_arg_node = ref.node.arguments[1]
                second_arg_node = ref.node.arguments[0]
            }else{
                first_arg_node = ref.node.arguments[0]
                second_arg_node = ref.node.arguments[1]
            }

            var call_expression_copy = t.cloneNode(call_expression_node)
            if (t.isBinaryExpression(call_expression_node.arguments[0])){
                console.log("processing deobfuscator call " +  generate(call_expression_node).code)
                if (!t.isIdentifier(call_expression_node.arguments[0].left)){
                    console.log("the left node of the binary expression is not a identifier")
                    console.log(generate(call_expression_node).code)
                }
                call_expression_copy.arguments[0].left = first_arg_node
                call_expression_copy.arguments[1] = second_arg_node

                var code = generate(call_expression_copy.arguments[0]).code
                var value = vm.runInNewContext(code)
                call_expression_copy.arguments[0] = t.valueToNode(value)

            } else if (t.isBinaryExpression(call_expression_node.arguments[1])){

                call_expression_copy.arguments[1].left = second_arg_node
                call_expression_copy.arguments[0] = first_arg_node

                var code = generate(call_expression_copy.arguments[1]).code
                var value = vm.runInNewContext(code)
                call_expression_copy.arguments[1] = t.valueToNode(value)

            } else{
                console.log("neither first or second argument of deobfuscator call is a BinaryExpression?")
            }

            console.log("before replaceWith call")
            console.log(generate(ref.node).code)
            ref.replaceWith(call_expression_copy)
            console.log("after replaceWith call")
            console.log(generate(ref.node).code)

        } else if(t.isCallExpression(ref.node) && ref.node.arguments.some((_node) => t.isIdentifier(_node))){
            //here we replace calls made by aggregate of aggregate to the obfuscate function so when we run it again they will removed by upper code
            console.log("aggregate of aggregate found")
            console.log(generate(ref.node).code)
            var call_expression_copy = t.cloneNode(call_expression_node)
            if (args_flipped){
                first_arg_node = ref.node.arguments[1]
                second_arg_node = ref.node.arguments[0]
            }else{
                first_arg_node = ref.node.arguments[0]
                second_arg_node = ref.node.arguments[1]
            }
            if(t.isBinaryExpression(call_expression_node.arguments[0])){
                call_expression_copy.arguments[0].left = first_arg_node
                call_expression_copy.arguments[1] = second_arg_node
            } else if(t.isBinaryExpression(call_expression_node.arguments[1])){
                call_expression_copy.arguments[0] = first_arg_node
                call_expression_copy.arguments[1].left = second_arg_node
            }
            console.log("replacing aggregate of aggregate call with call to aggregate ")
            console.log("before replace")
            console.log(generate(ref.node).code)
            ref.replaceWith(call_expression_copy)
            console.log("after replace")
            console.log(generate(ref.node).code)
        }
    }
    aggregate_refs = path.scope.parent.getBinding(path.node.id.name).referencePaths 
    console.log("length of references are " + aggregate_refs.length)
    if (aggregate_refs.length == 0){
        path.remove()
    }

}


function deobfuscate(ast){
    var visitors = {
        FunctionDeclaration(path){
            if(path.node.body.body.length != 2){
                return
            }

            var _node = path.node.body.body.filter((_node) => (t.isVariableDeclaration(_node) && t.isArrayExpression(_node.declarations[0].init) && _node.declarations[0].id.name == "r"))
            if (_node.length <= 0){
                return
            }

            console.log("data function found " + path.node.id.name)
            // vm setup
            var context = vm.createContext()
            var data_function_js = new vm.Script(generate(path.node).code)
            data_function_js.runInContext(context)

            var { referencePaths } = path.scope.getBinding(path.node.id.name)
            var deob_ref = referencePaths.find(function(path){
                return t.isVariableDeclarator(path.parentPath.parentPath.node)
            })

            //all data functions are referenced once by deobfuscator function
            var deobfuscator_function = deob_ref.findParent(function(parent_path){
                return t.isFunctionDeclaration(parent_path)
            })
            
            console.log("deobfuscator function found " + deobfuscator_function.node.id.name + " for data function " + path.node.id.name)
            var function_js = new vm.Script(generate(deobfuscator_function.node).code)
            function_js.runInContext(context)


            var obfuscator_refs = deobfuscator_function.scope.getBinding(deobfuscator_function.node.id.name).referencePaths
            for(ref of obfuscator_refs){
                ref = ref.parentPath
                if(t.isCallExpression(ref.node) && ref.node.arguments.some((arg_path) => t.isBinaryExpression(arg_path)) && t.isFunctionDeclaration(ref.parentPath.parentPath.parentPath.node)){
                    var aggregate_function =  ref.parentPath.parentPath.parentPath
                    remove_aggregate_function(aggregate_function)
                
                } else if (t.isCallExpression(ref.node) && ref.node.arguments.some((arg) => t.isBinaryExpression(arg))){
                    //here we handle calls like (r = 1224, u = 1282, Wf(r - 907, u) where ref.node takes the node Wf(r - 907, u) 
                    if (!t.isSequenceExpression(ref.parentPath.node)){
                        console.log("parent expression is not a SequenceExpression")
                        continue
                    }

                    ref.get("arguments").forEach(function(arg){
                        if (t.isBinaryExpression(arg.node)){
                            var assignment_exp = ref.parentPath.node.expressions.filter((exp) => t.isAssignmentExpression(exp) && exp.left.name == arg.node.left.name)[0].right
                            arg.node.left = assignment_exp
                        } else if (t.isIdentifier(arg.node)){
                            var value = ref.parentPath.node.expressions.filter((exp) => t.isAssignmentExpression(exp) && exp.left.name == arg.node.name)[0].right
                            arg.replaceWith(value)
                        }
                    })

                    //here we remove the "r = 1224, u = 1282" from code
                    ref.parentPath.get("expressions").forEach(function(exp){
                        if (t.isAssignmentExpression(exp.node)){
                            exp.remove()
                        }
                    })
                    
                } else{
                    if (t.isCallExpression(ref.node) && ref.node.arguments.every((arg) => !t.isIdentifier(arg))){
                        console.log("reference to deobfuscator function " + generate(ref.node).code)
                        try{
                            var value = eval("context." + generate(ref.node).code)
                            console.log("deob value " + value)
                            ref.replaceWith(t.valueToNode(value))
                        }catch(err){
                            console.log("error evaluatung " + generate(ref.node).code)
                        }
                    }
                }
            }
        }
    }     

    traverse(ast, visitors)
    deobfuscated_code = generate(ast).code
    return deobfuscated_code
}
