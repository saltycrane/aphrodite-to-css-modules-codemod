import * as fs from "fs";
import * as types from "jscodeshift";

import globals from "./globals";

const ERROR_FILE_PATH = process.env.ERROR_FILE_PATH ?? "./errors.txt";

/**
 * logError - log error to console and file
 */
export function logError(message: string) {
  // Write to error file
  fs.appendFileSync(ERROR_FILE_PATH, `${message} ${globals.filePath}\n`);
  // Log error to the screen
  console.error(message);
}

/**
 * makeError - make Error object for `throw`ing (also log to file)
 */
export function makeError(
  message: string,
  thing:
    | types.ASTNode
    | types.ASTNode[]
    | types.ASTPath
    | types.ASTPath[]
    | types.Collection,
  api: types.API,
) {
  // Write to error file
  fs.appendFileSync(ERROR_FILE_PATH, `${message} ${globals.filePath}\n`);
  const j = api.jscodeshift;
  // For `Collection`s, convert to `ASTNode[]` first
  const node = "nodes" in thing ? thing.nodes() : thing;
  // Return an error object
  return Error([message, j(node).toSource() + "\n"].join("\n\n"));
}
