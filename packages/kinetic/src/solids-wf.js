/**
 * kinetic.25d.js: wildflower.kinetic.solids, 2.5D solids drawn as SVG
 * (solids.js). Loaded after kinetic.wf.js, which it extends; on a page
 * without Kinetic it says so and does nothing.
 */

import { solids } from './solids.js';

const wf = self.wildflower;
const kinetic = wf && wf.kinetic;
if (!kinetic) console.error('[KN-100] kinetic.25d.js: wildflower.kinetic is not on the page; load kinetic.wf.js before kinetic.25d.js');
else if (!kinetic.solids) kinetic.solids = solids;
