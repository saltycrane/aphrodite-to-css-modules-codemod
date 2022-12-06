# aphrodite-to-css-modules-codemod

[`jscodeshift`](https://github.com/facebook/jscodeshift) codemod used for converting a TypeScript codebase from [Aphrodite](https://github.com/Khan/aphrodite) to [CSS Modules](https://github.com/css-modules/css-modules). Used with 200+ files in a closed source work project.

## Features

- Expressions in the styles object can be evaluated using a JavaScript "context" file. Set `CONTEXT_FILE_PATH` in the `.env` file.
- Handles pseudo-selectors like `:hover`, `:active`, etc.
- Preserves comments.
- Adds "px" suffix to appropriate numeric property values.
- Handles exported styles.

## Example

### Run the example

``` sh
cp .env.example .env
npm install
npm run convert ./example
```

### Before

`./example/src/MyComponent.tsx`:

``` jsx
import { css, StyleSheet } from "aphrodite";
import classNames from "classnames";
import React from "react";

import { colors } from "./constants";
import { hexToRgbA } from "./utils";

export default function MyComponent() {
  const isSomething = true;
  const isSomethingElse = false;
  return (
    <div
      className={css(
        isSomethingElse ? myStyles.containerGrid : myStyles.containerFlex,
      )}
      style={{}}
    >
      <div className={css(myStyles.header, myStyles.content)}>header</div>
      <div className={classNames(css(myStyles.content), "another-class")}>
        <div>Lorem ipsum</div>
      </div>
      <span className={css(isSomething && myStyles.warning)}></span>
    </div>
  );
}

// comment I
// comment II
/**
 * comment III
 */
export const myStyles = StyleSheet.create({
  containerGrid: {
    backgroundColor: "white",
    // comment 1
    /* comment 2 */ display: "grid" /* comment 4 */, // comment 5
    gridTemplate: `
      "sourceselect .       reviewbutton" auto
      "pagination   filters filters     " auto
      "rowcount     filters filters     " 20px
      / 2fr         1fr     2fr
    `,
    width: 200,
  },
  containerFlex: {
    display: "flex",
  },
  content: {
    lineHeight: 1.5,
  },
  header: {
    backgroundColor: "#ccc",
    color: hexToRgbA(colors.danger, 0.8),
    display: "inline-block",
    ":hover": {
      color: colors.primary,
      borderColor: `${colors.info} !important`,
    },
  },
  // comment a
  warning: {
    fontWeight: 700,
    color: colors.warning,
    opacity: 0,
  } /* comment b */, // comment c
});
```

### After

`./example/src/MyComponent.tsx`:

``` jsx
import myStyles from "./MyComponent.module.css";
import classNames from "classnames";
import React from "react";

import { colors } from "./constants";
import { hexToRgbA } from "./utils";

export default function MyComponent() {
  const isSomething = true;
  const isSomethingElse = false;
  return (
    <div
      className={
        isSomethingElse ? myStyles.containerGrid : myStyles.containerFlex
      }
      style={{}}
    >
      <div
        className={
          // TODO: check CSS precedence
          classNames(myStyles.header, myStyles.content)
        }
      >
        header
      </div>
      <div className={classNames(myStyles.content, "another-class")}>
        <div>Lorem ipsum</div>
      </div>
      <span className={classNames(isSomething && myStyles.warning)}></span>
    </div>
  );
}

export { myStyles };
```

`./example/src/MyComponent.module.css`:

``` css
/* comment I */
/* comment II */
/**
 * comment III
 */
.containerGrid {
  background-color: white;
  /* comment 1 */
  /* comment 2 */
  display: grid; /* comment 4 */ /* comment 5 */
  grid-template: 
  "sourceselect .       reviewbutton" auto
  "pagination   filters filters     " auto
  "rowcount     filters filters     " 20px
  / 2fr         1fr     2fr
;
  width: 200px;
}

.containerFlex {
  display: flex;
}

.content {
  line-height: 1.5;
}

.header {
  background-color: #ccc;
  color: var(--bs-danger-alpha80);
  display: inline-block;
}

.header:hover {
  color: var(--bs-primary);
  border-color: var(--bs-info) !important;
}

/* comment a */
.warning {
  font-weight: 700;
  color: var(--bs-warning);
  opacity: 0;
} /* comment b */ /* comment c */
```

### JS context file

The expressions in the styles object (e.g. `colors.danger`, `hexToRgbA(colors.danger, 0.8)`, etc.) were evaluated using the following "context" file.

`./context.example.js`:

``` javascript
const colors = {
  danger: "var(--bs-danger)",
  info: "var(--bs-info)",
  primary: "var(--bs-primary)",
  warning: "var(--bs-warning)",
};

function hexToRgbA(hex, alpha) {
  return hex.replace(/\)$/, `-alpha${alpha * 100})`);
}
```

## `.env` file

[`dotenv`](https://github.com/motdotla/dotenv) is used for configuring 4 environment variables. Copy `.env.example` to `.env` before running.

``` sh
# Comment that is inserted when there are multiple styles passed to the
# Aphrodite `css` function
CHECK_PRECEDENCE_COMMENT=" TODO: check CSS precedence"

# Name used for the `classnames` utility (e.g. "classNames" "cx", "cn", etc.)
CLASS_NAMES_NAME="classNames"

# Path to the JavaScript "context" file used to evaluation expressions
# that are part of the styles object
CONTEXT_FILE_PATH="./context.example.js"

# Error file path
ERROR_FILE_PATH="./errors.txt"
```

## Caveats

- Uses the [`classnames`](https://github.com/JedWatson/classnames) package to handle:
  - Conditional styles
  - Multiple arguments passed to the Aphrodite `css` function
- For cases where multiple arguments are passed to the Aphrodite `css` function, the codemod adds a `TODO: check CSS precedence` comment (`CHECK_PRECEDENCE_COMMENT` in `.env` file) because the rules of precedence differ between Aphrodite and vanilla CSS. See the [_Overriding Styles_](https://github.com/Khan/aphrodite#overriding-styles) section of the Aphrodite docs for more information.
- May leave behind unused imports if the styles object uses imported objects. Unused imports may be removed using [`eslint-plugin-unused-imports`](https://github.com/sweepline/eslint-plugin-unused-imports).
