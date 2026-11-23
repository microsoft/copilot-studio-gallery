import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const nonDrawingCanvasMarker = "data-aether-canvas-purpose";
const eventHandlerPattern = /^on[A-Z]/u;

const rawDrawingCanvasPlugin = {
  rules: {
    "no-raw-drawing-canvas": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          forbidden:
            "Use the shared `@/components/pen-input` wrapper; app code never implements a raw drawing canvas.",
          forbiddenImport:
            "Use the shared `@/components/pen-input` wrapper; app code never imports the drawing engine directly.",
        },
      },
      create(context) {
        const sourceCode = context.sourceCode;
        const variableDeclarations = [];
        const bindingDeclarations = [];
        const constantInitializers = new Map();
        const jsxOpeningElements = [];
        const callExpressions = [];
        const assignmentExpressions = [];
        const jsxAttributes = [];
        const importExpressions = [];
        const forOfStatements = [];
        const reactCreateElementDestructurings = [];
        const reactCreateElementVariables = new Set();
        const reactNamespaceVariables = new Set();

        const variableForIdentifier = (node) => {
          if (
            node?.type !== "Identifier" &&
            node?.type !== "JSXIdentifier"
          ) {
            return undefined;
          }
          let scope = sourceCode.getScope(node);
          while (scope) {
            const variable = scope.set.get(node.name);
            if (variable) return variable;
            scope = scope.upper;
          }
          return undefined;
        };

        const unwrapExpression = (node) => {
          let current = node;
          while (
            current &&
            [
              "ChainExpression",
              "TSAsExpression",
              "TSNonNullExpression",
              "TSSatisfiesExpression",
              "TSTypeAssertion",
            ].includes(current.type)
          ) {
            current = current.expression;
          }
          return current;
        };

        const staticStringExpression = (node, resolving = new Set()) => {
          node = unwrapExpression(node);
          if (node?.type === "Literal" && typeof node.value === "string") {
            return node.value;
          }
          if (
            node?.type === "TemplateLiteral" &&
            node.expressions.length === 0
          ) {
            return node.quasis[0]?.value.cooked;
          }
          if (node?.type === "BinaryExpression" && node.operator === "+") {
            const left = staticStringExpression(node.left, resolving);
            const right = staticStringExpression(node.right, resolving);
            return left === undefined || right === undefined
              ? undefined
              : left + right;
          }
          if (
            node?.type === "Identifier" ||
            node?.type === "JSXIdentifier"
          ) {
            const variable = variableForIdentifier(node);
            if (
              variable === undefined ||
              !constantInitializers.has(variable) ||
              resolving.has(variable)
            ) {
              return undefined;
            }
            const nextResolving = new Set(resolving);
            nextResolving.add(variable);
            return staticStringExpression(
              constantInitializers.get(variable),
              nextResolving,
            );
          }
          return undefined;
        };

        const staticCanvasTag = (node) =>
          staticStringExpression(node) === "canvas";

        const memberName = (node) => {
          node = unwrapExpression(node);
          if (node?.type !== "MemberExpression") return undefined;
          if (node.computed) return staticStringExpression(node.property);
          return node.property.type === "Identifier"
            ? node.property.name
            : undefined;
        };

        const propertyName = (node) => {
          if (node?.type !== "Property") return undefined;
          if (node.computed) return staticStringExpression(node.key);
          if (node.key.type === "Identifier") return node.key.name;
          return staticStringExpression(node.key);
        };

        const bindingIdentifier = (node) => {
          node = unwrapExpression(node);
          while (node?.type === "AssignmentPattern") {
            node = unwrapExpression(node.left);
          }
          return node?.type === "Identifier" ? node : undefined;
        };

        const bindingIdentifiers = (node) => {
          node = unwrapExpression(node);
          if (node?.type === "Identifier") return [node];
          if (
            node?.type === "AssignmentPattern" ||
            node?.type === "RestElement"
          ) {
            return bindingIdentifiers(
              node.type === "AssignmentPattern"
                ? node.left
                : node.argument,
            );
          }
          if (node?.type === "ArrayPattern") {
            return node.elements.flatMap((element) =>
              element === null ? [] : bindingIdentifiers(element),
            );
          }
          if (node?.type === "ObjectPattern") {
            return node.properties.flatMap((property) =>
              property.type === "Property"
                ? bindingIdentifiers(property.value)
                : bindingIdentifiers(property.argument),
            );
          }
          return [];
        };

        const literalString = (node) => {
          node = unwrapExpression(node);
          return node?.type === "Literal" && typeof node.value === "string"
            ? node.value
            : undefined;
        };

        const hasLiteralNonDrawingMarker = (node) => {
          if (node?.type !== "ObjectExpression") return false;
          let hasMarker = false;
          for (const property of node.properties) {
            if (property.type !== "Property") {
              hasMarker = false;
              continue;
            }
            const name = propertyName(property);
            if (name === undefined) {
              hasMarker = false;
            } else if (name === nonDrawingCanvasMarker) {
              hasMarker =
                !property.computed &&
                literalString(property.key) === nonDrawingCanvasMarker &&
                literalString(property.value) === "non-drawing";
            }
          }
          return hasMarker;
        };

        const hasLiteralJsxMarker = (node) => {
          let hasMarker = false;
          for (const attribute of node.attributes) {
            if (attribute.type === "JSXSpreadAttribute") {
              hasMarker = false;
            } else if (attribute.name.name === nonDrawingCanvasMarker) {
              hasMarker =
                attribute.value?.type === "Literal" &&
                attribute.value.value === "non-drawing";
            }
          }
          return hasMarker;
        };

        const isReactCreateElementCallee = (node, resolving = new Set()) => {
          const callee = unwrapExpression(node);
          if (callee?.type === "Identifier") {
            const variable = variableForIdentifier(callee);
            if (reactCreateElementVariables.has(variable)) return true;
            if (
              constantInitializers.has(variable) &&
              !resolving.has(variable)
            ) {
              const nextResolving = new Set(resolving);
              nextResolving.add(variable);
              return isReactCreateElementCallee(
                constantInitializers.get(variable),
                nextResolving,
              );
            }
            return false;
          }
          if (callee?.type !== "MemberExpression") return false;
          const object = unwrapExpression(callee.object);
          const objectVariable =
            object?.type === "Identifier"
              ? variableForIdentifier(object)
              : undefined;
          return (
            object?.type === "Identifier" &&
            (reactNamespaceVariables.has(objectVariable) ||
              (object.name === "React" &&
                (objectVariable === undefined ||
                  objectVariable.defs.length === 0))) &&
            memberName(callee) === "createElement"
          );
        };

        const isDocumentCreateElementCallee = (
          node,
          atOffset = Number.POSITIVE_INFINITY,
          resolving = new Set(),
        ) => {
          node = unwrapExpression(node);
          if (
            node?.type === "MemberExpression" &&
            isDocumentExpression(node.object) &&
            memberName(node) === "createElement"
          ) {
            return true;
          }
          if (node?.type === "CallExpression") {
            const callee = unwrapExpression(node.callee);
            return (
              callee?.type === "MemberExpression" &&
              memberName(callee) === "bind" &&
              isDocumentCreateElementCallee(
                callee.object,
                atOffset,
                resolving,
              )
            );
          }
          if (
            node?.type === "ConditionalExpression" ||
            node?.type === "LogicalExpression"
          ) {
            return (
              isDocumentCreateElementCallee(
                node.type === "ConditionalExpression"
                  ? node.consequent
                  : node.left,
                atOffset,
                resolving,
              ) ||
              isDocumentCreateElementCallee(
                node.type === "ConditionalExpression"
                  ? node.alternate
                  : node.right,
                atOffset,
                resolving,
              )
            );
          }
          if (node?.type === "SequenceExpression") {
            return node.expressions.some((expression) =>
              isDocumentCreateElementCallee(
                expression,
                atOffset,
                resolving,
              ),
            );
          }
          if (node?.type !== "Identifier") return false;
          const variable = variableForIdentifier(node);
          if (variable === undefined || resolving.has(variable)) return false;
          const nextResolving = new Set(resolving);
          nextResolving.add(variable);
          if (
            assignmentExpressions.some((write) => {
              if (
                write.range[0] >= atOffset ||
                !["=", "&&=", "||=", "??="].includes(write.operator)
              ) {
                return false;
              }
              const left = unwrapExpression(write.left);
              if (
                left?.type === "Identifier" &&
                variableForIdentifier(left) === variable
              ) {
                return isDocumentCreateElementCallee(
                  write.right,
                  write.range[0],
                  nextResolving,
                );
              }
              return (
                left?.type === "ObjectPattern" &&
                isDocumentExpression(write.right) &&
                left.properties.some(
                  (property) =>
                    property.type === "Property" &&
                    propertyName(property) === "createElement" &&
                    variableForIdentifier(bindingIdentifier(property.value)) ===
                      variable,
                )
              );
            })
          ) {
            return true;
          }
          const definition =
            variable.defs.length === 1 ? variable.defs[0] : undefined;
          if (definition?.type !== "Variable") return false;
          if (
            definition.node.id.type === "ObjectPattern" &&
            isDocumentExpression(definition.node.init)
          ) {
            return definition.node.id.properties.some(
              (property) =>
                property.type === "Property" &&
                propertyName(property) === "createElement" &&
                bindingIdentifier(property.value) === definition.name,
            );
          }
          if (definition.node.id.type !== "Identifier") return false;
          return isDocumentCreateElementCallee(
            definition.node.init,
            definition.node.range[0],
            nextResolving,
          );
        };

        const hasBoundCanvasArgument = (
          node,
          atOffset = Number.POSITIVE_INFINITY,
          resolving = new Set(),
        ) => {
          node = unwrapExpression(node);
          if (node?.type === "CallExpression") {
            const callee = unwrapExpression(node.callee);
            return (
              callee?.type === "MemberExpression" &&
              memberName(callee) === "bind" &&
              isDocumentCreateElementCallee(
                callee.object,
                atOffset,
                resolving,
              ) &&
              staticCanvasTag(node.arguments[1])
            );
          }
          if (
            node?.type === "ConditionalExpression" ||
            node?.type === "LogicalExpression"
          ) {
            return (
              hasBoundCanvasArgument(
                node.type === "ConditionalExpression"
                  ? node.consequent
                  : node.left,
                atOffset,
                resolving,
              ) ||
              hasBoundCanvasArgument(
                node.type === "ConditionalExpression"
                  ? node.alternate
                  : node.right,
                atOffset,
                resolving,
              )
            );
          }
          if (node?.type === "SequenceExpression") {
            return node.expressions.some((expression) =>
              hasBoundCanvasArgument(expression, atOffset, resolving),
            );
          }
          if (node?.type !== "Identifier") return false;
          const variable = variableForIdentifier(node);
          if (variable === undefined || resolving.has(variable)) return false;
          const nextResolving = new Set(resolving);
          nextResolving.add(variable);
          if (
            assignmentExpressions.some(
              (write) =>
                write.range[0] < atOffset &&
                unwrapExpression(write.left)?.type === "Identifier" &&
                variableForIdentifier(unwrapExpression(write.left)) ===
                  variable &&
                hasBoundCanvasArgument(
                  write.right,
                  write.range[0],
                  nextResolving,
                ),
            )
          ) {
            return true;
          }
          const definition =
            variable.defs.length === 1 ? variable.defs[0] : undefined;
          return (
            definition?.type === "Variable" &&
            definition.node.id.type === "Identifier" &&
            hasBoundCanvasArgument(
              definition.node.init,
              definition.node.range[0],
              nextResolving,
            )
          );
        };

        const isGlobalIdentifier = (node, name) => {
          if (node?.type !== "Identifier" || node.name !== name) return false;
          const variable = variableForIdentifier(node);
          return variable === undefined || variable.defs.length === 0;
        };

        const isWindowExpression = (node, resolving = new Set()) => {
          node = unwrapExpression(node);
          if (
            isGlobalIdentifier(node, "window") ||
            isGlobalIdentifier(node, "self") ||
            isGlobalIdentifier(node, "globalThis")
          ) {
            return true;
          }
          if (
            node?.type === "MemberExpression" &&
            isGlobalIdentifier(unwrapExpression(node.object), "globalThis") &&
            ["window", "self"].includes(memberName(node))
          ) {
            return true;
          }
          if (node?.type !== "Identifier") return false;
          const variable = variableForIdentifier(node);
          if (variable === undefined || resolving.has(variable)) return false;
          const definition =
            variable.defs.length === 1 ? variable.defs[0] : undefined;
          if (
            definition?.type !== "Variable" ||
            (definition.parent?.kind !== "const" &&
              definition.parent?.kind !== "let")
          ) {
            return false;
          }
          if (
            definition.parent.kind === "let" &&
            variable.references.some(
              (reference) =>
                reference.isWrite() &&
                reference.identifier !== definition.name,
            )
          ) {
            return false;
          }
          const nextResolving = new Set(resolving);
          nextResolving.add(variable);
          if (definition.node.id.type === "Identifier") {
            return isWindowExpression(
              definition.node.init,
              nextResolving,
            );
          }
          if (
            definition.node.id.type === "ObjectPattern" &&
            isGlobalIdentifier(
              unwrapExpression(definition.node.init),
              "globalThis",
            )
          ) {
            return definition.node.id.properties.some(
              (property) =>
                property.type === "Property" &&
                ["window", "self"].includes(propertyName(property)) &&
                property.value === definition.name,
            );
          }
          return false;
        };
        const isDocumentExpression = (node, resolving = new Set()) => {
          node = unwrapExpression(node);
          if (isGlobalIdentifier(node, "document")) return true;
          if (
            node?.type === "MemberExpression" &&
            isWindowExpression(node.object) &&
            memberName(node) === "document"
          ) {
            return true;
          }
          if (
            node?.type === "MemberExpression" &&
            isDocumentExpression(node.object, resolving) &&
            ["body", "documentElement"].includes(memberName(node))
          ) {
            return true;
          }
          if (node?.type !== "Identifier") return false;
          const variable = variableForIdentifier(node);
          if (variable === undefined || resolving.has(variable)) return false;
          const definition =
            variable.defs.length === 1 ? variable.defs[0] : undefined;
          if (
            definition?.type !== "Variable" ||
            (definition.parent?.kind !== "const" &&
              definition.parent?.kind !== "let")
          ) {
            return false;
          }
          if (
            definition.parent.kind === "let" &&
            variable.references.some(
              (reference) =>
                reference.isWrite() &&
                reference.identifier !== definition.name,
            )
          ) {
            return false;
          }
          const nextResolving = new Set(resolving);
          nextResolving.add(variable);
          if (definition.node.id.type === "Identifier") {
            return isDocumentExpression(
              definition.node.init,
              nextResolving,
            );
          }
          if (
            definition.node.id.type === "ObjectPattern" &&
            isWindowExpression(definition.node.init)
          ) {
            return definition.node.id.properties.some(
              (property) =>
                property.type === "Property" &&
                propertyName(property) === "document" &&
                property.value === definition.name,
            );
          }
          return false;
        };

        const documentLookup = (node) => {
          node = unwrapExpression(node);
          if (node?.type !== "CallExpression") return undefined;
          const callee = unwrapExpression(node.callee);
          if (
            callee?.type !== "MemberExpression" ||
            !isDocumentExpression(callee.object)
          ) {
            return undefined;
          }
          const method = memberName(callee);
          if (
            method !== "getElementById" &&
            method !== "querySelector" &&
            method !== "querySelectorAll"
          ) {
            return undefined;
          }
          const selector = staticStringExpression(node.arguments[0]);
          return {
            method,
            selector,
            unknown: selector === undefined,
          };
        };

        const isDrawingDomEvent = (eventName) =>
          /^(?:on)?(?:pointer(?:down|move|up|cancel|rawupdate)|mouse(?:down|move|up)|touch(?:start|move|end|cancel))(?:capture)?$/iu.test(
            eventName,
          );

        return {
          ImportDeclaration(node) {
            if (node.source.value !== "react") return;
            for (const specifier of node.specifiers) {
              if (
                specifier.type === "ImportSpecifier" &&
                specifier.imported.name === "createElement"
              ) {
                const variable = variableForIdentifier(specifier.local);
                if (variable) reactCreateElementVariables.add(variable);
              } else if (
                specifier.type === "ImportDefaultSpecifier" ||
                specifier.type === "ImportNamespaceSpecifier"
              ) {
                const variable = variableForIdentifier(specifier.local);
                if (variable) reactNamespaceVariables.add(variable);
              }
            }
          },
          VariableDeclarator(node) {
            const init = unwrapExpression(node.init);
            bindingDeclarations.push(node);
            if (node.id.type === "ObjectPattern") {
              reactCreateElementDestructurings.push({ node, init });
            }
            if (node.id.type === "Identifier") {
              variableDeclarations.push(node);
            }
            if (node.id.type === "Identifier") {
              const variable = variableForIdentifier(node.id);
              const hasStableInitializer =
                node.parent.kind === "const" ||
                (node.parent.kind === "let" &&
                  variable?.references.every(
                    (reference) =>
                      !reference.isWrite() ||
                      reference.identifier === node.id,
                  ));
              if (variable && hasStableInitializer) {
                constantInitializers.set(variable, init);
              }
            }
          },
          JSXOpeningElement(node) {
            jsxOpeningElements.push(node);
          },
          CallExpression(node) {
            callExpressions.push(node);
          },
          AssignmentExpression(node) {
            assignmentExpressions.push(node);
          },
          JSXAttribute(node) {
            jsxAttributes.push(node);
          },
          ImportExpression(node) {
            importExpressions.push(node);
          },
          ForOfStatement(node) {
            forOfStatements.push(node);
          },
          "Program:exit"() {
            let hasForbiddenReport = false;
            const reportForbidden = (node, messageId = "forbidden") => {
              hasForbiddenReport = true;
              context.report({ node, messageId });
            };
            for (const { node, init } of reactCreateElementDestructurings) {
              const initVariable =
                init?.type === "Identifier"
                  ? variableForIdentifier(init)
                  : undefined;
              if (
                init?.type !== "Identifier" ||
                (!reactNamespaceVariables.has(initVariable) &&
                  !(
                    init.name === "React" &&
                    (initVariable === undefined ||
                      initVariable.defs.length === 0)
                  ))
              ) {
                continue;
              }
              for (const property of node.id.properties) {
                if (
                  property.type === "Property" &&
                  propertyName(property) === "createElement" &&
                  bindingIdentifier(property.value) !== undefined
                ) {
                  const variable = variableForIdentifier(
                    bindingIdentifier(property.value),
                  );
                  if (variable) {
                    reactCreateElementVariables.add(variable);
                  }
                }
              }
            }

            const canvasDescriptors = [];
            for (const openingElement of jsxOpeningElements) {
              const isAliasedCanvas =
                openingElement.name.type === "JSXIdentifier" &&
                staticCanvasTag(openingElement.name);
              if (
                openingElement.name.type !== "JSXIdentifier" ||
                (openingElement.name.name !== "canvas" &&
                  !isAliasedCanvas)
              ) {
                continue;
              }
              const attributes = new Map();
              for (const attribute of openingElement.attributes) {
                if (attribute.type !== "JSXAttribute") continue;
                const value =
                  attribute.value?.type === "JSXExpressionContainer"
                    ? staticStringExpression(attribute.value.expression)
                    : attribute.value?.value;
                if (typeof value === "string") {
                  attributes.set(attribute.name.name, value);
                }
              }
              canvasDescriptors.push({
                id: attributes.get("id"),
                classes: new Set(
                  (attributes.get("className") ?? "")
                    .split(/\s+/u)
                    .filter(Boolean),
                ),
                attributes,
                marked: hasLiteralJsxMarker(openingElement),
              });
              const marked = hasLiteralJsxMarker(openingElement);
              const unsafeAttribute = openingElement.attributes.find(
                (attribute) =>
                  (attribute.type === "JSXAttribute" &&
                    eventHandlerPattern.test(attribute.name.name) &&
                    isDrawingDomEvent(attribute.name.name)) ||
                  attribute.type === "JSXSpreadAttribute" ||
                  (!marked &&
                    attribute.type === "JSXAttribute" &&
                    (attribute.name.name === "ref" ||
                      eventHandlerPattern.test(attribute.name.name))),
              );
              if (unsafeAttribute) {
                reportForbidden(unsafeAttribute);
              }
            }

            for (const call of callExpressions) {
              const callee = unwrapExpression(call.callee);
              let factoryCallee = call.callee;
              let factoryArguments = call.arguments;
              if (
                callee?.type === "MemberExpression" &&
                isGlobalIdentifier(
                  unwrapExpression(callee.object),
                  "Reflect",
                ) &&
                memberName(callee) === "apply"
              ) {
                factoryCallee = call.arguments[0];
                factoryArguments =
                  unwrapExpression(call.arguments[2])?.type ===
                  "ArrayExpression"
                    ? unwrapExpression(call.arguments[2]).elements
                    : [];
              } else if (
                callee?.type === "MemberExpression" &&
                (memberName(callee) === "call" ||
                  memberName(callee) === "apply")
              ) {
                factoryCallee = callee.object;
                factoryArguments =
                  memberName(callee) === "call"
                    ? call.arguments.slice(1)
                    : unwrapExpression(call.arguments[1])?.type ===
                        "ArrayExpression"
                      ? unwrapExpression(call.arguments[1]).elements
                      : [];
              }
              const reactCreateElement =
                isReactCreateElementCallee(factoryCallee);
              const documentCreateElement =
                isDocumentCreateElementCallee(
                  factoryCallee,
                  call.range[0],
                );
              if (
                (!staticCanvasTag(factoryArguments[0]) &&
                  !(
                    documentCreateElement &&
                    hasBoundCanvasArgument(
                      factoryCallee,
                      call.range[0],
                    )
                  )) ||
                (!reactCreateElement && !documentCreateElement)
              ) {
                continue;
              }
              const props = unwrapExpression(factoryArguments[1]);
              if (
                reactCreateElement &&
                props?.type === "ObjectExpression"
              ) {
                const attributes = new Map();
                for (const property of props.properties) {
                  if (property.type !== "Property") continue;
                  const name = propertyName(property);
                  const value = staticStringExpression(property.value);
                  if (name !== undefined && value !== undefined) {
                    attributes.set(name, value);
                  }
                }
                canvasDescriptors.push({
                  id: attributes.get("id"),
                  classes: new Set(
                    (attributes.get("className") ?? "")
                      .split(/\s+/u)
                      .filter(Boolean),
                  ),
                  attributes,
                  marked: hasLiteralNonDrawingMarker(props),
                });
              }
              if (
                reactCreateElement &&
                hasLiteralNonDrawingMarker(props)
              ) {
                const unsafeProperty = props?.properties?.find(
                  (property) =>
                    property.type === "SpreadElement" ||
                    (property.type === "Property" &&
                      propertyName(property) !== undefined &&
                      isDrawingDomEvent(propertyName(property))),
                );
                if (unsafeProperty) {
                  reportForbidden(unsafeProperty);
                }
                continue;
              }
              reportForbidden(call);
            }

            const lookupTargets = new Map();
            const unknownLookupExpression = {
              aetherUnknownLookup: true,
            };
            const nearestFunction = (node) => {
              let current = node;
              while (current?.parent) {
                current = current.parent;
                if (/^(?:Arrow)?Function/u.test(current.type)) {
                  return current;
                }
              }
              return undefined;
            };
            const isConditionallyNested = (node) => {
              const assignmentFunction = nearestFunction(node);
              if (
                bindingIdentifiers(node.left).some((identifier) => {
                  const variable = variableForIdentifier(identifier);
                const definition =
                  variable?.defs.length === 1
                    ? variable.defs[0]
                    : undefined;
                  return (
                  definition !== undefined &&
                    nearestFunction(definition.name) !== assignmentFunction
                  );
                })
              ) {
                return true;
              }
              let current = node;
              while (current?.parent) {
                const parent = current.parent;
                if (
                  parent.type === "Program"
                ) {
                  return false;
                }
                if (/^(?:Arrow)?Function/u.test(parent.type)) return false;
                if (
                  parent.type === "IfStatement" ||
                  parent.type === "ConditionalExpression" ||
                  parent.type === "LogicalExpression" ||
                  parent.type === "SwitchCase" ||
                  parent.type === "TryStatement" ||
                  parent.type === "CatchClause" ||
                  /^(?:DoWhile|For|ForIn|ForOf|While)Statement$/u.test(
                    parent.type,
                  )
                ) {
                  return true;
                }
                current = parent;
              }
              return false;
            };
            const lookupWrites = [
              ...bindingDeclarations.map((declaration) => ({
                node: declaration,
                left: declaration.id,
                right: declaration.init,
              })),
              ...assignmentExpressions
                .map((assignment) => ({
                  node: assignment,
                  left: assignment.left,
                  right:
                    assignment.operator === "=" &&
                    !isConditionallyNested(assignment)
                      ? assignment.right
                      : unknownLookupExpression,
                })),
            ].sort((left, right) => left.node.range[0] - right.node.range[0]);
            const lookupWritesByVariable = new Map();
            const objectBindingValue = (
              node,
              name,
              fromSpread = false,
            ) => {
              node = unwrapExpression(node);
              if (node?.type !== "ObjectExpression") {
                return fromSpread
                  ? { ...unknownLookupExpression, source: node }
                  : node;
              }
              for (let index = node.properties.length - 1; index >= 0; index -= 1) {
                const property = node.properties[index];
                if (
                  property.type === "Property" &&
                  propertyName(property) === name
                ) {
                  return property.value;
                }
                if (property.type === "SpreadElement") {
                  const spreadValue = objectBindingValue(
                    property.argument,
                    name,
                    true,
                  );
                  if (spreadValue !== undefined) return spreadValue;
                }
              }
              return undefined;
            };
            const bindingWrites = (node, value) => {
              node = unwrapExpression(node);
              value = unwrapExpression(value);
              if (node?.type === "Identifier") {
                return [{ identifier: node, value }];
              }
              if (node?.type === "AssignmentPattern") {
                const useDefault =
                  value === undefined ||
                  isGlobalIdentifier(unwrapExpression(value), "undefined") ||
                  (unwrapExpression(value)?.type === "UnaryExpression" &&
                    unwrapExpression(value).operator === "void");
                return bindingWrites(
                  node.left,
                  useDefault ? node.right : value,
                );
              }
              if (node?.type === "RestElement") {
                return bindingWrites(node.argument, value);
              }
              if (node?.type === "ArrayPattern") {
                const flattenArrayElements = (array) =>
                  array.elements.flatMap((element) =>
                    element?.type === "SpreadElement" &&
                    unwrapExpression(element.argument)?.type ===
                      "ArrayExpression"
                      ? flattenArrayElements(
                          unwrapExpression(element.argument),
                        )
                      : element?.type === "SpreadElement"
                        ? [
                            {
                              ...unknownLookupExpression,
                              source: element.argument,
                            },
                          ]
                        : [element],
                  );
                const flattened =
                  value?.type === "ArrayExpression"
                    ? flattenArrayElements(value)
                    : undefined;
                const firstUnknownIndex = flattened?.findIndex(
                  (element) => element?.aetherUnknownLookup,
                );
                const arrayElements = flattened?.map((element, index) =>
                  firstUnknownIndex !== undefined &&
                  firstUnknownIndex >= 0 &&
                  index >= firstUnknownIndex
                    ? flattened[firstUnknownIndex]
                    : element,
                );
                return node.elements.flatMap((element, index) =>
                  element === null
                    ? []
                    : bindingWrites(
                        element,
                        arrayElements !== undefined
                          ? element.type === "RestElement"
                            ? {
                                type: "ArrayExpression",
                                elements: arrayElements.slice(index),
                              }
                            : arrayElements[index]
                          : value,
                      ),
                );
              }
              if (node?.type === "ObjectPattern") {
                return node.properties.flatMap((property) =>
                  property.type === "Property"
                    ? bindingWrites(
                        property.value,
                        objectBindingValue(
                          value,
                          propertyName(property),
                        ),
                      )
                    : bindingWrites(property.argument, value),
                );
              }
              return [];
            };
            for (const write of lookupWrites) {
              if (write.right === null || write.right === undefined) continue;
              for (const binding of bindingWrites(write.left, write.right)) {
                const variable = variableForIdentifier(binding.identifier);
                if (variable === undefined) continue;
                const writes = lookupWritesByVariable.get(variable) ?? [];
                writes.push({ ...write, right: binding.value });
                lookupWritesByVariable.set(variable, writes);
              }
            }
            const staticNonnegativeIndex = (node, resolving = new Set()) => {
              node = unwrapExpression(node);
              if (
                node?.type === "Literal" &&
                typeof node.value === "number" &&
                Number.isInteger(node.value) &&
                node.value >= 0
              ) {
                return node.value;
              }
              const stringValue = staticStringExpression(node, resolving);
              if (stringValue !== undefined && /^(?:0|[1-9]\d*)$/u.test(stringValue)) {
                return Number(stringValue);
              }
              if (node?.type !== "Identifier") return undefined;
              const variable = variableForIdentifier(node);
              if (
                variable === undefined ||
                !constantInitializers.has(variable) ||
                resolving.has(variable)
              ) {
                return undefined;
              }
              const nextResolving = new Set(resolving);
              nextResolving.add(variable);
              return staticNonnegativeIndex(
                constantInitializers.get(variable),
                nextResolving,
              );
            };
            const lookupForExpression = (
              node,
              atOffset = Number.POSITIVE_INFINITY,
              resolving = new Set(),
            ) => {
              node = unwrapExpression(node);
              if (node?.aetherUnknownLookup) {
                return {
                  method: "querySelector",
                  selector: undefined,
                  unknown: true,
                };
              }
              if (node?.type === "Identifier") {
                const variable = variableForIdentifier(node);
                if (variable === undefined || resolving.has(variable)) {
                  return undefined;
                }
                const writes = lookupWritesByVariable.get(variable) ?? [];
                const write = writes.findLast(
                  (candidate) => candidate.node.range[0] < atOffset,
                );
                if (write !== undefined) {
                  const nextResolving = new Set(resolving);
                  nextResolving.add(variable);
                  return lookupForExpression(
                    write.right,
                    write.node.range[0],
                    nextResolving,
                  );
                }
                if (lookupTargets.has(variable)) {
                  return lookupTargets.get(variable);
                }
                return undefined;
              }
              const directLookup = documentLookup(node);
              if (directLookup !== undefined) return directLookup;
              if (
                node?.type === "MemberExpression" &&
                node.computed &&
                staticNonnegativeIndex(node.property) !== undefined
              ) {
                const object = unwrapExpression(node.object);
                if (object?.type === "Identifier") {
                  const variable = variableForIdentifier(object);
                  const write = (
                    lookupWritesByVariable.get(variable) ?? []
                  ).findLast(
                    (candidate) => candidate.node.range[0] < atOffset,
                  );
                  const value = unwrapExpression(write?.right);
                  if (value?.type === "ArrayExpression") {
                    const element =
                      value.elements[
                        staticNonnegativeIndex(node.property)
                      ];
                    if (element !== null && element !== undefined) {
                      return lookupForExpression(
                        element,
                        write.node.range[0],
                        resolving,
                      );
                    }
                  }
                }
                const collectionLookup = lookupForExpression(
                  node.object,
                  atOffset,
                  resolving,
                );
                if (collectionLookup?.method === "querySelectorAll") {
                  return {
                    ...collectionLookup,
                    method: "querySelector",
                  };
                }
              }
              if (node?.type === "CallExpression") {
                const callee = unwrapExpression(node.callee);
                if (
                  callee?.type === "MemberExpression" &&
                  memberName(callee) === "item"
                ) {
                  const collectionLookup = lookupForExpression(
                    callee.object,
                    atOffset,
                    resolving,
                  );
                  if (collectionLookup?.method === "querySelectorAll") {
                    return {
                      ...collectionLookup,
                      method: "querySelector",
                    };
                  }
                }
              }
              return undefined;
            };

            for (const call of callExpressions) {
              const callee = unwrapExpression(call.callee);
              if (
                callee?.type !== "MemberExpression" ||
                memberName(callee) !== "forEach"
              ) {
                continue;
              }
              const collectionLookup = lookupForExpression(
                callee.object,
                call.range[0],
              );
              let callback = unwrapExpression(call.arguments[0]);
              if (callback?.type === "Identifier") {
                const callbackVariable = variableForIdentifier(callback);
                const definition =
                  callbackVariable?.defs.length === 1
                    ? callbackVariable.defs[0]
                    : undefined;
                if (definition?.type === "FunctionName") {
                  callback = definition.node;
                } else if (
                  definition?.type === "Variable" &&
                  definition.node.id === definition.name
                ) {
                  callback = unwrapExpression(definition.node.init);
                }
              }
              const parameter = callback?.params?.[0];
              if (
                collectionLookup?.method === "querySelectorAll" &&
                parameter?.type === "Identifier"
              ) {
                const variable = variableForIdentifier(parameter);
                if (variable) {
                  lookupTargets.set(variable, {
                    ...collectionLookup,
                    method: "querySelector",
                  });
                }
              }
            }

            for (const statement of forOfStatements) {
              const collectionLookup = lookupForExpression(
                statement.right,
                statement.range[0],
              );
              const declaration =
                statement.left.type === "VariableDeclaration"
                  ? statement.left.declarations[0]?.id
                  : statement.left;
              if (
                collectionLookup?.method === "querySelectorAll" &&
                declaration?.type === "Identifier"
              ) {
                const variable = variableForIdentifier(declaration);
                if (variable !== undefined) {
                  lookupTargets.set(variable, {
                    ...collectionLookup,
                    method: "querySelector",
                  });
                }
              }
            }
            const selectorTargetCompound = (selector) => {
              let bracketDepth = 0;
              let parenthesisDepth = 0;
              let quote;
              for (let index = selector.length - 1; index >= 0; index -= 1) {
                const character = selector[index];
                if (quote !== undefined) {
                  if (character === quote && selector[index - 1] !== "\\") {
                    quote = undefined;
                  }
                  continue;
                }
                if (character === '"' || character === "'") {
                  quote = character;
                } else if (character === "]") {
                  bracketDepth += 1;
                } else if (character === "[") {
                  bracketDepth -= 1;
                } else if (character === ")") {
                  parenthesisDepth += 1;
                } else if (character === "(") {
                  parenthesisDepth -= 1;
                } else if (
                  bracketDepth === 0 &&
                  parenthesisDepth === 0 &&
                  (/\s/u.test(character) || /[>+~]/u.test(character))
                ) {
                  return selector.slice(index + 1).trim();
                }
              }
              return selector.trim();
            };
            const splitSelectorList = (selector) => {
              const parts = [];
              let start = 0;
              let bracketDepth = 0;
              let parenthesisDepth = 0;
              let quote;
              for (let index = 0; index < selector.length; index += 1) {
                const character = selector[index];
                if (quote !== undefined) {
                  if (character === quote && selector[index - 1] !== "\\") {
                    quote = undefined;
                  }
                } else if (character === '"' || character === "'") {
                  quote = character;
                } else if (character === "[") {
                  bracketDepth += 1;
                } else if (character === "]") {
                  bracketDepth -= 1;
                } else if (character === "(") {
                  parenthesisDepth += 1;
                } else if (character === ")") {
                  parenthesisDepth -= 1;
                } else if (
                  character === "," &&
                  bracketDepth === 0 &&
                  parenthesisDepth === 0
                ) {
                  parts.push(selector.slice(start, index));
                  start = index + 1;
                }
              }
              parts.push(selector.slice(start));
              return parts;
            };
            const selectorCanvasStatuses = (selector) =>
              splitSelectorList(selector).map((selectorPart) => {
                const compound = selectorTargetCompound(selectorPart);
                let positiveCompound = "";
                for (let index = 0; index < compound.length; index += 1) {
                  if (
                    compound.slice(index, index + 5).toLowerCase() !==
                    ":not("
                  ) {
                    positiveCompound += compound[index];
                    continue;
                  }
                  let depth = 1;
                  let quote;
                  index += 5;
                  for (; index < compound.length && depth > 0; index += 1) {
                    const character = compound[index];
                    if (quote !== undefined) {
                      if (
                        character === quote &&
                        compound[index - 1] !== "\\"
                      ) {
                        quote = undefined;
                      }
                    } else if (character === '"' || character === "'") {
                      quote = character;
                    } else if (character === "(") {
                      depth += 1;
                    } else if (character === ")") {
                      depth -= 1;
                    }
                  }
                  index -= 1;
                }
                const explicitCanvas =
                  /^canvas(?=$|[.#[:])/iu.test(positiveCompound) ||
                  /:(?:is|where)\([^)]*\bcanvas(?=$|[.#[:\s,)])/iu.test(
                    positiveCompound,
                  );
                const id =
                  positiveCompound.match(/#([A-Za-z_][\w-]*)/u)?.[1];
                const classes = [
                  ...positiveCompound.matchAll(/\.([A-Za-z_][\w-]*)/gu),
                ].map((match) => match[1]);
                const attributes = [
                  ...positiveCompound.matchAll(
                    /\[([A-Za-z_][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]/gu,
                  ),
                ].map((match) => ({
                  name: match[1],
                  value: match[2] ?? match[3] ?? match[4],
                }));
                const selectorAssertsMarker = attributes.some(
                  ({ name, value }) =>
                    name === nonDrawingCanvasMarker &&
                    value === "non-drawing",
                );
                const matchingCanvases = canvasDescriptors.filter(
                  (canvas) =>
                    (id === undefined || canvas.id === id) &&
                    classes.every((className) =>
                      canvas.classes.has(className),
                    ) &&
                    attributes.every(
                      ({ name, value }) =>
                        canvas.attributes.has(name) &&
                        (value === undefined ||
                          canvas.attributes.get(name) === value),
                    ),
                );
                return {
                  provesMarked:
                    matchingCanvases.length > 0 &&
                    matchingCanvases.every((canvas) => canvas.marked),
                  targetsUnmarked:
                    matchingCanvases.length > 0
                      ? matchingCanvases.some((canvas) => !canvas.marked)
                      : explicitCanvas && !selectorAssertsMarker,
                };
              });
            const selectorTargetsCanvas = (selector) =>
              selectorCanvasStatuses(selector).some(
                ({ targetsUnmarked }) => targetsUnmarked,
              );
            const lookupProvesMarkedCanvas = (lookup) => {
              if (lookup?.selector === undefined) return false;
              if (lookup.method === "getElementById") {
                const matchingCanvases = canvasDescriptors.filter(
                  (canvas) => canvas.id === lookup.selector,
                );
                return (
                  matchingCanvases.length > 0 &&
                  matchingCanvases.every((canvas) => canvas.marked)
                );
              }
              return selectorCanvasStatuses(lookup.selector).every(
                ({ provesMarked }) => provesMarked,
              );
            };
            const lookupTargetsCanvas = (lookup) => {
              if (lookup === undefined) return false;
              if (lookup.selector === undefined) {
                return (
                  lookup.method === "getElementById" ||
                  lookup.method === "querySelector" ||
                  lookup.method === "querySelectorAll"
                );
              }
              if (lookup.method === "getElementById") {
                const matchingCanvases = canvasDescriptors.filter(
                  (canvas) => canvas.id === lookup.selector,
                );
                return (
                  matchingCanvases.length > 0 &&
                  matchingCanvases.some(() => true)
                );
              }
              return (
                selectorTargetsCanvas(lookup.selector) ||
                selectorCanvasStatuses(lookup.selector).some(
                  ({ provesMarked }) => provesMarked,
                )
              );
            };

            const straightLineBlock = (node) => {
              let current = node;
              while (current?.parent) {
                const parent = current.parent;
                if (
                  parent.type === "Program" ||
                  parent.type === "BlockStatement"
                ) {
                  return parent;
                }
                if (
                  parent.type === "IfStatement" ||
                  parent.type === "ConditionalExpression" ||
                  parent.type === "LogicalExpression" ||
                  parent.type === "SwitchCase" ||
                  parent.type === "TryStatement" ||
                  parent.type === "CatchClause" ||
                  /^(?:DoWhile|For|ForIn|ForOf|While)Statement$/u.test(
                    parent.type,
                  ) ||
                  /^(?:Arrow)?Function/u.test(parent.type)
                ) {
                  return undefined;
                }
                current = parent;
              }
              return undefined;
            };
            const isUnconditionalWriteAt = (write, sink) =>
              straightLineBlock(write) !== undefined &&
              straightLineBlock(write) === straightLineBlock(sink);
            const selected2dContextCalls = callExpressions.filter((call) => {
              const callee = unwrapExpression(call.callee);
              return (
                callee?.type === "MemberExpression" &&
                memberName(callee) === "getContext" &&
                staticStringExpression(call.arguments[0]) === "2d"
              );
            });
            const unprovenSelected2dContextCalls =
              selected2dContextCalls.filter((call) => {
                const callee = unwrapExpression(call.callee);
                const lookup = lookupForExpression(
                  callee.object,
                  call.range[0],
                );
                return !lookupProvesMarkedCanvas(lookup);
              });
            const strokeCaptureMethods = new Set([
              "beginPath",
              "closePath",
              "lineTo",
              "moveTo",
              "quadraticCurveTo",
              "bezierCurveTo",
              "stroke",
              "strokeRect",
              "toBlob",
              "toDataURL",
            ]);
            const canvasExportMethods = new Set(["toBlob", "toDataURL"]);
            const expressionImplementation = (
              expression,
              seen = new Set(),
            ) => {
              expression = unwrapExpression(expression);
              if (!expression || seen.has(expression)) return undefined;
              const nextSeen = new Set(seen);
              nextSeen.add(expression);
              if (expression.type === "MemberExpression") {
                const name = memberName(expression);
                let object = unwrapExpression(expression.object);
                if (object?.type === "Identifier") {
                  const variable = variableForIdentifier(object);
                  const definition =
                    variable?.defs.length === 1
                      ? variable.defs[0]
                      : undefined;
                  if (definition?.type === "Variable") {
                    object = unwrapExpression(definition.node.init);
                  }
                }
                if (name !== undefined && object?.type === "ObjectExpression") {
                  for (
                    let index = object.properties.length - 1;
                    index >= 0;
                    index -= 1
                  ) {
                    const property = object.properties[index];
                    if (property.type === "SpreadElement") {
                      const spreadValue = expressionImplementation(
                        {
                          type: "MemberExpression",
                          object: property.argument,
                          property: {
                            type: "Literal",
                            value: name,
                          },
                          computed: true,
                        },
                        nextSeen,
                      );
                      if (spreadValue !== undefined) return spreadValue;
                    } else if (propertyName(property) === name) {
                      return expressionImplementation(
                        property.value,
                        nextSeen,
                      );
                    }
                  }
                }
                return undefined;
              }
              if (expression.type !== "Identifier") return expression;
              const variable = variableForIdentifier(expression);
              const definition =
                variable?.defs.length === 1 ? variable.defs[0] : undefined;
              if (definition?.type === "FunctionName") {
                return definition.node;
              }
              if (definition?.type === "Variable") {
                return expressionImplementation(
                  definition.node.init,
                  nextSeen,
                );
              }
              return undefined;
            };
            const handlerImplementation = (attribute) =>
              attribute.value?.type === "JSXExpressionContainer"
                ? expressionImplementation(attribute.value.expression)
                : undefined;
            const selected2dContextVariables = new Set(
              variableDeclarations.flatMap((declaration) => {
                const initializer = unwrapExpression(declaration.init);
                return selected2dContextCalls.includes(initializer)
                  ? [variableForIdentifier(declaration.id)]
                  : [];
              }),
            );
            const emptySelectedBindings = () => ({
              variables: new Set(),
              members: new Map(),
            });
            const variableAliasesVariable = (
              candidate,
              expected,
              before,
              seen = new Set(),
            ) => {
              if (!candidate || !expected || seen.has(candidate)) return false;
              if (candidate === expected) return true;
              if (
                assignmentExpressions.some((assignment) => {
                  const target = unwrapExpression(assignment.left);
                  return (
                    assignment.range[0] < before &&
                    target?.type === "Identifier" &&
                    variableForIdentifier(target) === candidate
                  );
                })
              ) {
                return false;
              }
              const definition =
                candidate.defs.length === 1 ? candidate.defs[0] : undefined;
              const initializer =
                definition?.type === "Variable"
                  ? unwrapExpression(definition.node.init)
                  : undefined;
              if (initializer?.type !== "Identifier") return false;
              const nextSeen = new Set(seen);
              nextSeen.add(candidate);
              return variableAliasesVariable(
                variableForIdentifier(initializer),
                expected,
                before,
                nextSeen,
              );
            };
            function selectedContextMemberNames(
              expression,
              seen = new Set(),
              selectedBindings = emptySelectedBindings(),
              atNode = expression,
              activationNode = atNode,
            ) {
              expression = unwrapExpression(expression);
              if (!expression || seen.has(expression)) return new Set();
              const before =
                atNode?.range?.[0] ?? Number.POSITIVE_INFINITY;
              const nextSeen = new Set(seen);
              nextSeen.add(expression);
              if (expression.type === "Identifier") {
                const variable = variableForIdentifier(expression);
                const names = new Set(
                  selectedBindings.members.get(variable) ?? [],
                );
                const definition =
                  variable?.defs.length === 1
                    ? variable.defs[0]
                    : undefined;
                if (definition?.type === "Variable") {
                  for (const name of selectedContextMemberNames(
                    definition.node.init,
                    nextSeen,
                    selectedBindings,
                    atNode,
                    activationNode,
                  )) {
                    names.add(name);
                  }
                }
                const memberWrites = assignmentExpressions
                  .filter((assignment) => {
                    const target = unwrapExpression(assignment.left);
                    const object =
                      target?.type === "MemberExpression"
                        ? unwrapExpression(target.object)
                        : undefined;
                    const name =
                      target?.type === "MemberExpression"
                        ? memberName(target)
                        : undefined;
                    return (
                      (assignment.range[0] < before ||
                        (definition?.type === "Variable" &&
                          assignment.range[0] <
                            (activationNode?.range?.[0] ??
                              Number.POSITIVE_INFINITY) &&
                          straightLineBlock(assignment) ===
                            straightLineBlock(definition.node) &&
                          straightLineBlock(atNode) !==
                            straightLineBlock(definition.node))) &&
                      object?.type === "Identifier" &&
                      variableAliasesVariable(
                        variableForIdentifier(object),
                        variable,
                        assignment.range[0],
                      ) &&
                      name !== undefined
                    );
                  })
                  .sort((left, right) => left.range[0] - right.range[0]);
                for (const assignment of memberWrites) {
                  const name = memberName(
                    unwrapExpression(assignment.left),
                  );
                  if (
                    expressionIsSelected2dContext(
                      assignment.right,
                      nextSeen,
                      selectedBindings,
                    )
                  ) {
                    names.add(name);
                  } else if (
                    assignment.operator === "=" &&
                    (isUnconditionalWriteAt(assignment, atNode) ||
                      (definition?.type === "Variable" &&
                        straightLineBlock(assignment) ===
                          straightLineBlock(definition.node)))
                  ) {
                    names.delete(name);
                  }
                }
                return names;
              }
              if (expression.type === "ObjectExpression") {
                const names = new Set();
                const decided = new Set();
                for (
                  let index = expression.properties.length - 1;
                  index >= 0;
                  index -= 1
                ) {
                  const property = expression.properties[index];
                  if (property.type === "SpreadElement") {
                    for (const name of selectedContextMemberNames(
                      property.argument,
                      nextSeen,
                      selectedBindings,
                      atNode,
                      activationNode,
                    )) {
                      if (!decided.has(name)) names.add(name);
                    }
                    continue;
                  }
                  const name = propertyName(property);
                  if (name === undefined || decided.has(name)) continue;
                  decided.add(name);
                  if (
                    expressionIsSelected2dContext(
                      property.value,
                      nextSeen,
                      selectedBindings,
                    )
                  ) {
                    names.add(name);
                  }
                }
                return names;
              }
              if (
                expression.type === "ConditionalExpression" ||
                expression.type === "LogicalExpression"
              ) {
                const branches =
                  expression.type === "ConditionalExpression"
                    ? [expression.consequent, expression.alternate]
                    : [expression.left, expression.right];
                const names = new Set();
                for (const branch of branches) {
                  for (const name of selectedContextMemberNames(
                    branch,
                    nextSeen,
                    selectedBindings,
                    atNode,
                    activationNode,
                  )) {
                    names.add(name);
                  }
                }
                return names;
              }
              return new Set();
            }
            function expressionIsSelected2dContext(
              expression,
              seen = new Set(),
              selectedBindings = emptySelectedBindings(),
            ) {
              expression = unwrapExpression(expression);
              if (!expression || seen.has(expression)) return false;
              if (selected2dContextCalls.includes(expression)) return true;
              if (
                expression.type === "LogicalExpression" &&
                (expression.operator === "&&" ||
                  expression.operator === "||" ||
                  (expression.operator === "??" &&
                    unwrapExpression(expression.right)?.type === "Literal" &&
                    unwrapExpression(expression.right)?.value === null))
              ) {
                return (
                  expressionIsSelected2dContext(
                    expression.left,
                    seen,
                    selectedBindings,
                  ) ||
                  expressionIsSelected2dContext(
                    expression.right,
                    seen,
                    selectedBindings,
                  )
                );
              }
              if (expression.type === "ConditionalExpression") {
                return (
                  expressionIsSelected2dContext(
                    expression.consequent,
                    seen,
                    selectedBindings,
                  ) ||
                  expressionIsSelected2dContext(
                    expression.alternate,
                    seen,
                    selectedBindings,
                  )
                );
              }
              if (expression.type === "MemberExpression") {
                const object = unwrapExpression(expression.object);
                if (
                  object?.type === "Identifier" &&
                  selectedBindings.variables.has(
                    variableForIdentifier(object),
                  )
                ) {
                  return true;
                }
                const name = memberName(expression);
                if (name === undefined) return false;
                return selectedContextMemberNames(
                  object,
                  seen,
                  selectedBindings,
                  expression.range[0],
                ).has(name);
              }
              if (expression.type !== "Identifier") return false;
              const variable = variableForIdentifier(expression);
              if (selectedBindings.variables.has(variable)) return true;
              if (selected2dContextVariables.has(variable)) return true;
              const nextSeen = new Set(seen);
              nextSeen.add(expression);
              const latestAssignment = assignmentExpressions
                .filter(
                  (assignment) =>
                    assignment.range[0] < expression.range[0] &&
                    unwrapExpression(assignment.left)?.type === "Identifier" &&
                    variableForIdentifier(
                      unwrapExpression(assignment.left),
                    ) === variable,
                )
                .sort((left, right) => right.range[0] - left.range[0])[0];
              if (
                latestAssignment &&
                expressionIsSelected2dContext(
                  latestAssignment.right,
                  nextSeen,
                  selectedBindings,
                )
              ) {
                return true;
              }
              const definition =
                variable?.defs.length === 1 ? variable.defs[0] : undefined;
              if (definition?.type !== "Variable") return false;
              return expressionIsSelected2dContext(
                definition.node.init,
                nextSeen,
                selectedBindings,
              );
            }
            const callPaintsOrExportsSelectedCanvas = (
              call,
              selectedBindings,
            ) => {
              const callee = unwrapExpression(call.callee);
              if (callee?.type !== "MemberExpression") return false;
              if (
                expressionIsSelected2dContext(
                  callee.object,
                  new Set(),
                  selectedBindings,
                )
              ) {
                return true;
              }
              return (
                canvasExportMethods.has(memberName(callee)) &&
                lookupTargetsCanvas(
                  lookupForExpression(callee.object, call.range[0]),
                )
              );
            };
            const selectedBindingsForCall = (
              call,
              implementation,
              inheritedBindings,
              activationNode = call,
            ) => {
              const selected = new Set();
              const selectedMembers = new Map();
              const addSelectedMember = (variable, name) => {
                if (!variable || name === undefined) return;
                const names = selectedMembers.get(variable) ?? new Set();
                names.add(name);
                selectedMembers.set(variable, names);
              };
              const addSelectedBindings = (parameter, argument) => {
                parameter = unwrapExpression(parameter);
                argument = unwrapExpression(argument);
                if (parameter?.type === "AssignmentPattern") {
                  addSelectedBindings(
                    parameter.left,
                    argument ?? parameter.right,
                  );
                  return;
                }
                if (parameter?.type === "Identifier") {
                  if (
                    expressionIsSelected2dContext(
                      argument,
                      new Set(),
                      inheritedBindings,
                    )
                  ) {
                    const variable = variableForIdentifier(parameter);
                    if (variable) selected.add(variable);
                  } else {
                    const variable = variableForIdentifier(parameter);
                    for (const name of selectedContextMemberNames(
                      argument,
                      new Set(),
                      inheritedBindings,
                      call,
                      activationNode,
                    )) {
                      addSelectedMember(variable, name);
                    }
                  }
                  return;
                }
                const resolvedArgument = expressionImplementation(argument);
                if (
                  resolvedArgument?.type === "ObjectExpression" ||
                  resolvedArgument?.type === "ArrayExpression"
                ) {
                  argument = resolvedArgument;
                }
                if (
                  parameter?.type === "ObjectPattern" &&
                  argument?.type === "ObjectExpression"
                ) {
                  for (const property of parameter.properties) {
                    if (property.type !== "Property") continue;
                    const name = propertyName(property);
                    const argumentProperty = argument.properties.find(
                      (candidate) =>
                        candidate.type === "Property" &&
                        propertyName(candidate) === name,
                    );
                    if (argumentProperty) {
                      addSelectedBindings(
                        property.value,
                        argumentProperty.value,
                      );
                    }
                  }
                  return;
                }
                if (
                  parameter?.type === "ArrayPattern" &&
                  argument?.type === "ArrayExpression"
                ) {
                  parameter.elements.forEach((element, index) => {
                    if (element && argument.elements[index]) {
                      addSelectedBindings(
                        element,
                        argument.elements[index],
                      );
                    }
                  });
                }
              };
              (implementation?.params ?? []).forEach((parameter, index) => {
                if (parameter.type === "RestElement") {
                  if (
                    call.arguments.slice(index).some(
                      (argument) =>
                        argument.type !== "SpreadElement" &&
                        expressionIsSelected2dContext(
                          argument,
                          new Set(),
                          inheritedBindings,
                        ),
                    )
                  ) {
                    const variable = variableForIdentifier(parameter.argument);
                    if (variable) selected.add(variable);
                  }
                  return;
                }
                const argument = call.arguments[index];
                if (argument?.type !== "SpreadElement") {
                  addSelectedBindings(parameter, argument);
                }
              });
              return {
                variables: selected,
                members: selectedMembers,
              };
            };
            const implementationCapturesStroke = (
              implementation,
              seen = new Set(),
              selectedBindings = {
                variables: new Set(),
                members: new Map(),
              },
              activationNode = implementation,
            ) => {
              if (!implementation?.range) return false;
              if (seen.has(implementation)) return false;
              const nextSeen = new Set(seen);
              nextSeen.add(implementation);
              return callExpressions.some((call) => {
                if (
                  call.range[0] < implementation.range[0] ||
                  call.range[1] > implementation.range[1]
                ) {
                  return false;
                }
                const callee = unwrapExpression(call.callee);
                return (
                  callPaintsOrExportsSelectedCanvas(
                    call,
                    selectedBindings,
                  )
                ) || (
                  (callee?.type === "Identifier" ||
                    callee?.type === "MemberExpression") &&
                  implementationCapturesStroke(
                    expressionImplementation(callee),
                    nextSeen,
                    selectedBindingsForCall(
                      call,
                      expressionImplementation(callee),
                      selectedBindings,
                      activationNode,
                    ),
                    activationNode,
                  )
                );
              });
            };
            const handlerCapturesStroke = (attribute) =>
              selected2dContextCalls.length > 0 &&
              implementationCapturesStroke(
                handlerImplementation(attribute),
                new Set(),
                emptySelectedBindings(),
                attribute,
              );
            const unknownMutatedStaticValue = {
              staticType: "unknown-mutated",
            };
            const staticValueWrites = [
              ...variableDeclarations.map((declaration) => ({
                node: declaration,
                target: declaration.id,
                value: declaration.init,
                initialization: true,
              })),
              ...assignmentExpressions.map((assignment) => ({
                node: assignment,
                target: unwrapExpression(assignment.left),
                value: assignment.right,
                initialization: false,
                operator: assignment.operator,
              })),
            ].sort((left, right) => left.node.range[0] - right.node.range[0]);
            const resolveStaticValue = (
              node,
              atNode,
            ) => {
              const atOffset =
                atNode?.range?.[0] ?? Number.POSITIVE_INFINITY;
              const state = new Map();
              const staticScalar = (value) => {
                if (
                  value?.type === "Literal" &&
                  (typeof value.value === "string" ||
                    typeof value.value === "number")
                ) {
                  return value.value;
                }
                return undefined;
              };
              const evaluate = (expression) => {
                expression = unwrapExpression(expression);
                if (
                  expression?.staticType === "object" ||
                  expression?.staticType === "array" ||
                  expression?.staticType === "alternatives" ||
                  expression?.staticType === "unknown-mutated"
                ) {
                  return expression;
                }
                if (expression?.type === "Identifier") {
                  return state.get(variableForIdentifier(expression));
                }
                if (
                  expression?.type === "Literal" ||
                  expression?.type === "TemplateLiteral"
                ) {
                  const value = staticStringExpression(expression);
                  return value === undefined
                    ? expression
                    : { type: "Literal", value };
                }
                if (
                  expression?.type === "BinaryExpression" &&
                  expression.operator === "+"
                ) {
                  const left = staticScalar(evaluate(expression.left));
                  const right = staticScalar(evaluate(expression.right));
                  return left === undefined || right === undefined
                    ? undefined
                    : { type: "Literal", value: String(left) + String(right) };
                }
                if (expression?.type === "MemberExpression") {
                  const container = evaluate(expression.object);
                  const key = expression.computed
                    ? staticScalar(evaluate(expression.property))
                    : expression.property.type === "Identifier"
                      ? expression.property.name
                      : undefined;
                  if (key === undefined || container === undefined) {
                    return undefined;
                  }
                  if (container.staticType === "unknown-mutated") {
                    return container;
                  }
                  if (container.staticType === "array") {
                    const index =
                      typeof key === "number"
                        ? key
                        : /^(?:0|[1-9]\d*)$/u.test(key)
                          ? Number(key)
                          : undefined;
                    if (index === undefined || !container.indexable) {
                      return container.mutationVersion > 0
                        ? unknownMutatedStaticValue
                        : undefined;
                    }
                    return (
                      container.elementVersions[index] ===
                      container.mutationVersion
                        ? container.elements[index]
                        : container.mutationVersion > 0
                          ? unknownMutatedStaticValue
                          : container.elements[index]
                    );
                  }
                  if (container.staticType !== "object") return undefined;
                  const name = String(key);
                  return (
                    container.propertyVersions.get(name) ===
                    container.mutationVersion
                      ? container.properties.get(name)
                      : container.mutationVersion > 0
                        ? unknownMutatedStaticValue
                        : container.properties.get(name)
                  );
                }
                if (expression?.type === "ObjectExpression") {
                  const properties = new Map();
                  const propertyVersions = new Map();
                  const propertyNodes = new Map();
                  let mutationVersion = 0;
                  let unknownNode;
                  for (const property of expression.properties) {
                    if (property.type === "SpreadElement") {
                      const spread = evaluate(property.argument);
                      if (spread?.staticType !== "object") {
                        mutationVersion += 1;
                        unknownNode = property;
                        continue;
                      }
                      if (spread.mutationVersion > 0) {
                        mutationVersion += 1;
                        unknownNode = spread.unknownNode ?? property;
                      }
                      for (const [name, value] of spread.properties) {
                        properties.set(
                          name,
                          spread.propertyVersions.get(name) ===
                            spread.mutationVersion
                            ? value
                            : unknownMutatedStaticValue,
                        );
                        propertyVersions.set(name, mutationVersion);
                        propertyNodes.set(
                          name,
                          spread.propertyNodes.get(name) ?? property,
                        );
                      }
                      continue;
                    }
                    const name = property.computed
                      ? staticScalar(evaluate(property.key))
                      : propertyName(property);
                    if (name === undefined) continue;
                    const value = evaluate(property.value);
                    properties.set(String(name), value);
                    propertyVersions.set(String(name), mutationVersion);
                    propertyNodes.set(String(name), property);
                  }
                  return {
                    staticType: "object",
                    properties,
                    propertyVersions,
                    propertyNodes,
                    mutationVersion,
                    unknownNode,
                  };
                }
                if (expression?.type === "ArrayExpression") {
                  const elements = [];
                  const elementVersions = [];
                  let indexable = true;
                  for (const element of expression.elements) {
                    if (element === null) {
                      elements.push(undefined);
                      elementVersions.push(0);
                    } else if (element.type === "SpreadElement") {
                      const spread = evaluate(element.argument);
                      if (
                        spread?.staticType !== "array" ||
                        !spread.indexable
                      ) {
                        indexable = false;
                      } else {
                        elements.push(...spread.elements);
                        elementVersions.push(
                          ...spread.elements.map(() => 0),
                        );
                      }
                    } else {
                      elements.push(evaluate(element));
                      elementVersions.push(0);
                    }
                  }
                  return {
                    staticType: "array",
                    elements,
                    elementVersions,
                    indexable,
                    mutationVersion: 0,
                  };
                }
                if (expression?.type === "SpreadElement") {
                  return evaluate(expression.argument);
                }
                if (expression?.type === "ConditionalExpression") {
                  return {
                    staticType: "alternatives",
                    values: [
                      evaluate(expression.consequent),
                      evaluate(expression.alternate),
                    ],
                  };
                }
                if (expression?.type === "SequenceExpression") {
                  return {
                    staticType: "alternatives",
                    values: expression.expressions.map(evaluate),
                  };
                }
                return undefined;
              };
              const mutateMember = (target, value) => {
                const container = evaluate(target.object);
                if (
                  container?.staticType !== "object" &&
                  container?.staticType !== "array"
                ) {
                  return;
                }
                const key = target.computed
                  ? staticScalar(evaluate(target.property))
                  : target.property.type === "Identifier"
                    ? target.property.name
                    : undefined;
                if (key === undefined) {
                  container.mutationVersion += 1;
                  return;
                }
                const resolvedValue =
                  value === undefined ? unknownMutatedStaticValue : value;
                if (container.staticType === "array") {
                  const index =
                    typeof key === "number"
                      ? key
                      : /^(?:0|[1-9]\d*)$/u.test(key)
                        ? Number(key)
                        : undefined;
                  if (index === undefined) {
                    container.mutationVersion += 1;
                    return;
                  }
                  container.elements[index] = resolvedValue;
                  container.elementVersions[index] =
                    container.mutationVersion;
                  return;
                }
                const name = String(key);
                container.properties.set(name, resolvedValue);
                container.propertyNodes.set(name, target);
                container.propertyVersions.set(
                  name,
                  container.mutationVersion,
                );
              };
              for (const write of staticValueWrites) {
                if (write.node.range[0] >= atOffset) break;
                if (write.target?.type === "Identifier") {
                  const variable = variableForIdentifier(write.target);
                  if (variable === undefined) continue;
                  const value =
                    write.operator !== undefined &&
                    (write.operator !== "=" ||
                      !isUnconditionalWriteAt(write.node, atNode))
                      ? undefined
                      : evaluate(write.value);
                  state.set(
                    variable,
                    !write.initialization && value === undefined
                      ? unknownMutatedStaticValue
                      : value,
                  );
                } else if (write.target?.type === "MemberExpression") {
                  mutateMember(
                    write.target,
                    write.operator === "=" &&
                      isUnconditionalWriteAt(write.node, atNode)
                      ? evaluate(write.value)
                      : undefined,
                  );
                }
              }
              return evaluate(node);
            };
            const stableVariableInitializer = (variable) => {
              const definition =
                variable?.defs.length === 1 ? variable.defs[0] : undefined;
              if (
                definition?.type !== "Variable" ||
                (definition.parent?.kind !== "const" &&
                  definition.parent?.kind !== "let")
              ) {
                return undefined;
              }
              if (
                definition.parent.kind === "let" &&
                variable.references.some(
                  (reference) =>
                    reference.isWrite() &&
                    reference.identifier !== definition.name,
                )
              ) {
                return undefined;
              }
              return definition;
            };
            const eventRegistrationBinding = (
              node,
              resolving = new Set(),
            ) => {
              node = unwrapExpression(node);
              if (isGlobalIdentifier(node, "addEventListener")) return [];
              if (node?.type === "MemberExpression") {
                return memberName(node) === "addEventListener" &&
                  (isWindowExpression(node.object) ||
                    isDocumentExpression(node.object))
                  ? []
                  : undefined;
              }
              if (node?.type === "CallExpression") {
                const callee = unwrapExpression(node.callee);
                if (
                  callee?.type !== "MemberExpression" ||
                  memberName(callee) !== "bind"
                ) {
                  return undefined;
                }
                const binding = eventRegistrationBinding(
                  callee.object,
                  resolving,
                );
                return binding === undefined
                  ? undefined
                  : [
                      ...binding,
                      ...node.arguments.slice(1).map((argument) => ({
                        node: argument,
                        atNode: node,
                      })),
                    ];
              }
              if (node?.type !== "Identifier") return undefined;
              const variable = variableForIdentifier(node);
              if (variable === undefined || resolving.has(variable)) {
                return undefined;
              }
              const definition = stableVariableInitializer(variable);
              if (definition === undefined) return undefined;
              if (
                definition.node.id.type === "ObjectPattern" &&
                (isWindowExpression(definition.node.init) ||
                  isDocumentExpression(definition.node.init))
              ) {
                return definition.node.id.properties.some(
                  (property) =>
                    property.type === "Property" &&
                    propertyName(property) === "addEventListener" &&
                    property.value === definition.name,
                )
                  ? []
                  : undefined;
              }
              if (definition.node.id.type !== "Identifier") return undefined;
              const nextResolving = new Set(resolving);
              nextResolving.add(variable);
              return eventRegistrationBinding(
                definition.node.init,
                nextResolving,
              );
            };
            const eventRegistrationArguments = (call) => {
              const callee = unwrapExpression(call.callee);
              const binding = eventRegistrationBinding(callee);
              if (binding !== undefined) {
                return [
                  ...binding,
                  ...call.arguments.map((argument) => ({
                    node: argument,
                    atNode: call,
                  })),
                ];
              }
              if (
                callee?.type === "MemberExpression" &&
                ["call", "apply"].includes(memberName(callee))
              ) {
                const calledBinding = eventRegistrationBinding(
                  callee.object,
                );
                if (calledBinding !== undefined) {
                  const argumentsNode =
                    memberName(callee) === "call"
                      ? call.arguments.slice(1)
                      : call.arguments.slice(1, 2);
                  return [
                    ...calledBinding,
                    ...argumentsNode.map((argument) => ({
                      node: argument,
                      atNode: call,
                    })),
                  ];
                }
              }
              if (
                callee?.type === "MemberExpression" &&
                isGlobalIdentifier(callee.object, "Reflect") &&
                memberName(callee) === "apply"
              ) {
                const appliedBinding = eventRegistrationBinding(
                  call.arguments[0],
                );
                if (appliedBinding !== undefined) {
                  return [
                    ...appliedBinding,
                    ...call.arguments.slice(2, 3).map((argument) => ({
                      node: argument,
                      atNode: call,
                    })),
                  ];
                }
              }
              return undefined;
            };
            const isGlobalObjectAssign = (call) => {
              const callee = unwrapExpression(call.callee);
              return (
                callee?.type === "MemberExpression" &&
                isGlobalIdentifier(callee.object, "Object") &&
                memberName(callee) === "assign" &&
                (isWindowExpression(call.arguments[0]) ||
                  isDocumentExpression(call.arguments[0]))
              );
            };
            const drawingHandlerProperties = (
              node,
              atNode,
            ) => {
              const value = resolveStaticValue(node, atNode);
              if (value?.staticType === "unknown-mutated") return [node];
              if (value?.staticType !== "object") return [];
              const properties = [];
              if (value.mutationVersion > 0) {
                properties.push(value.unknownNode ?? node);
              }
              for (const [name] of value.properties) {
                if (!isDrawingDomEvent(name)) continue;
                properties.push(
                  value.propertyVersions.get(name) ===
                    value.mutationVersion
                    ? value.propertyNodes.get(name) ?? node
                    : value.unknownNode ?? node,
                );
              }
              return [...new Set(properties)];
            };
            const argumentContainsDrawingEvent = (
              node,
              atNode,
            ) => {
              node = resolveStaticValue(node, atNode);
              if (node === undefined) return false;
              if (node.staticType === "unknown-mutated") return true;
              if (node.staticType === "alternatives") {
                return node.values.some(
                  (value) =>
                    value !== undefined &&
                    argumentContainsDrawingEvent(value, atNode),
                );
              }
              if (node.staticType === "array") {
                return node.elements.some(
                  (element) =>
                    element !== undefined &&
                    argumentContainsDrawingEvent(element, atNode),
                );
              }
              if (node.staticType === "object") {
                if (node.mutationVersion > 0) return true;
                return [...node.properties.values()].some((value) =>
                  argumentContainsDrawingEvent(value, atNode),
                );
              }
              const value = staticStringExpression(node);
              if (value !== undefined && isDrawingDomEvent(value)) {
                return true;
              }
              if (
                node?.type === "ConditionalExpression"
              ) {
                return (
                  argumentContainsDrawingEvent(
                    node.consequent,
                    atNode,
                  ) ||
                  argumentContainsDrawingEvent(
                    node.alternate,
                    atNode,
                  )
                );
              }
              if (node?.type === "SequenceExpression") {
                return node.expressions.some((expression) =>
                  argumentContainsDrawingEvent(expression, atNode),
                );
              }
              return false;
            };
            const firstRegistrationArgumentCouldDraw = (
              registrationArguments,
            ) => {
              const first = registrationArguments[0];
              if (!first) return false;
              const value = resolveStaticValue(first.node, first.atNode);
              if (value === undefined) return true;
              if (value.staticType === "unknown-mutated") return true;
              if (value.staticType === "alternatives") {
                return value.values.some(
                  (candidate) =>
                    candidate === undefined ||
                    argumentContainsDrawingEvent(candidate, first.atNode),
                );
              }
              if (value.staticType === "array") {
                const eventName = value.elements[0];
                return (
                  eventName === undefined ||
                  argumentContainsDrawingEvent(eventName, first.atNode)
                );
              }
              return argumentContainsDrawingEvent(value, first.atNode);
            };

            for (const call of callExpressions) {
              if (!isGlobalObjectAssign(call)) continue;
              for (const argument of call.arguments.slice(1)) {
                for (const property of drawingHandlerProperties(
                  argument,
                  call,
                )) {
                  reportForbidden(property);
                }
              }
            }
            for (const attribute of jsxAttributes) {
              if (
                attribute.name.type === "JSXIdentifier" &&
                isDrawingDomEvent(attribute.name.name) &&
                handlerCapturesStroke(attribute)
              ) {
                reportForbidden(attribute);
              }
            }

            for (const call of callExpressions) {
              const callee = unwrapExpression(call.callee);
              const registrationArguments =
                eventRegistrationArguments(call);
              if (
                registrationArguments &&
                firstRegistrationArgumentCouldDraw(registrationArguments)
              ) {
                reportForbidden(call);
                continue;
              }
              if (
                callee?.type !== "MemberExpression" ||
                memberName(callee) !== "addEventListener" ||
                !lookupTargetsCanvas(
                  lookupForExpression(callee.object, call.range[0]),
                )
              ) {
                continue;
              }
              const eventName = staticStringExpression(call.arguments[0]);
              if (
                eventName === undefined ||
                isDrawingDomEvent(eventName)
              ) {
                reportForbidden(call);
              }
            }

            for (const assignment of assignmentExpressions) {
              const target = unwrapExpression(assignment.left);
              const handlerName =
                target?.type === "MemberExpression"
                  ? memberName(target)
                  : undefined;
              if (
                target?.type === "MemberExpression" &&
                (isWindowExpression(target.object) ||
                  isDocumentExpression(target.object)) &&
                handlerName !== undefined &&
                isDrawingDomEvent(handlerName)
              ) {
                reportForbidden(assignment);
                continue;
              }
              if (
                target?.type !== "MemberExpression" ||
                !lookupTargetsCanvas(
                  lookupForExpression(target.object, assignment.range[0]),
                )
              ) {
                continue;
              }
              if (
                handlerName === undefined ||
                /^on(?:pointer|mouse|touch)/iu.test(handlerName)
              ) {
                reportForbidden(assignment);
              }
            }

            for (const expression of importExpressions) {
              const specifier = staticStringExpression(expression.source);
              if (
                specifier === "signature_pad" ||
                specifier?.startsWith("signature_pad/")
              ) {
                reportForbidden(expression, "forbiddenImport");
              }
            }
            const hasStrokeCaptureCall = callExpressions.some((call) => {
              const callee = unwrapExpression(call.callee);
              return (
                callee?.type === "MemberExpression" &&
                strokeCaptureMethods.has(memberName(callee))
              );
            });
            if (
              !hasForbiddenReport &&
              unprovenSelected2dContextCalls.length > 0 &&
              (hasStrokeCaptureCall || jsxOpeningElements.length === 0)
            ) {
              reportForbidden(unprovenSelected2dContextCalls[0]);
            }
          },
        };
      },
    },
  },
};

const restrictedImportPatterns = [
  {
    group: ["framer-motion"],
    message:
      "Use `motion/react` instead (e.g. `import { motion, AnimatePresence } from \"motion/react\"`).",
  },
  {
    group: ["@radix-ui/react-*"],
    message:
      "Import Radix primitives from the unified `radix-ui` package (e.g. `import { Dialog } from \"radix-ui\"`), or use the vendored `@/components/ui/*` wrappers.",
  },
  {
    group: ["next", "next/*"],
    message:
      "This is a Vite SPA, not Next.js. Use react-router-dom for routing and plain modules — there is no `next` runtime.",
  },
  {
    group: ["redux", "react-redux", "jotai", "recoil"],
    message:
      "Use the pre-wired zustand store (`@/lib/store`) for shared state.",
  },
  {
    group: ["signature_pad", "signature_pad/*"],
    message:
      "Use the shared `@/components/pen-input` wrapper; app code never imports the drawing engine directly.",
  },
];

const penInputRestrictedImportPatterns = restrictedImportPatterns.filter(
  ({ group }) => !group.includes("signature_pad"),
);

const baseRestrictedSyntaxRules = [
  {
    selector:
      "MemberExpression[object.name='window'][property.name=/^(parent|top)$/]",
    message:
      "Parent-frame access is restricted to the locked console-capture and Cowork transport modules.",
  },
  {
    selector:
      "CallExpression[callee.name='postMessage'], CallExpression[callee.property.name='postMessage']",
    message:
      "postMessage is restricted to the locked console-capture and Cowork transport modules.",
  },
];

const penInputRestrictedSyntaxRules = [
  {
    selector:
      "ImportExpression[source.value='signature_pad'], ImportExpression[source.value=/^signature_pad\\//]",
    message:
      "Use the shared `@/components/pen-input` wrapper; app code never imports the drawing engine directly.",
  },
  {
    selector:
      "CallExpression[callee.name='require'][arguments.0.value='signature_pad'], CallExpression[callee.name='require'][arguments.0.value=/^signature_pad\\//]",
    message:
      "Use the shared `@/components/pen-input` wrapper; app code never imports the drawing engine directly.",
  },
];

// Flat config (ESLint 9). Standard Vite + React + TypeScript setup.
// `generated/` is excluded — it is autogenerated by the managed-apps `ms` CLI.
export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "generated",
      ".vite-cache",
      "*.timestamp-*.mjs",
    ],
  },
  {
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error",
    },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "aether-app": rawDrawingCanvasPlugin,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // Make the "use the installed package, not the familiar-but-wrong one"
      // guidance enforceable instead of prose-only. These specifiers resolve
      // transitively (e.g. framer-motion via motion, @radix-ui/react-* via the
      // unified radix-ui package), so without this rule a wrong import would
      // type-check and build cleanly — then drift from the template's intent.
      // `bun run check` runs lint, so this fails the check.
      "no-restricted-imports": [
        "error",
        {
          patterns: restrictedImportPatterns,
        },
      ],
      "no-restricted-syntax": [
        "error",
        ...baseRestrictedSyntaxRules,
        ...penInputRestrictedSyntaxRules,
      ],
      "aether-app/no-raw-drawing-canvas": "error",
    },
  },
  {
    files: [
      "src/components/pen-input.tsx",
      "src/lib/pdf-export.ts",
      ".aether-container-tests/support/pen-input-package-smoke.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: penInputRestrictedImportPatterns,
        },
      ],
      "no-restricted-syntax": ["error", ...baseRestrictedSyntaxRules],
      "aether-app/no-raw-drawing-canvas": "off",
    },
  },
  {
    files: [
      ".aether-container-tests/pen-input.test.tsx",
      ".aether-container-tests/support/field-service-pen-input-smoke.ts",
    ],
    rules: {
      "aether-app/no-raw-drawing-canvas": "off",
    },
  },
  {
    files: [
      "src/lib/console-capture.ts",
      "src/lib/cowork-parent-transport.ts",
      "src/lib/app-mounted-transport.ts",
      "src/lib/app-view-transport.ts",
    ],
    rules: {
      // Defense-in-depth for direct literal calls. The Python source-contract
      // guard pins the variable-backed runtime sender to its exact origin set.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name='postMessage'] Literal[value='*'], CallExpression[callee.property.name='postMessage'] Literal[value='*']",
          message:
            "Parent-frame messages must not use a direct wildcard target-origin literal.",
        },
      ],
    },
  },
  {
    // shadcn/ui components are vendored + pre-installed (the agent must not edit
    // them). They intentionally co-export a component plus its `cva` variants
    // (e.g. `buttonVariants`), which trips react-refresh. Silence the rule for the
    // ui/ directory only — it stays active for the agent's own pages/components.
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // `vite-dev-reload.ts` is inlined scaffold infra (the SSE dev-reload Vite
    // plugin — the agent must not edit it). It intercepts Vite's internal HMR
    // WebSocket payloads and Connect-style req/res objects, which are untyped,
    // and uses best-effort empty `catch {}` blocks around fire-and-forget
    // broadcasts. Silence `no-explicit-any` / `no-empty` for this one file —
    // both stay active for the agent's own code.
    files: ["vite-dev-reload.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-empty": "off",
    },
  }
);
