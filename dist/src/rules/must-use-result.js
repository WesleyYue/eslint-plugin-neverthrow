"use strict";
const tsutils_1 = require("tsutils");
const utils_1 = require("../utils");
function matchAny(nodeTypes) {
    return `:matches(${nodeTypes.join(', ')})`;
}
const resultSelector = matchAny([
    // 'Identifier',
    'CallExpression',
    'NewExpression',
]);
const resultProperties = [
    'mapErr',
    'map',
    'andThen',
    'orElse',
    'match',
    'unwrapOr',
];
const handledMethods = ['match', 'unwrapOr', '_unsafeUnwrap', 'isErr'];
// evalua dentro de la expresion si es result
// si es result chequea que sea manejada en el la expresion
// si no es manejada revisa si es asignada o usada como argumento para una funcion
// si fue asignada sin manejar revisa todo el bloque de la variable por manejos
// de resto fue manejada adecuadamente
function isResultLike(checker, parserServices, node) {
    if (!node)
        return false;
    const tsNodeMap = parserServices.esTreeNodeToTSNodeMap.get(node);
    const type = checker.getTypeAtLocation(tsNodeMap);
    for (const ty of (0, tsutils_1.unionTypeParts)(checker.getApparentType(type))) {
        if (resultProperties
            .map((p) => ty.getProperty(p))
            .every((p) => p !== undefined)) {
            return true;
        }
    }
    return false;
}
function findMemberName(node) {
    if (!node)
        return null;
    if (node.property.type !== 'Identifier')
        return null;
    return node.property.name;
}
function isMemberCalledFn(node) {
    var _a;
    if (((_a = node === null || node === void 0 ? void 0 : node.parent) === null || _a === void 0 ? void 0 : _a.type) !== 'CallExpression')
        return false;
    return node.parent.callee === node;
}
function isHandledResult(node) {
    var _a, _b, _c;
    const memberExpresion = node.parent;
    if ((memberExpresion === null || memberExpresion === void 0 ? void 0 : memberExpresion.type) === 'MemberExpression') {
        const methodName = findMemberName(memberExpresion);
        const methodIsCalled = isMemberCalledFn(memberExpresion);
        if (methodName && handledMethods.includes(methodName) && methodIsCalled) {
            // Check if the method is 'isErr' and the next sibling is an 'IfStatement'
            if (methodName === 'isErr' &&
                ((_b = (_a = memberExpresion.parent) === null || _a === void 0 ? void 0 : _a.parent) === null || _b === void 0 ? void 0 : _b.type) === 'IfStatement') {
                return true;
            }
            else if (methodName !== 'isErr') {
                return true;
            }
        }
        const parent = (_c = node.parent) === null || _c === void 0 ? void 0 : _c.parent; // search for chain method .map().handler
        if (parent && (parent === null || parent === void 0 ? void 0 : parent.type) !== 'ExpressionStatement') {
            return isHandledResult(parent);
        }
    }
    return false;
}
const endTransverse = ['BlockStatement', 'Program'];
function getAssignation(checker, parserServices, node) {
    if (node.type === 'VariableDeclarator' &&
        isResultLike(checker, parserServices, node.init) &&
        node.id.type === 'Identifier') {
        return node.id;
    }
    if (endTransverse.includes(node.type) || !node.parent) {
        return undefined;
    }
    return getAssignation(checker, parserServices, node.parent);
}
function isReturned(checker, parserServices, node) {
    if (node.type === 'ArrowFunctionExpression') {
        return true;
    }
    if (node.type === 'ReturnStatement') {
        return true;
    }
    if (node.type === 'BlockStatement') {
        return false;
    }
    if (node.type === 'Program') {
        return false;
    }
    if (!node.parent) {
        return false;
    }
    return isReturned(checker, parserServices, node.parent);
}
const ignoreParents = [
    'ClassDeclaration',
    'FunctionDeclaration',
    'MethodDefinition',
    'ClassProperty',
];
function processSelector(context, checker, parserServices, node, reportAs = node) {
    var _a, _b;
    if ((_a = node.parent) === null || _a === void 0 ? void 0 : _a.type.startsWith('TS')) {
        return false;
    }
    if (node.parent && ignoreParents.includes(node.parent.type)) {
        return false;
    }
    if (!isResultLike(checker, parserServices, node)) {
        return false;
    }
    if (isHandledResult(node)) {
        return false;
    }
    // return getResult()
    if (isReturned(checker, parserServices, node)) {
        return false;
    }
    const assignedTo = getAssignation(checker, parserServices, node);
    const currentScope = context.getScope();
    // Check if is assigned
    if (assignedTo) {
        const variable = currentScope.set.get(assignedTo.name);
        const references = (_b = variable === null || variable === void 0 ? void 0 : variable.references.filter((ref) => ref.identifier !== assignedTo)) !== null && _b !== void 0 ? _b : [];
        if (references.length > 0) {
            return references.some((ref) => processSelector(context, checker, parserServices, ref.identifier, reportAs));
        }
    }
    context.report({
        node: reportAs,
        messageId: utils_1.MessageIds.MUST_USE,
    });
    return true;
}
const rule = {
    meta: {
        docs: {
            description: 'Not handling neverthrow result is a possible error because errors could remain unhandleds.',
            recommended: 'error',
            category: 'Possible Errors',
            url: '',
        },
        messages: {
            mustUseResult: 'Result must be handled with either of match, unwrapOr or _unsafeUnwrap.',
        },
        schema: [],
        type: 'problem',
    },
    create(context) {
        var _a;
        const parserServices = context.parserServices;
        const checker = (_a = parserServices === null || parserServices === void 0 ? void 0 : parserServices.program) === null || _a === void 0 ? void 0 : _a.getTypeChecker();
        if (!checker || !parserServices) {
            throw Error('types not available, maybe you need set the parser to @typescript-eslint/parser');
        }
        return {
            [resultSelector](node) {
                return processSelector(context, checker, parserServices, node);
            },
        };
    },
};
module.exports = rule;
