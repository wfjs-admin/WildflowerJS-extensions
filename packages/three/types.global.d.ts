/**
 * @wildflowerjs/three: opt-in global typings.
 *
 * The built files add `wildflower.three` rather than exporting, so a page
 * that loads them by script tag has no import to hang types on. Reference
 * this file to type it:
 *
 *   /// <reference types="@wildflowerjs/three/types.global" />
 *
 * `wildflower.three` is declared as a module augmentation, so it appears
 * beside the framework's own surface.
 */

import { WildflowerThree } from './types';

declare module 'wildflowerjs' {
  interface WildflowerJS {
    /** three.js views as stores. */
    three: WildflowerThree;
  }
}

export {};
