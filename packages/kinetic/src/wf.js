/**
 * The Kinetic extension's entry: a WildflowerJS page as a video, with
 * time-driven scenes, HyperFrames-compatible. Public API only; the framework
 * never learns the word "kinetic".
 *
 *   wildflower.kinetic.scene(name, definition)   a component with time, local,
 *                                                progress, clipFrame, enter,
 *                                                exit, presence, remaining,
 *                                                vars and inputs
 *   wildflower.kinetic.ready()                   resolves when frame 0 may be
 *                                                captured (readiness.js)
 *   wildflower.kinetic.check({ samples })        the render self-test
 *                                                (check.js)
 *   wildflower.kinetic.render({ fps, codec, shutter, finish })
 *                                                an MP4 from the page, with
 *                                                WebCodecs (render.js); a
 *                                                shutter averages seeks inside
 *                                                each frame
 *   wildflower.kinetic.seek(seconds)             move the clock (the runtime's
 *                                                player when there is one)
 *   wildflower.kinetic.play() / play({ from, to }) / pause()
 *   wildflower.kinetic.step(id, { wait, until, entry, script })
 *   wildflower.kinetic.next() / back() / go(step)
 *                                                interactive mode: steps that hold
 *                                                and wait, and scripts for
 *                                                video mode (lesson.js);
 *                                                `follow` on a scene eases
 *                                                toward a store path by a
 *                                                spring (follow.js)
 *   wildflower.kinetic.config({ fps, channel, autoplay, preview, loop, fit, sound, shutter, mode })
 *                                                preview: the bar (preview.js);
 *                                                fit: the stage fitted to the
 *                                                window (fit.js); sound: the
 *                                                audio clips in the preview
 *   wildflower.kinetic.level / spectrum          the audio clips' levels at a
 *                                                time (audio.js, which also
 *                                                decodes the clips and plays
 *                                                them in the preview)
 *   footage                                      <video data-start> clips
 *                                                seeked to the frame, played
 *                                                with the clock and waited
 *                                                for at readiness (footage.js)
 *   wildflower.kinetic.compat                    { hyperframes: the tested runtime }
 *   wildflower.kinetic.ease / interpolate / styleAt / spring / settle / ramp / mix /
 *                      stagger / posterize / loop / hold / focus / random /
 *                      noise / noise2 / noise3 / camera / depth / shake / wiggle
 *                                                motion as pure functions (motion.js)
 *   wildflower.kinetic.trails                    ghosts, a ribbon or dots behind a mover (trails.js)
 *   wildflower.kinetic.smear                     copies of an element styled inside
 *                                                the frame's shutter, for motion
 *                                                blur (motion.js, with the clock store)
 *   wildflower.kinetic.transition                a transition's two styles at p
 *                                                (transitions.js, which also
 *                                                applies data-clip-transition,
 *                                                data-clip-enter and data-clip-exit,
 *                                                with the map kinds' filters
 *                                                from maps.js)
 *   wildflower.kinetic.effect                    halftone, stipple, splatter,
 *                                                dither and duotone with WebGL 2 on an
 *                                                <img>, <video> or <canvas>,
 *                                                drawn after each seek (effects.js)
 *   wildflower.kinetic.shade                     printed shading: marks paint a
 *                                                density field, drawn as stipple,
 *                                                splatter, halftone, dither, light or
 *                                                grain with a boil and a hold (shade.js,
 *                                                on effects.js)
 *   wildflower.kinetic.blur                      the content under an element blurred
 *                                                where marks paint, a masked
 *                                                backdrop-filter (shade.js)
 *   wildflower.kinetic.draw                      the drawn look: strokes in pencil,
 *                                                pen and ballpoint laid by a hand,
 *                                                drawn on or already drawn (draw.js)
 *   wildflower.kinetic.boil                     line boil: path data moved along its
 *                                                normals by stepped noise (boil.js)
 *   wildflower.kinetic.text                      lines of type on a canvas from baked
 *                                                variable-font outlines, each letter
 *                                                with its own weight and slant
 *                                                (lettering.js; outlines from
 *                                                bake/outlines.mjs)
 *   wildflower.kinetic.lottie                   a lottie-web animation seeked
 *                                                to the frame of each seek and
 *                                                waited for at readiness (lottie.js)
 *   wildflower.kinetic.animatedImage             a GIF, animated WebP or APNG
 *                                                decoded with ImageDecoder and
 *                                                drawn by time (images.js)
 *   wildflower.kinetic.matchPaths / shape / trimPath / pathLength   SVG paths as keyframe values (paths.js)
 *   wildflower.kinetic.distribute / falloff       points laid out, and a field's
 *                                                weight at a point (fields.js)
 *   wildflower.kinetic.split / typewriter / scramble / format   text (text.js)
 *   wildflower.kinetic.textMetrics               a line measured, and fitted to a width (metrics.js)
 *   wildflower.kinetic.ticks / rank / captions / moment / srt / beat     data (data.js)
 *
 * The clock is the store `kinetic`: time, frame, fps, duration, playing,
 * levels, shutter, and interactive mode's mode, step, stepIndex, stepCount,
 * stepStart, stepLength, waiting and canAdvance.
 * Bindings read it as $kinetic.time; scenes read their own computeds.
 *
 * Outside a render, fit.js also gives html and body back the size, margin and
 * overflow the HyperFrames runtime takes from them; in a render's capture or
 * under ?embed it shows the composition alone, at the window's top left, and
 * under ?embed inside a frame embed.js takes play, pause and seek from the
 * parent by postMessage and posts the time back.
 *
 * Installed through wildflower.plugin(install) where the tier has plugins and
 * install(wildflower) directly where it does not, like Trillium.
 *
 * VERSION is this package's version, written by hand because the build has no
 * JSON import; test/smoke.test.js fails if it drifts from package.json.
 */

import { GLOBAL_NAME, HF_VERSION, FONTS_STORE } from './names.js';
import { CODES, warn, useCore } from './diagnostics.js';
import { createClock } from './clock.js';
import { createLesson } from './lesson.js';
import { createFollow } from './follow.js';
import { createScenes } from './scene.js';
import { createReadiness } from './readiness.js';
import { createGuard } from './guard.js';
import { createClips } from './clips.js';
import { createTransitions, transition } from './transitions.js';
import { createCheck } from './check.js';
import { createPreview, previewRequested } from './preview.js';
import { createFit } from './fit.js';
import { createEmbed } from './embed.js';
import { createThree } from './three.js';
import { createRender } from './render.js';
import { createAudio } from './audio.js';
import { createFootage } from './footage.js';
import { createEffects } from './effects.js';
import { createShade } from './shade.js';
import { createDraw } from './draw.js';
import { boil } from './boil.js';
import { createLettering } from './lettering.js';
import { createFinishLive } from './finish.js';
import { createLottie } from './lottie.js';
import { createImages } from './images.js';
import { ease, interpolate, styleAt, spring, settle, ramp, mix, stagger, sweep, repeat, posterize, loop, hold, focus, random, noise, noise2, noise3, camera, depth, shake, wiggle, createSmear } from './motion.js';
import { matchPaths, shape, trimPath, pathLength } from './paths.js';
import { trails } from './trails.js';
import { distribute, falloff } from './fields.js';
import { split, typewriter, scramble, format } from './text.js';
import { textMetrics, fontsMeasured, trackFonts } from './metrics.js';
import { ticks, rank, captions, moment, srt, beat } from './data.js';
import { timeOf, tempo } from './times.js';

const VERSION = '0.1.2';

// Read while this script is the current one: a later call sees null.
const PREVIEW_REQUESTED = previewRequested();

const wf = self.wildflower;
if (wf) {
  if (typeof wf.plugin === 'function') wf.plugin(install);
  else install(wf);
}

function install(wf) {
  // Warnings print through the core's diagnostic() when it has one.
  useCore(wf);
  // Loaded a second time (a duplicated script tag, a hot reload): the first
  // install keeps running. A second clock would seek the same store twice.
  if (wf[GLOBAL_NAME]) {
    if (__DEV__) warn(CODES.LOADED_TWICE, 'the extension was loaded a second time; the first copy stays in use and this one does nothing',
      'Load kinetic.wf.js once.');
    return;
  }
  const clock = createClock(wf);
  // The lesson first, so its before hook resolves the mode ahead of every
  // other part of a seek.
  const lesson = createLesson(wf, clock);
  const scenes = createScenes(wf, clock, createFollow(wf, clock, lesson));
  const clips = createClips(clock);
  const transitions = createTransitions(clock, clips);
  // The fit follows the preview bar unless config({ fit }) says otherwise;
  // the bar exists by the time fit.start() runs below.
  let preview = null;
  const fit = createFit(clock, () => !!preview && preview.get());
  const audio = createAudio(wf, clock);
  const footage = createFootage(clock, clips);
  const effects = createEffects(wf, clock, scenes);
  const shades = createShade(wf, clock, scenes, effects);
  const drawings = createDraw(wf, clock, scenes);
  const lettering = createLettering(wf, clock, scenes);
  // The live finish (finish.js): its overlays follow config({ finish }),
  // and its grain and dust move on every landed seek.
  const finishLive = createFinishLive(clock);
  clock.useFinishLive(finishLive);
  clock.onLanded(finishLive.draw);
  const lotties = createLottie(wf, clock, scenes);
  const images = createImages(scenes);
  // What a frame needs loaded beside the footage: the transitions' maps, the
  // effects' images, the Lottie animations and the animated images; the
  // fonts textMetrics() measured with; and the steps, with their script
  // paths checked.
  // Once the fonts have loaded, the count textMetrics() reads goes up, so a
  // computed that measured the fallback measures again.
  const fontLoads = wf.store(FONTS_STORE, { state: { loads: 0 } });
  trackFonts(() => fontLoads.loads);
  const fontsLoaded = () => fontsMeasured().then((r) => { if (r) fontLoads.loads++; });
  const extra = () => Promise.all([transitions.load(), effects.load(), drawings.load(), lotties.load(), images.load(), fontsLoaded(), lesson.check(scenes.followTargets())]);
  // Readiness applies the clips' windows, their transitions and the
  // footage's frames once before the page is shown, waiting for the footage
  // to land and drawing the effects, and waits for the footage, then the
  // audio clips' decode, and beside them the maps and images.
  const readiness = createReadiness(wf, clock, scenes, {
    apply(t) { clips.apply(t); transitions(t); transitions.settle(); return Promise.resolve(footage.seek(t)).then(effects.draw).then(drawings.drawAll).then(() => finishLive.draw(t)).catch((e) => console.error(e)); },
  }, fit, audio, footage, extra, lesson);
  createGuard(wf, clock, scenes, lesson);
  createThree(wf, clock, scenes);
  const api = wf[GLOBAL_NAME] = {
    version: VERSION,
    compat: Object.freeze({ hyperframes: HF_VERSION }),
    scene: scenes.scene,
    ready: readiness.ready,
    // check() and render() each begin with a run of readiness.
    check: createCheck(clock, readiness, lesson),
    render: createRender(clock, fit, audio, readiness, lesson, finishLive),
    effect: effects.effect,
    shade: shades.shade,
    blur: shades.blur,
    draw: drawings.draw,
    boil,
    text: lettering.text,
    lottie: lotties.lottie,
    animatedImage: images.animatedImage,
    level: audio.level,
    spectrum: audio.spectrum,
    seek: clock.seek,
    play: lesson.play,
    pause: clock.pause,
    config: clock.config,
    step: lesson.step,
    next: lesson.next,
    back: lesson.back,
    go: lesson.go,
    ease, interpolate, styleAt, spring, settle, ramp, mix, stagger, sweep, repeat, posterize, loop, hold,
    focus, random, noise, noise2, noise3, camera, depth, shake, wiggle,
    smear: createSmear(clock.store),
    trails,
    transition,
    matchPaths, shape, trimPath, pathLength,
    distribute, falloff,
    split, typewriter, scramble, format, textMetrics,
    ticks, rank, captions, moment, srt, beat,
    timeOf, tempo,
  };
  preview = createPreview(wf, api, clock, PREVIEW_REQUESTED, audio);
  // Under ?embed inside a frame, the parent drives the clock by postMessage.
  createEmbed(clock, api);
  audio.usePreview(preview);
  clock.usePreview(preview);
  clock.useFit(fit);
  clock.useAudio(audio);
  clock.useLesson(lesson);
  lesson.resolve();
  // An interactive page with steps enters its first step once the registered run of
  // readiness passes, after the fonts, images and queries; never when it fails.
  readiness.entry.then(lesson.start);
  fit.start();
}
