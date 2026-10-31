/**
 * @wildflowerjs/kinetic: opt-in global typings.
 *
 * The built files add `wildflower.kinetic` rather than exporting, so a page
 * that loads them by script tag has no import to hang types on. Reference
 * this file to type it:
 *
 *   /// <reference types="@wildflowerjs/kinetic/types.global" />
 *
 * `wildflower.kinetic` is declared as a module augmentation, so it appears
 * beside the framework's own surface.
 */

import { WildflowerKinetic } from './types';

declare module 'wildflowerjs' {
  interface WildflowerJS {
    /** Kinetic: a page as a video, with time-driven scenes, HyperFrames-compatible. */
    kinetic: WildflowerKinetic;
  }
}

export {};
