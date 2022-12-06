import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as types from "jscodeshift";
import * as path from "path";

import { makeError } from "./error-utils";
import globals from "./globals";
import hyphenateStyleName from "./hyphenateStyleName";
import {
  addDefaultImport,
  addNamedExports,
  hasNamedImports,
  removeNamedImports,
} from "./import-export-utils";
import maybeAddPxToNumber from "./maybeAddPxToNumber";

const CHECK_PRECEDENCE_COMMENT =
  process.env.CHECK_PRECEDENCE_COMMENT ?? " TODO: check CSS precedence";
const CLASS_NAMES_NAME = process.env.CLASS_NAMES_NAME ?? "classNames";
const CONTEXT_FILE_PATH =
  process.env.CONTEXT_FILE_PATH ?? "./context.example.js";

/**
 * transformer
 */
export default function transformer(file: types.FileInfo, api: types.API) {
  globals.filePath = file.path;
  let fileSource = file.source;

  const hasCssImport = hasNamedImports(fileSource, api, "aphrodite", ["css"]);
  const hasStyleSheetImport = hasNamedImports(fileSource, api, "aphrodite", [
    "StyleSheet",
  ]);

  if (hasCssImport) {
    // Remove aphrodite `css` utility function usage
    const rv1 = removeCssFunction(fileSource, api);
    fileSource = rv1.fileSource;

    // Remove aphrodite `css` import
    if (rv1.isCssFuncRemoved) {
      fileSource = removeNamedImports(fileSource, api, "aphrodite", ["css"]);
    }

    // Add the "classnames" import if we used "classNames" above
    if (rv1.didUseClassNames) {
      fileSource = addDefaultImport(
        fileSource,
        api,
        "classnames",
        CLASS_NAMES_NAME,
      );
    }
  }

  if (hasStyleSheetImport) {
    // Convert the aphrodite styles object to CSS
    const rv1 = convertStylesObjectToCss(fileSource, api);
    fileSource = rv1.fileSource;
    const { cssFileContents, isStylesExported, stylesVariableName } = rv1;

    if (cssFileContents) {
      // Remove aphrodite `StyleSheet` import
      fileSource = removeNamedImports(fileSource, api, "aphrodite", [
        "StyleSheet",
      ]);

      // Get the paths for the CSS Module
      const [cssModuleFullPath, cssModuleRelPath] = getCssModuleFilePaths(
        file.path,
      );

      // Write the CSS Module file
      writeCssModuleFile(cssModuleFullPath, cssFileContents);

      // Add the import for the CSS Module
      fileSource = addDefaultImport(
        fileSource,
        api,
        cssModuleRelPath,
        stylesVariableName,
      );

      // Add an export of the styles if needed
      if (isStylesExported) {
        fileSource = addNamedExports(fileSource, api, [stylesVariableName]);
      }
    }
  }

  return fileSource;
}

/**
 *
 */
function removeCssFunction(fileSource: string, api: types.API) {
  const j = api.jscodeshift;

  let isCssFuncRemoved = true;
  let didUseClassNames = false;
  const newFileSource = j(fileSource)
    .find(j.CallExpression)
    .forEach((path) => {
      const expression = path.value;
      if (expression.callee.type !== "Identifier") {
        return;
      }
      if (expression.callee.name !== "css") {
        return;
      }
      if (expression.arguments.length !== 1) {
        expression.callee.name = CLASS_NAMES_NAME;
        path.node.comments = path.node.comments ?? [];
        path.node.comments.push(
          j.commentLine(CHECK_PRECEDENCE_COMMENT, true, false),
        );
        didUseClassNames = true;
        return;
      }
      const arg = expression.arguments[0];
      switch (arg.type) {
        case "ArrayExpression":
          expression.callee.name = CLASS_NAMES_NAME;
          path.node.comments = path.node.comments ?? [];
          path.node.comments.push(
            j.commentLine(CHECK_PRECEDENCE_COMMENT, true, false),
          );
          didUseClassNames = true;
          return;
        case "LogicalExpression":
          expression.callee.name = CLASS_NAMES_NAME;
          didUseClassNames = true;
          return;
        case "ConditionalExpression":
        case "MemberExpression":
          j(path).replaceWith(arg);
          return;
        default:
          isCssFuncRemoved = false;
          throw makeError(`arg.type of "${arg.type}" is not handled`, arg, api);
      }
    })
    .toSource();

  return { fileSource: newFileSource, isCssFuncRemoved, didUseClassNames };
}

/**
 * getCssModuleFilePaths
 */
function getCssModuleFilePaths(componentFilePath: string) {
  const fullPath = componentFilePath.replace(/\.tsx$/, ".module.css");
  const relativePath = "./" + path.basename(fullPath);
  return [fullPath, relativePath];
}

/**
 * - convert Aphrodite styles object to CSS and return it
 * - remove the Aphrodite styles declaration
 */
type TConvertStyleObjectToCssReturnValue = {
  cssFileContents: string | null;
  fileSource: string;
  isStylesExported: boolean;
  stylesVariableName: string;
};

function convertStylesObjectToCss(
  fileSource: string,
  api: types.API,
): TConvertStyleObjectToCssReturnValue {
  const j = api.jscodeshift;

  let cssFileContents: string | null = null;
  let isStylesExported = false;
  let stylesVariableName = "errorGettingStylesVariableName";

  const newFileSource = j(fileSource)
    .find(j.VariableDeclaration)
    .forEach((path) => {
      // Get the Aphrodite styles object (argument to `StyleSheet.create()`)
      // and the styles variable name
      const { isExported, stylesObject, variableName } =
        getStylesObjectAndVariableName(path, api);

      // If there is no Aphrodite style variable declaration, move on to the next variable declaration
      if (!stylesObject) {
        return;
      }

      // Set the styles variable name so that it can be used when importing
      // the CSS Module. Set a flag if it is exported.
      stylesVariableName = variableName;
      isStylesExported = isExported;

      // Get an array of the styles object properties
      const ruleSetsProperties = stylesObject.properties.filter(
        (property): property is types.ObjectProperty => {
          return property.type === "ObjectProperty";
        },
      );

      // Get leading and trailing comments
      const [leadingComments, trailingComments] = getComments(
        isExported ? path.parent.value : path.value,
      );

      // Convert the Aphrodite objects into CSS rule sets and combine them
      // to form the new CSS file contents
      cssFileContents = [
        leadingComments,
        ruleSetsProperties
          .flatMap((ruleSetProperty) => {
            return convertToCssRuleSets(ruleSetProperty, api);
          })
          .join("\n\n"),
        trailingComments,
      ].join("");

      // Remove aphrodite styles variable declaration
      if (isExported) {
        j(path.parent).remove();
      } else {
        j(path).remove();
      }
    })
    .toSource();

  return {
    cssFileContents,
    fileSource: newFileSource,
    isStylesExported,
    stylesVariableName,
  };
}

/**
 * writeCssModuleFile
 */
function writeCssModuleFile(
  cssModuleFilePath: string,
  cssFileContents: string | null,
) {
  if (cssFileContents) {
    fs.writeFileSync(cssModuleFilePath, cssFileContents + "\n");
  }
}

/**
 * Get the object argument passed to `StyleSheet.create()`
 */
function getStylesObjectAndVariableName(
  variableDeclarationPath: types.ASTPath<types.VariableDeclaration>,
  api: types.API,
) {
  const variableDeclaration = variableDeclarationPath.value;
  if (variableDeclaration.declarations.length !== 1) {
    return {};
  }
  if (variableDeclaration.declarations[0].type !== "VariableDeclarator") {
    return {};
  }
  if (!variableDeclaration.declarations[0].init) {
    return {};
  }
  if (variableDeclaration.declarations[0].init.type !== "CallExpression") {
    return {};
  }
  const callExpression = variableDeclaration.declarations[0].init;
  if (callExpression.callee.type !== "MemberExpression") {
    return {};
  }
  if (callExpression.callee.object.type !== "Identifier") {
    return {};
  }
  if (callExpression.callee.object.name !== "StyleSheet") {
    return {};
  }
  if (callExpression.callee.property.type !== "Identifier") {
    return {};
  }
  if (callExpression.callee.property.name !== "create") {
    return {};
  }
  if (callExpression.arguments.length !== 1) {
    return {};
  }
  if (callExpression.arguments[0].type !== "ObjectExpression") {
    return {};
  }
  const stylesObject = callExpression.arguments[0];
  const variableName = getStylesVariableName(
    variableDeclaration.declarations[0],
    api,
  );
  const parent = variableDeclarationPath.parent;
  const isExported = parent.value.type === "ExportNamedDeclaration";
  return { isExported, stylesObject, variableName };
}

/**
 *
 */
function getStylesVariableName(
  variableDeclarator: types.VariableDeclarator,
  api: types.API,
) {
  if (variableDeclarator.id.type !== "Identifier") {
    throw makeError(
      `variableDeclarator type "${variableDeclarator.type}" not handled`,
      variableDeclarator,
      api,
    );
  }
  return variableDeclarator.id.name;
}

/**
 * Convert an Aphrodite rule set to CSS rule set(s). Return the CSS rule set(s)
 * as an array of strings.
 */
function convertToCssRuleSets(
  ruleSetProperty: types.ObjectProperty,
  api: types.API,
  selectorOverride?: string,
): string[] {
  if (ruleSetProperty.value.type !== "ObjectExpression") {
    throw makeError(
      `ruleSetProperty value type "${ruleSetProperty.value.type}" not handled`,
      ruleSetProperty,
      api,
    );
  }

  const properties = ruleSetProperty.value.properties.filter(
    (property): property is types.ObjectProperty => {
      if (property.type !== "ObjectProperty") {
        throw makeError(
          `property of type "${property.type}" not handled`,
          ruleSetProperty,
          api,
        );
      }
      return true;
    },
  );

  let className: string;
  switch (ruleSetProperty.key.type) {
    case "Identifier":
      className = ruleSetProperty.key.name;
      break;
    case "StringLiteral":
      // className shouldn't actually be used in this case because expect it will be a pseudo selector and this will be overridden
      className = ruleSetProperty.key.value;
      break;
    default:
      throw makeError(
        `ruleSetProperty key type "${ruleSetProperty.key.type}" not handled`,
        ruleSetProperty,
        api,
      );
  }

  // Separate pseudo selectors from normal style properties
  const isPseudoSelector = (property: types.ObjectProperty) =>
    property.key.type === "StringLiteral" && property.key.value.startsWith(":");
  const pseudoSelectorProperties = properties.filter(isPseudoSelector);
  const cssDeclarationsProperties = properties.filter(not(isPseudoSelector));

  // Get CSS declarations
  const cssDeclarations = cssDeclarationsProperties.map(
    (cssDeclarationProperty) => {
      return convertToCssDeclaration(cssDeclarationProperty, api);
    },
  );

  // Get leading and trailing comments
  const [leadingComments, trailingComments] = getComments(ruleSetProperty);

  // Make CSS rule set for normal style properties
  const cssRuleSet = [
    leadingComments,
    `${selectorOverride ?? "." + className} {\n`,
    cssDeclarations.join("\n") + "\n",
    "}",
    trailingComments,
  ].join("");

  // Make CSS rule sets for pseudo selectors
  const pseudoSelectorRuleSets = pseudoSelectorProperties.flatMap(
    (property) => {
      return convertPseudoSelectorRuleSet(property, api, className);
    },
  );

  return [cssRuleSet, ...pseudoSelectorRuleSets];
}

/**
 * convertPseudoSelectorRuleSet
 */
function convertPseudoSelectorRuleSet(
  property: types.ObjectProperty,
  api: types.API,
  className: string,
) {
  if (property.key.type !== "StringLiteral") {
    throw Error("key must be string");
  }
  const pseudoSelectorSuffix = property.key.value;
  return convertToCssRuleSets(
    property,
    api,
    `.${className}${pseudoSelectorSuffix}`,
  );
}

/**
 * Convert to a single CSS declaration line. Return the CSS declaration as a
 * string
 */
function convertToCssDeclaration(
  cssDeclarationProperty: types.ObjectProperty,
  api: types.API,
) {
  // Get CSS property name
  let camelCasedCssProperty = "initialized to appease typescript";
  let cssProperty = "initialized to appease typescript";
  switch (cssDeclarationProperty.key.type) {
    case "Identifier":
      camelCasedCssProperty = cssDeclarationProperty.key.name;
      cssProperty = hyphenateStyleName(cssDeclarationProperty.key.name);
      break;
    case "StringLiteral":
      if (!cssDeclarationProperty.key.value.startsWith(":")) {
        throw makeError(
          "string property without ':' prefix not handled",
          cssDeclarationProperty,
          api,
        );
      }
      break;
    default:
      throw makeError(
        `cssDeclarationProperty key type "${cssDeclarationProperty.key.type}" not handled`,
        cssDeclarationProperty,
        api,
      );
  }

  // Get CSS value
  let cssValue: string;
  switch (cssDeclarationProperty.value.type) {
    case "BinaryExpression":
    case "CallExpression":
    case "Identifier":
    case "MemberExpression":
    case "TemplateLiteral": {
      try {
        cssValue = evaluateExpressionWithContext(cssDeclarationProperty, api);
      } catch (error) {
        throw makeError(
          `${error} - Update "${CONTEXT_FILE_PATH}" to fix.`,
          cssDeclarationProperty,
          api,
        );
      }
      break;
    }
    case "NumericLiteral":
      cssValue = maybeAddPxToNumber(
        camelCasedCssProperty,
        cssDeclarationProperty.value.value,
      );
      break;
    case "StringLiteral":
      cssValue = cssDeclarationProperty.value.value;
      break;
    case "UnaryExpression": {
      const { argument, operator } = cssDeclarationProperty.value;
      if (argument.type !== "NumericLiteral") {
        throw makeError(
          `argument type "${argument.type}" in UnaryExpression not handled`,
          cssDeclarationProperty,
          api,
        );
      }
      const argValue = maybeAddPxToNumber(
        camelCasedCssProperty,
        argument.value,
      );
      cssValue = `${operator}${argValue}`;
      break;
    }
    default:
      throw makeError(
        `cssDeclarationProperty value type "${cssDeclarationProperty.value.type}" not handled`,
        cssDeclarationProperty,
        api,
      );
  }

  // Get leading and trailing comments
  const [leadingComments, trailingComments] = getComments(
    cssDeclarationProperty,
    "  ",
  );

  const cssDeclaration = [
    leadingComments,
    `  ${cssProperty}: ${cssValue};`,
    trailingComments,
  ].join("");

  return cssDeclaration;
}

/**
 *
 */
function getComments(node: types.Node, indent = "") {
  function formatComment(
    comment: types.Block | types.CommentBlock | types.CommentLine | types.Line,
  ) {
    switch (comment.type) {
      case "CommentBlock":
        return `/*${comment.value}*/`;
      case "CommentLine":
        return `/*${comment.value} */`;
      default:
        throw Error(`comment type "${comment.type}" not handled`);
    }
  }

  const leadingComments = (node.comments ?? [])
    .filter((comment) => comment.leading)
    .map((comment) => indent + formatComment(comment) + "\n")
    .join("");
  const trailingComments = (node.comments ?? [])
    .filter((comment) => comment.trailing)
    .map((comment) => " " + formatComment(comment))
    .join("");

  return [leadingComments, trailingComments];
}

/**
 *
 */
function evaluateExpressionWithContext(
  property: types.ObjectProperty,
  api: types.API,
) {
  const context = fs.readFileSync(CONTEXT_FILE_PATH, {
    encoding: "utf-8",
  });
  const j = api.jscodeshift;
  const expression = j(property.value).toSource();
  const evaluatedExpression = eval(context + "\n" + expression);
  if (evaluatedExpression === undefined) {
    throw "expression evaluated to 'undefined'";
  }
  return evaluatedExpression;
}

/**
 * Higher order function that returns a function that returns the negation of the result of the original function
 *
 * Example:
 *   const pseudoSelectors = properties.filter(isPseudoSelector);
 *   const notPseudoSelectors = properties.filter(not(isPseudoSelector));
 *
 */
const not =
  <T>(f: (arg: T) => boolean) =>
  (arg: T) =>
    !f(arg);
