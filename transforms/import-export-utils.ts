import * as types from "jscodeshift";

import { makeError } from "./error-utils";

/**
 * addDefaultImport -
 *   - insert a new default import declaration at the top of the file if it doesn't exist
 *   - or update the default import if it exists
 */
export function addDefaultImport(
  fileSource: string,
  api: types.API,
  module: string,
  importToAdd: string,
) {
  if (_hasImportFromModule(fileSource, api, module)) {
    return _checkOrUpdateExistingImportDeclaration(
      fileSource,
      api,
      module,
      importToAdd,
    );
  }
  return _addNewDefaultImportDeclaration(fileSource, api, module, importToAdd);
}

/**
 * addNamedExports - add named exports at the bottom of the file
 */
export function addNamedExports(
  fileSource: string,
  api: types.API,
  exportsToAdd: string[],
) {
  const j = api.jscodeshift;
  const newExportSpecifiers = exportsToAdd.map((exportToAdd) => {
    return j.exportSpecifier.from({
      exported: j.identifier(exportToAdd),
      local: j.identifier(exportToAdd),
    });
  });
  const newExportNamedDeclaration = j.exportNamedDeclaration(
    null,
    newExportSpecifiers,
  );
  const root = j(fileSource);
  const body = root.get().node.program.body;
  body.push("\n");
  body.push(newExportNamedDeclaration);
  // remove multiple blank lines - https://twitter.com/selvagsz/status/1158429170822549504
  return root.toSource().replace(/\n\s*\n\s*\n/, "\n\n");
}

/**
 * hasNamedImports
 */
export function hasNamedImports(
  fileSource: string,
  api: types.API,
  module: string,
  imports: string[],
) {
  const j = api.jscodeshift;
  return j(fileSource)
    .find(j.ImportDeclaration)
    .some((path) => {
      const hasMatchingNamedImports = (path.value.specifiers ?? []).some(
        (specifier) => _isNamedImportMatch(specifier, imports),
      );
      return _isModuleMatch(path, module) && hasMatchingNamedImports;
    });
}

/**
 * removeNamedImports - remove named imports
 *   (not for default or namespaced imports)
 *
 *   return 2-tuple of [<new file source>, <did remove flag>]
 */
export function removeNamedImports(
  fileSource: string,
  api: types.API,
  module: string,
  importsToRemove: string[],
) {
  const j = api.jscodeshift;
  const newFileSource = j(fileSource)
    .find(j.ImportDeclaration)
    .forEach((path) => {
      if (!_isModuleMatch(path, module)) {
        return;
      }
      const importsToKeep = (path.value.specifiers ?? []).filter(
        (specifier) => !_isNamedImportMatch(specifier, importsToRemove),
      );
      if (importsToKeep.length === 0) {
        // remove the import if there are no non-form components to import
        j(path).remove();
      } else {
        // else update the import to import only the non-form components
        path.value.specifiers = importsToKeep;
      }
    })
    .toSource();
  return newFileSource;
}

/**
 * _addNewDefaultImportDeclaration - add new default import at the top of the file
 */
function _addNewDefaultImportDeclaration(
  fileSource: string,
  api: types.API,
  module: string,
  importToAdd: string,
) {
  const j = api.jscodeshift;
  const newDefaultImportDeclaration = j.importDeclaration(
    [j.importDefaultSpecifier(j.identifier(importToAdd))],
    j.stringLiteral(module),
  );
  const root = j(fileSource);
  root.get().node.program.body.unshift(newDefaultImportDeclaration);
  return root.toSource();
}

/**
 *
 */
function _checkOrUpdateExistingImportDeclaration(
  fileSource: string,
  api: types.API,
  module: string,
  importToAdd: string,
) {
  const j = api.jscodeshift;
  return j(fileSource)
    .find(j.ImportDeclaration)
    .forEach((path) => {
      if (path.value.source.value !== module) {
        return;
      }
      const importDefaultSpecifiers = (path.value.specifiers ?? []).filter(
        (specifier) => specifier.type === "ImportDefaultSpecifier",
      );
      importDefaultSpecifiers.forEach((specifier) => {
        if (specifier.local?.name !== importToAdd) {
          throw makeError(
            `Default import to add (\`${importToAdd}\`) does not match existing default import:`,
            path,
            api,
          );
        }
      });
      // Add new default import to existing import declarations
      if (importDefaultSpecifiers.length === 0) {
        const newSpecifier = j.importDefaultSpecifier(
          j.identifier(importToAdd),
        );
        if (path.value.specifiers) {
          path.value.specifiers.push(newSpecifier);
        } else {
          path.value.specifiers = [newSpecifier];
        }
      }
    })
    .toSource();
}

/**
 *
 */
function _hasImportFromModule(
  fileSource: string,
  api: types.API,
  module: string,
) {
  const j = api.jscodeshift;
  const importsMatchingModule = j(fileSource)
    .find(j.ImportDeclaration)
    .filter((path) => {
      return path.value.source.value === module;
    });
  if (importsMatchingModule.length > 1) {
    throw makeError(
      "multiple imports of 1 module not supported",
      importsMatchingModule,
      api,
    );
  }
  return importsMatchingModule.length > 0;
}

/**
 * _isModuleMatch - return true if the module name (e.g. "reactstrap") name
 *   matches
 */
function _isModuleMatch(
  path: types.ASTPath<types.ImportDeclaration>,
  module: string,
) {
  return path.value.source.value === module;
}

/**
 * _isNamedImportMatch - return true if the named import (e.g. "CustomInput")
 *   matches
 */
function _isNamedImportMatch(
  specifier:
    | types.ImportDefaultSpecifier
    | types.ImportNamespaceSpecifier
    | types.ImportSpecifier,
  namedImports: string[],
) {
  const isMatch =
    specifier.type === "ImportSpecifier" &&
    namedImports.includes(specifier.imported.name);
  if (
    isMatch &&
    specifier.local &&
    specifier.imported.name !== specifier.local.name
  ) {
    throw Error(
      `Import aliases are not supported (${specifier.imported.name} -> ${specifier.local.name})`,
    );
  }
  return isMatch;
}
