import { VK_POSITION } from "../emulator/prefs";
import { KeyDef } from "./common";

import {
  ArrowUpwardImage,
  ArrowDownwardImage,
  ArrowBackImage,
  ArrowForwardImage,
  SwapVertImage,
} from '@webrcade/app-common';

const APPLE_PATH = "M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z";
const ClosedAppleImage = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='-180 -150 1174 1300'><path fill='white' d='${APPLE_PATH}'/></svg>`)}`;
const OpenAppleImage   = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='-180 -150 1174 1300'><path fill='none' stroke='white' stroke-width='45' d='${APPLE_PATH}'/></svg>`)}`;

const SHIFT_PREFIX = "SHIFT:";

const onKeyboardClose = (kb, ctx) => {
  if (ctx.caps)        ctx.caps        = false;
  if (ctx.leftShift)   ctx.leftShift   = false;
  if (ctx.control)     ctx.control     = false;
  if (ctx.openApple)   ctx.openApple   = false;
  if (ctx.closedApple) ctx.closedApple = false;
}

let nextFlip = 0;
const allowFlip = () => {
  const NOW = Date.now();
  if (nextFlip < NOW) { nextFlip = NOW + 200; return true; }
  return false;
}

const showLetters  = (kb, ctx) => { if (!allowFlip()) return; ctx.currentKeys = "default"; kb.setState({ keysContext: { ...ctx } }); kb.updateFocusGridComponents(); }
const showNumbers  = (kb, ctx) => { if (!allowFlip()) return; ctx.currentKeys = "numbers"; kb.setState({ keysContext: { ...ctx } }); kb.updateFocusGridComponents(); }

const toggleCaps        = (kb, ctx, key) => { ctx.caps        = !ctx.caps;        kb.setState({ keysContext: { ...ctx } }); onKey(kb, ctx, key); }
const toggleShift       = (kb, ctx, key) => { ctx.leftShift   = !ctx.leftShift;   kb.setState({ keysContext: { ...ctx } }); if (ctx.leftShift)   onKey(kb, ctx, key); }
const toggleCtrl        = (kb, ctx, key) => { ctx.control     = !ctx.control;     kb.setState({ keysContext: { ...ctx } }); if (ctx.control)     onKey(kb, ctx, key); }
const toggleOpenApple   = (kb, ctx, key) => { ctx.openApple   = !ctx.openApple;   kb.setState({ keysContext: { ...ctx } }); if (ctx.openApple)   onKey(kb, ctx, key); }
const toggleClosedApple = (kb, ctx, key) => { ctx.closedApple = !ctx.closedApple; kb.setState({ keysContext: { ...ctx } }); if (ctx.closedApple) onKey(kb, ctx, key); }

const capsEnabled        = (kb, ctx) => ctx.caps;
const shiftEnabled       = (kb, ctx) => ctx.leftShift;
const ctrlEnabled        = (kb, ctx) => ctx.control;
const openAppleEnabled   = (kb, ctx) => ctx.openApple;
const closedAppleEnabled = (kb, ctx) => ctx.closedApple;

const locationToggle = (kb, ctx) => {
  const prefs = window.emulator.getPrefs();
  prefs.setVkPosition(prefs.getVkPosition() === VK_POSITION.MIDDLE ? VK_POSITION.BOTTOM : VK_POSITION.MIDDLE);
  kb.forceRefresh();
}


const onKey = (kb, ctx, key) => {
  let shift = false;
  let code = key.c;
  if (!code) return;

  if (code.startsWith(SHIFT_PREFIX)) {
    shift = true;
    code = code.substring(SHIFT_PREFIX.length);
  }

  const applyShift = ctx.leftShift || shift;

  if (applyShift)      window.emulator.sendKeyDown("ShiftLeft");
  if (ctx.control)     window.emulator.sendKeyDown("ControlLeft");
  if (ctx.openApple)   window.emulator.sendKeyDown("AltLeft");
  if (ctx.closedApple) window.emulator.sendKeyDown("AltRight");

  window.emulator.sendKeyDown(code);

  setTimeout(() => {
    window.emulator.sendKeyUp(code);
    if (ctx.closedApple) window.emulator.sendKeyUp("AltRight");
    if (ctx.openApple)   window.emulator.sendKeyUp("AltLeft");
    if (ctx.control)     window.emulator.sendKeyUp("ControlLeft");
    if (applyShift)      window.emulator.sendKeyUp("ShiftLeft");
  }, 50);
}

const onEnter = (kb, ctx, key) => {
  onKey(kb, ctx, key);
  if (kb.isCloseOnEnter()) window.emulator.app.setKeyboardShown(false);
}

// Bottom row shared between pages — 1+1+1+1+2+1+1+2 = 10 units
const bottomRowDefault = () => [
  new KeyDef("123...").setOnClick(showNumbers),
  new KeyDef("Pos").setImage(SwapVertImage).setOnClick(locationToggle),
  new KeyDef("Shift").code("ShiftLeft").setOnClick(toggleShift).setIsEnabledCb(shiftEnabled),
  new KeyDef("Ctrl").code("ControlLeft").setOnClick(toggleCtrl).setIsEnabledCb(ctrlEnabled),
  new KeyDef("Space").setWidth(2).code("Space").setOnClick(onKey),
  new KeyDef(".").code("Period").setOnClick(onKey),
  new KeyDef(",").code("Comma").setOnClick(onKey),
  new KeyDef("Return").setWidth(2).code("Enter").setOnClick(onEnter),
];

const bottomRowNumbers = () => [
  new KeyDef("abc...").setOnClick(showLetters),
  new KeyDef("Pos").setImage(SwapVertImage).setOnClick(locationToggle),
  new KeyDef("Shift").code("ShiftLeft").setOnClick(toggleShift).setIsEnabledCb(shiftEnabled),
  new KeyDef("Ctrl").code("ControlLeft").setOnClick(toggleCtrl).setIsEnabledCb(ctrlEnabled),
  new KeyDef("Space").setWidth(2).code("Space").setOnClick(onKey),
  new KeyDef(".").code("Period").setOnClick(onKey),
  new KeyDef(",").code("Comma").setOnClick(onKey),
  new KeyDef("Return").setWidth(2).code("Enter").setOnClick(onEnter),
];

const KEYS = {
  "default": [
    // Row 0: special + arrows (9 keys, stretch to fill)
    [
      new KeyDef("Esc").setWidth(2).code("Escape").setOnClick(onKey),
      new KeyDef("Tab").code("Tab").setOnClick(onKey),
      new KeyDef("Rst").code("F12").setOnClick(onKey),
      new KeyDef("Open").setImage(OpenAppleImage).code("AltLeft").setOnClick(toggleOpenApple).setIsEnabledCb(openAppleEnabled),
      new KeyDef("Clsd").setImage(ClosedAppleImage).code("AltRight").setOnClick(toggleClosedApple).setIsEnabledCb(closedAppleEnabled),
      new KeyDef("↑").setImage(ArrowUpwardImage).code("ArrowUp").setOnClick(onKey),
      new KeyDef("↓").setImage(ArrowDownwardImage).code("ArrowDown").setOnClick(onKey),
      new KeyDef("←").setImage(ArrowBackImage).code("ArrowLeft").setOnClick(onKey),
      new KeyDef("→").setImage(ArrowForwardImage).code("ArrowRight").setOnClick(onKey),
    ],
    // Row 1: QWERTY — 10 keys
    [
      new KeyDef("q").code("KeyQ").setOnClick(onKey),
      new KeyDef("w").code("KeyW").setOnClick(onKey),
      new KeyDef("e").code("KeyE").setOnClick(onKey),
      new KeyDef("r").code("KeyR").setOnClick(onKey),
      new KeyDef("t").code("KeyT").setOnClick(onKey),
      new KeyDef("y").code("KeyY").setOnClick(onKey),
      new KeyDef("u").code("KeyU").setOnClick(onKey),
      new KeyDef("i").code("KeyI").setOnClick(onKey),
      new KeyDef("o").code("KeyO").setOnClick(onKey),
      new KeyDef("p").code("KeyP").setOnClick(onKey),
    ],
    // Row 2: ASDF — 10 keys
    [
      new KeyDef("a").code("KeyA").setOnClick(onKey),
      new KeyDef("s").code("KeyS").setOnClick(onKey),
      new KeyDef("d").code("KeyD").setOnClick(onKey),
      new KeyDef("f").code("KeyF").setOnClick(onKey),
      new KeyDef("g").code("KeyG").setOnClick(onKey),
      new KeyDef("h").code("KeyH").setOnClick(onKey),
      new KeyDef("j").code("KeyJ").setOnClick(onKey),
      new KeyDef("k").code("KeyK").setOnClick(onKey),
      new KeyDef("l").code("KeyL").setOnClick(onKey),
      new KeyDef(";").code("Semicolon").setOnClick(onKey),
    ],
    // Row 3: CapLk(1) + letters(7) + Delete(2) = 10 units
    [
      new KeyDef("CapLk").code("CapsLock").setOnClick(toggleCaps).setIsEnabledCb(capsEnabled),
      new KeyDef("z").code("KeyZ").setOnClick(onKey),
      new KeyDef("x").code("KeyX").setOnClick(onKey),
      new KeyDef("c").code("KeyC").setOnClick(onKey),
      new KeyDef("v").code("KeyV").setOnClick(onKey),
      new KeyDef("b").code("KeyB").setOnClick(onKey),
      new KeyDef("n").code("KeyN").setOnClick(onKey),
      new KeyDef("m").code("KeyM").setOnClick(onKey),
      new KeyDef("Delete").setWidth(2).code("Backspace").setOnClick(onKey),
    ],
    // Row 4: navigation — 1+1+1+1+2+1+1+2 = 10 units
    bottomRowDefault(),
  ],
  "numbers": [
    // Row 0: digits — 10 keys
    [
      new KeyDef("1").code("Digit1").setOnClick(onKey),
      new KeyDef("2").code("Digit2").setOnClick(onKey),
      new KeyDef("3").code("Digit3").setOnClick(onKey),
      new KeyDef("4").code("Digit4").setOnClick(onKey),
      new KeyDef("5").code("Digit5").setOnClick(onKey),
      new KeyDef("6").code("Digit6").setOnClick(onKey),
      new KeyDef("7").code("Digit7").setOnClick(onKey),
      new KeyDef("8").code("Digit8").setOnClick(onKey),
      new KeyDef("9").code("Digit9").setOnClick(onKey),
      new KeyDef("0").code("Digit0").setOnClick(onKey),
    ],
    // Row 1: shifted digits — 10 keys
    [
      new KeyDef("!").code(SHIFT_PREFIX + "Digit1").setOnClick(onKey),
      new KeyDef("@").code(SHIFT_PREFIX + "Digit2").setOnClick(onKey),
      new KeyDef("#").code(SHIFT_PREFIX + "Digit3").setOnClick(onKey),
      new KeyDef("$").code(SHIFT_PREFIX + "Digit4").setOnClick(onKey),
      new KeyDef("%").code(SHIFT_PREFIX + "Digit5").setOnClick(onKey),
      new KeyDef("^").code(SHIFT_PREFIX + "Digit6").setOnClick(onKey),
      new KeyDef("&").code(SHIFT_PREFIX + "Digit7").setOnClick(onKey),
      new KeyDef("*").code(SHIFT_PREFIX + "Digit8").setOnClick(onKey),
      new KeyDef("(").code(SHIFT_PREFIX + "Digit9").setOnClick(onKey),
      new KeyDef(")").code(SHIFT_PREFIX + "Digit0").setOnClick(onKey),
    ],
    // Row 2: punctuation — 10 keys
    [
      new KeyDef("-").code("Minus").setOnClick(onKey),
      new KeyDef("+").code(SHIFT_PREFIX + "Equal").setOnClick(onKey),
      new KeyDef("=").code("Equal").setOnClick(onKey),
      new KeyDef("[").code("BracketLeft").setOnClick(onKey),
      new KeyDef("]").code("BracketRight").setOnClick(onKey),
      new KeyDef("\\").code("Backslash").setOnClick(onKey),
      new KeyDef(";").code("Semicolon").setOnClick(onKey),
      new KeyDef('"').code(SHIFT_PREFIX + "Quote").setOnClick(onKey),
      new KeyDef("~").code(SHIFT_PREFIX + "Backquote").setOnClick(onKey),
      new KeyDef("`").code("Backquote").setOnClick(onKey),
    ],
    // Row 3: more symbols — 8 keys + Delete(2w) = 10 units
    [
      new KeyDef("<").code(SHIFT_PREFIX + "Comma").setOnClick(onKey),
      new KeyDef(">").code(SHIFT_PREFIX + "Period").setOnClick(onKey),
      new KeyDef("/").code("Slash").setOnClick(onKey),
      new KeyDef("'").code("Quote").setOnClick(onKey),
      new KeyDef("{").code(SHIFT_PREFIX + "BracketLeft").setOnClick(onKey),
      new KeyDef("}").code(SHIFT_PREFIX + "BracketRight").setOnClick(onKey),
      new KeyDef("|").code(SHIFT_PREFIX + "Backslash").setOnClick(onKey),
      new KeyDef("_").code(SHIFT_PREFIX + "Minus").setOnClick(onKey),
      new KeyDef("Delete").setWidth(2).code("Backspace").setOnClick(onKey),
    ],
    // Row 4: navigation — 1+1+1+1+2+1+1+2 = 10 units
    bottomRowNumbers(),
  ],
}

export { KEYS, onKeyboardClose };
