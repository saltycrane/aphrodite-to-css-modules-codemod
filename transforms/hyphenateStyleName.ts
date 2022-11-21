/**
 * Convert camelCased CSS property name to kebab-case. Copied from
 * https://github.com/styled-components/styled-components/blob/0b6556d0bdc13b3e91c69d8fd5aba58f6ab19b63/packages/styled-components/src/utils/hyphenateStyleName.ts
 */
/**
 * inlined version of
 * https://github.com/facebook/fbjs/blob/master/packages/fbjs/src/core/hyphenateStyleName.js
 */
const uppercaseCheck = /[A-Z]/;
const uppercasePattern = /[A-Z]/g;
const msPattern = /^ms-/;
const prefixAndLowerCase = (char: string): string => `-${char.toLowerCase()}`;

/**
 * Hyphenates a camelcased CSS property name, for example:
 *
 *   > hyphenateStyleName('backgroundColor')
 *   < "background-color"
 *   > hyphenateStyleName('MozTransition')
 *   < "-moz-transition"
 *   > hyphenateStyleName('msTransition')
 *   < "-ms-transition"
 *
 * As Modernizr suggests (http://modernizr.com/docs/#prefixed), an `ms` prefix
 * is converted to `-ms-`.
 */
export default function hyphenateStyleName(string: string) {
  return uppercaseCheck.test(string) && !string.startsWith("--")
    ? string
        .replace(uppercasePattern, prefixAndLowerCase)
        .replace(msPattern, "-ms-")
    : string;
}
