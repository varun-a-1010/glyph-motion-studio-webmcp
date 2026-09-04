/**
 * The only module allowed to import GSAP. Everything else goes through the
 * timeline builder and playback controller, which is what keeps "no arbitrary
 * animation code" a structural property rather than a policy.
 */
import gsap from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';

gsap.registerPlugin(DrawSVGPlugin);

export default gsap;
