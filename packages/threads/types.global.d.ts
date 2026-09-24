/**
 * @wildflowerjs/threads: opt-in global typings.
 *
 * The built files add `wildflower.thread` rather than exporting, so a page
 * that loads them by script tag has no import to hang types on. Reference
 * this file to type it:
 *
 *   /// <reference types="@wildflowerjs/threads/types.global" />
 *
 * `wildflower.thread` is declared as a module augmentation, so it appears
 * beside the framework's own surface.
 */

import { wildflowerThread } from './types';

declare module 'wildflowerjs' {
  interface WildflowerJS {
    /** Create a thread and register it as a store under its name. */
    thread: typeof wildflowerThread;
  }
}

export {};
