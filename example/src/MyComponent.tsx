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
    outlineOffset: -1,
  },
  // comment a
  warning: {
    fontWeight: 700,
    color: colors.warning,
    opacity: 0,
  } /* comment b */, // comment c
});
