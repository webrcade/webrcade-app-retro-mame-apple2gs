import {
  RetroAppWrapper,
  ScriptAudioProcessor,
  Controllers,
  Controller,
  DisplayLoop,
  SCREEN_CONTROLS,
  KCODES,
  CIDS,
  KeyCodeToControlMapping,
  blobToStr,
  computeShortNames,
  md5,
  LOG,
  SaveWhiteImage,
} from '@webrcade/app-common';

import { Prefs } from './prefs';

// Maps keyboard keys to controller inputs for Apple IIgs
// Arrow keys = joystick, Z/X = buttons A/B
export class Apple2GsKeyCodeToControlMapping extends KeyCodeToControlMapping {
  constructor() {
    super({
      [KCODES.ARROW_UP]:    CIDS.UP,
      [KCODES.ARROW_DOWN]:  CIDS.DOWN,
      [KCODES.ARROW_RIGHT]: CIDS.RIGHT,
      [KCODES.ARROW_LEFT]:  CIDS.LEFT,
      [KCODES.Z]:           CIDS.A,
      [KCODES.X]:           CIDS.B,
    });
  }
}

// Disk size thresholds for auto-detection
const SIZE_525_MAX = 500 * 1024;  // 5.25" floppy max ~500KB
const SIZE_35_MAX  = 900 * 1024;  // 3.5" floppy max ~900KB

// Detects disk type from file size and header
// Returns: '525' (5.25" floppy), '35' (3.5" floppy), or 'hd' (hard disk)
function getDiskType(bytes) {
  // WOZ files: read DISK_TYPE from INFO chunk header (byte 21: 1=5.25", 2=3.5")
  if (bytes.length > 22 &&
      bytes[0] === 0x57 && bytes[1] === 0x4F && bytes[2] === 0x5A &&
      (bytes[3] === 0x31 || bytes[3] === 0x32)) {
    return bytes[21] === 2 ? '35' : '525';
  }
  // Fallback to size-based detection
  if (bytes.length < SIZE_525_MAX) return '525';
  if (bytes.length < SIZE_35_MAX)  return '35';
  return 'hd';
}

export class Emulator extends RetroAppWrapper {

  SAVE_NAME = 'sav';

  constructor(app, debug = false) {
    super(app, debug);
    window.emulator = this; // Expose to C++ via EM_ASM callbacks
    this.firstFrame = true;
    this.prefs = new Prefs(this);
    this.touchEvent = false;
    this.mouseEvent = false;
    this.keyboardEvent = false;
    this.diskActivity = false;
    this.selectDown = false;
    this.analogMode = true;
    this.keyboardJoystickMode = true;
    this.gameRunning = false;

    // Mouse delta accumulators (sent to C++ each frame, then cleared)
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseButtons = 0;

    // Audio processing
    this.audioStarted = 0;
    this.audioCarry = 0;

    // Audio callback from C++ (receives audio buffer from MAME via EM_ASM)
    this.audioCallback = (offset, length) => {
      // length = incoming frames (mono)
      // Overproduce at 48015Hz then reduce during playback to handle timing variability

      // ---- target frames this callback ----
      const exactFrames = 48015 / 60; // 800.25
      const framesWithCarry = exactFrames + this.audioCarry;
      const outFrames = Math.floor(framesWithCarry);
      this.audioCarry = framesWithCarry - outFrames;

      // ---- input samples (stereo interleaved) ----
      const inSamples = length << 1;
      const input = new Int16Array(
        window.Module.HEAP16.buffer,
        offset,
        inSamples
      );

      // ---- output buffer (stereo interleaved) ----
      const outSamples = outFrames << 1;
      const output = new Int16Array(outSamples);

      // ---- frame walking resampler (no timing drift) ----
      const step = length / outFrames;

      let srcFrame = 0;
      for (let i = 0; i < outFrames; i++) {
        const si = (srcFrame | 0) << 1;

        output[i * 2]     = input[si];
        output[i * 2 + 1] = input[si + 1];

        srcFrame += step;
      }

      this.audioProcessor.storeSoundCombinedInput(
        output,
        2,
        outSamples,
        0,
        32768
      );
    };

    // Disk media lists: 5.25" (flop1), 3.5" (flop3), hard disk (hdMedia)
    this.flop1List = [];
    this.flop3List = [];
    this.hdMedia   = null;
    this.flop1Index = 0;
    this.flop2Index = -1; // -1 = no disk mounted
    this.flop3Index = 0;
    this.flop4Index = -1; // -1 = no disk mounted

    // Auto-request pointer lock when user clicks canvas (for mouse control)
    this.pointerLockHandler = async () => {
      if (!document.pointerLockElement && !this.app.isKeyboardShown()) {
        await this.canvas.requestPointerLock();
      }
    };

    // Accumulate mouse movement deltas
    document.onmousemove = (e) => {
      this.mouseX += e.movementX;
      this.mouseY += e.movementY;
    };
    // Track mouse button state (bits set/cleared, combined with gamepad in pollControls)
    document.onmousedown = (e) => {
      if (e.button === 0) this.mouseButtons |= this.MOUSE_LEFT;
      else if (e.button === 1) this.mouseButtons |= this.MOUSE_MIDDLE;
      else if (e.button === 2) this.mouseButtons |= this.MOUSE_RIGHT;
    };
    document.onmouseup = (e) => {
      if (e.button === 0) this.mouseButtons &= ~this.MOUSE_LEFT;
      else if (e.button === 1) this.mouseButtons &= ~this.MOUSE_MIDDLE;
      else if (e.button === 2) this.mouseButtons &= ~this.MOUSE_RIGHT;
    };
    document.oncontextmenu = (e) => e.preventDefault();

    // Clear mouse deltas when pointer lock is released
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement) {
        this.mouseX = 0;
        this.mouseY = 0;
      }
    });
  }

  setPointerLock(lock) {
    if (!this.canvas) return;
    if (lock) {
      this.canvas.addEventListener('click', this.pointerLockHandler);
    } else {
      this.canvas.removeEventListener('click', this.pointerLockHandler);
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    }
  }

  setGameRunning(running) {
    this.gameRunning = running;
    this.setPointerLock(running);
  }

  createControllers() {
    return new Controllers([
      new Controller(new Apple2GsKeyCodeToControlMapping()),
      new Controller(),
      new Controller(),
      new Controller(),
    ]);
  }

  isKeyboardJoystickMode() { return this.keyboardJoystickMode; }
  setKeyboardJoystickMode(val) {
    this.controllers.setKeyboardDisabled(!val);
    return this.keyboardJoystickMode = val;
  }

  getScriptUrl() { return 'js/apple2gs_libretro.js'; }
  getPrefs() { return this.prefs; }
  getRomPointer() {
    if (!this.media || this.flop1Index >= this.media.length) return 0;

    try {
      const bytes = this.media[this.flop1Index][0];
      if (!bytes || bytes.length === 0) return 0;

      const ptr = window.Module._malloc(bytes.length);
      if (!ptr) return 0;

      window.Module.HEAPU8.set(bytes, ptr);

      window.Module._wrc_rom_ptr = ptr;
      window.Module._wrc_rom_size = bytes.length;

      return ptr;
    } catch (e) {
      console.error('Error getting ROM pointer:', e);
      return 0;
    }
  }

  getRomPointerLength() {
    return window.Module._wrc_rom_size || 0;
  }
  isEscapeHackEnabled() { return false; }

  handleEscape(controllers) {
    if (controllers.isControlDown(0, CIDS.LTRIG) && controllers.isControlDown(0, CIDS.RANALOG)) {
      if (!this.gamepadVkPending) {
        this.gamepadVkPending = true;
        controllers
          .waitUntilControlReleased(0, CIDS.ESCAPE)
            .then(() => {
              this.gamepadVkPending = false;
              this.toggleKeyboard();
            });
      }
      return true;
    }
    return false;
  }

  isKeyboardEvent() { return this.keyboardEvent; }
  // Called by C++ to get ZipGS accelerator setting (0=default 2.8MHz, 1-4=7/8/12/16MHz)
  getCpuSpeed() { return this.getProps().cpuSpeed || 0; }

  // Called by C++ when floppy/HD activity changes (shows/hides disk LED)
  // For HDD: C++ sends quick on/off pulses, we extend them for visibility
  onDiskActivity(active) {
    const led = document.getElementById('disk-led');
    if (!led) return;

    if (active !== 0) {
      // Turn LED on
      this.diskActivity = true;
      led.classList.add('disk-led-active');

      // Clear any pending timeout
      if (this.diskActivityTimeout) {
        clearTimeout(this.diskActivityTimeout);
      }

      // Keep LED on for 100ms after last activity
      this.diskActivityTimeout = setTimeout(() => {
        this.diskActivity = false;
        led.classList.remove('disk-led-active');
        led.style.opacity = '0.15';
        this.diskActivityTimeout = null;
      }, 100);
    }
  }

  pollControls() {
    const { controllers } = this;

    // Right analog stick controls mouse cursor (like DOSBox Pure)
    // Combined with actual mouse input, both work simultaneously
    const gamepads = navigator.getGamepads();
    if (gamepads && gamepads[0]) {
      const gamepad = gamepads[0];
      if (gamepad.axes.length >= 4) {
        const arx = gamepad.axes[2]; // Right stick X
        const ary = gamepad.axes[3]; // Right stick Y
        const DEADZONE = 0.20;
        const SPEED_NORMAL = 8;  // pixels per frame at full deflection
        const SPEED_SLOW = 3;    // slow mode for precision (RTRIG)

        const slowMode = controllers && controllers.isControlDown(0, CIDS.RTRIG);
        const speed = slowMode ? SPEED_SLOW : SPEED_NORMAL;

        let deltaX = 0;
        let deltaY = 0;

        if (Math.abs(arx) > DEADZONE) {
          deltaX = Math.round(arx * speed);
        }
        if (Math.abs(ary) > DEADZONE) {
          deltaY = Math.round(ary * speed);
        }

        this.mouseX += deltaX;
        this.mouseY += deltaY;
      }
    }

    // Combine mouse event state with gamepad buttons
    let buttons = this.mouseButtons; // Start with actual mouse state
    if (controllers) {
      if (controllers.isControlDown(0, CIDS.LBUMP)) {
        buttons |= 1; // Add left mouse button from gamepad
      }
      if (controllers.isControlDown(0, CIDS.RBUMP)) {
        buttons |= 2; // Add right mouse button from gamepad
      }
    }

    if (window.Module && window.Module._wrc_update_mouse) {
      window.Module._wrc_update_mouse(this.mouseX, this.mouseY, buttons);
    }
    this.mouseX = 0;
    this.mouseY = 0;
    super.pollControls();
    if (!this.paused) {
      if (controllers.isControlDown(0, CIDS.SELECT)) {
        if (this.selectDown) return;
        this.selectDown = true;
        controllers.waitUntilControlReleased(0, CIDS.SELECT).then(() => {
          this.toggleKeyboard();
          this.selectDown = false;
        });
      }
    }
  }

  onPause(p) {
    const { app } = this;
    this.setPointerLock(!p && this.gameRunning);
    if (p) {
      try { this.setDisableInput(false); app.setKeyboardShown(false); } catch (e) {}
    }
    super.onPause(p);
  }

  async applyGameSettings() {
    if (this.getProps().initialKeyboardMode === 1) {
      this.keyboardJoystickMode = false;
    }
  }
  createAudioProcessor() {
    return new ScriptAudioProcessor(
      2,
      48000,
      8192 + 4096,
      2048
    ).setDebug(this.debug);
  }
  createTouchListener() {}
  isForceAspectRatio() { return false; }
  getDefaultAspectRatio() { return 1.333; }
  getShotAspectRatio() { return this.getDefaultAspectRatio(); }
  resizeScreen(canvas) { this.canvas = canvas; this.updateScreenSize(); }
  createDisplayLoop(debug) { return new DisplayLoop(60, true, debug, false, false); }

  // --- Media list accessors ---
  getFlop1List() { return this.flop1List; }
  getFlop3List() { return this.flop3List; }
  getHdMedia()   { return this.hdMedia; }
  getFlop1Index() { return this.flop1Index; }
  getFlop2Index() { return this.flop2Index; }
  getFlop3Index() { return this.flop3Index; }
  getFlop4Index() { return this.flop4Index; }

  getFlop1Path() {
    return this.flop1List.length > 0 && this.flop1Index >= 0 ? this.flop1List[this.flop1Index].path : '';
  }
  getFlop2Path() {
    return this.flop1List.length > 0 && this.flop2Index >= 0 ? this.flop1List[this.flop2Index].path : '';
  }
  getFlop3Path() {
    return this.flop3List.length > 0 && this.flop3Index >= 0 ? this.flop3List[this.flop3Index].path : '';
  }
  getFlop4Path() {
    return this.flop3List.length > 0 && this.flop4Index >= 0 ? this.flop3List[this.flop4Index].path : '';
  }

  // Base class compatibility
  getMediaList()  { return this.flop1List; }
  getMediaIndex() { return this.flop1Index; }
  getMediaPath()  { return this.getFlop1Path(); }

  setFlop1Index(index, eject = false) {
    this.flop1Index = index;
    // OPT12 handles ALL drives (flop1, flop2, flop3, flop4)
    if (eject) window.Module._wrc_set_options(this.OPT12);
  }

  setFlop2Index(index, eject = false) {
    this.flop2Index = index;
    // OPT12 handles ALL drives
    if (eject) window.Module._wrc_set_options(this.OPT12);
  }

  setFlop3Index(index, eject = false) {
    this.flop3Index = index;
    // OPT12 handles ALL drives
    if (eject) window.Module._wrc_set_options(this.OPT12);
  }

  setFlop4Index(index, eject = false) {
    this.flop4Index = index;
    // OPT12 handles ALL drives
    if (eject) window.Module._wrc_set_options(this.OPT12);
  }

  setMediaIndex(index, eject = false) { this.setFlop1Index(index, eject); }

  updateSaveStateForSlotProps(slot, props) {
    // Save state names for all 4 drives (null if not mounted)
    props.flop1StateName = this.flop1List.length > 0 && this.flop1Index >= 0
      ? this.flop1List[this.flop1Index].stateName : null;
    props.flop2StateName = this.flop1List.length > 0 && this.flop2Index >= 0
      ? this.flop1List[this.flop2Index].stateName : null;
    props.flop3StateName = this.flop3List.length > 0 && this.flop3Index >= 0
      ? this.flop3List[this.flop3Index].stateName : null;
    props.flop4StateName = this.flop3List.length > 0 && this.flop4Index >= 0
      ? this.flop3List[this.flop4Index].stateName : null;
  }

  async loadStateForSlot(slot, currentSlot) {
    const { flop1StateName, flop2StateName, flop3StateName, flop4StateName } = currentSlot;

    // Check if 2nd drives are enabled
    const enable2nd525 = this.getProps().enable2nd525 || false;
    const enable2nd35 = this.getProps().enable2nd35 || false;

    // Restore flop1 -- eject if it was empty ("none") when saved, rather
    // than leaving whatever's currently mounted in place.
    if (flop1StateName) {
      let found = false;
      for (let i = 0; i < this.flop1List.length; i++) {
        if (this.flop1List[i].stateName === flop1StateName) {
          this.setFlop1Index(i, true);
          found = true;
          break;
        }
      }
      if (!found) this.setFlop1Index(-1, true);
    } else {
      this.setFlop1Index(-1, true);
    }

    // Restore flop2 -- eject if disabled, not found, or empty when saved.
    if (enable2nd525 && flop2StateName) {
      let found = false;
      for (let i = 0; i < this.flop1List.length; i++) {
        if (this.flop1List[i].stateName === flop2StateName) {
          this.setFlop2Index(i, true);
          found = true;
          break;
        }
      }
      if (!found) this.setFlop2Index(-1, true);
    } else {
      this.setFlop2Index(-1, true);
    }

    // Restore flop3 -- eject if it was empty ("none") when saved.
    if (flop3StateName) {
      let found = false;
      for (let i = 0; i < this.flop3List.length; i++) {
        if (this.flop3List[i].stateName === flop3StateName) {
          this.setFlop3Index(i, true);
          found = true;
          break;
        }
      }
      if (!found) this.setFlop3Index(-1, true);
    } else {
      this.setFlop3Index(-1, true);
    }

    // Restore flop4 -- eject if disabled, not found, or empty when saved.
    if (enable2nd35 && flop4StateName) {
      let found = false;
      for (let i = 0; i < this.flop3List.length; i++) {
        if (this.flop3List[i].stateName === flop4StateName) {
          this.setFlop4Index(i, true);
          found = true;
          break;
        }
      }
      if (!found) this.setFlop4Index(-1, true);
    } else {
      this.setFlop4Index(-1, true);
    }

    return await super.loadStateForSlot(slot);
  }

  getMappings() {
    return this.app.mappings || {};
  }

  initMaps() {
    if (!this._initMaps) {
      this._initMaps = true;

      this.buttonBits = {
        "a":     this.INP_A,
        "b":     this.INP_B,
        "x":     this.INP_X,
        "y":     this.INP_Y,
        "lb":    this.INP_LBUMP,
        "rb":    this.INP_RBUMP,
        "lt":    this.INP_LTRIG,
        "rt":    this.INP_RTRIG,
        "start": this.INP_START,
        "up":    this.INP_UP,
        "down":  this.INP_DOWN,
        "left":  this.INP_LEFT,
        "right": this.INP_RIGHT,
      };

      this.moveBits = {
        "moveup":    this.INP_UP,
        "movedown":  this.INP_DOWN,
        "moveleft":  this.INP_LEFT,
        "moveright": this.INP_RIGHT,
      };

      this.buttonIsDown = {};
      for (const key in this.buttonBits) {
        this.buttonIsDown[key] = [false, false, false, false];
      }

      this.keyActions = {
        "return":      { code: 'Enter'        },
        "space":       { code: 'Space'        },
        "escape":      { code: 'Escape'       },
        "tab":         { code: 'Tab'          },
        "delete":      { code: 'Backspace'    },
        "openapple":   { code: 'AltLeft'      },
        "closedapple": { code: 'AltRight'     },
        "minus":       { code: 'Minus'        },
        "equal":       { code: 'Equal'        },
        "lbracket":    { code: 'BracketLeft'  },
        "rbracket":    { code: 'BracketRight' },
        "backslash":   { code: 'Backslash'    },
        "semicolon":   { code: 'Semicolon'    },
        "quote":       { code: 'Quote'        },
        "backtick":    { code: 'Backquote'    },
        "comma":       { code: 'Comma'        },
        "period":      { code: 'Period'       },
        "slash":       { code: 'Slash'        },
      };
      for (let c = 0; c < 26; c++) {
        const ch = (c + 10).toString(36);
        this.keyActions[ch] = { code: 'Key' + ch.toUpperCase() };
      }
      for (let c = 0; c <= 9; c++) {
        this.keyActions['' + c] = { code: 'Digit' + c };
      }

      this.mappings = { ...this.getMappings() };
      const DPAD_DEFAULTS = { up: 'moveup', down: 'movedown', left: 'moveleft', right: 'moveright' };
      for (const [btn, defaultAction] of Object.entries(DPAD_DEFAULTS)) {
        if (this.mappings[btn] === undefined) {
          this.mappings[btn] = defaultAction;
        }
      }
    }
  }

  sendInput(controller, input, analog0x, analog0y, analog1x, analog1y) {
    if (controller !== 0) return;

    if (controller === 0) {
      const DEADZONE = 0.15;
      const dx = (analog0x > -DEADZONE && analog0x < DEADZONE) ? 0 : analog0x;
      const dy = (analog0y > -DEADZONE && analog0y < DEADZONE) ? 0 : analog0y;
      Math.max(-1, Math.min(1, dx * (4/3)));
      Math.max(-1, Math.min(1, dy * (4/3)));
    }

    this.initMaps();
    let maskedInput = input;

    maskedInput &= ~(this.INP_A | this.INP_B | this.INP_UP | this.INP_DOWN | this.INP_LEFT | this.INP_RIGHT);

    for (const [btn, action] of Object.entries(this.mappings)) {
      const bit = this.buttonBits[btn];
      const isDown = !!(input & bit);

      if (isDown && (action === 'button0')) {
        maskedInput |= this.INP_A;
        continue;
      }
      if (isDown && (action === 'button1')) {
        maskedInput |= this.INP_B;
        continue;
      }

      const moveBit = this.moveBits[action];
      if (moveBit) {
        if (isDown) maskedInput |= moveBit;
        continue;
      }

      const keyDef = this.keyActions[action];
      if (bit && keyDef) {
        const wasDown = this.buttonIsDown[btn][controller];
        if (isDown && !wasDown) {
          if (keyDef.shift) this.sendKeyDown('ShiftLeft');
          this.sendKeyDown(keyDef.code);
        } else if (!isDown && wasDown) {
          this.sendKeyUp(keyDef.code);
          if (keyDef.shift) this.sendKeyUp('ShiftLeft');
        }
        this.buttonIsDown[btn][controller] = isDown;
        maskedInput &= ~bit;
      }
    }

    super.sendInput(controller, maskedInput, analog0x, analog0y, analog1x, analog1y);
  }

  async getFileContentMd5(content) {
    if (!(content instanceof Blob)) content = new Blob([content]);
    return md5(await blobToStr(content));
  }

  toggleKeyboard() {
    const { app } = this;
    const show = !app.isKeyboardShown();
    this.setDisableInput(show);
    app.setKeyboardShown(show);
  }

  updateVkTransparency() {
    this.app.setKeyboardTransparency(this.prefs.getVkTransparency());
  }

  showTouchOverlay(show) {
    const to = document.getElementById("touch-overlay");
    if (to) to.style.display = show ? 'block' : 'none';
  }

  checkOnScreenControls() {
    const controls = this.prefs.getScreenControls();
    if (controls === SCREEN_CONTROLS.SC_AUTO) {
      setTimeout(() => { this.showTouchOverlay(true); this.app.forceRefresh(); }, 0);
    }
  }

  onKeyboardEvent(e) {
    if (e.code && !this.keyboardEvent) { this.keyboardEvent = true; this.checkOnScreenControls(); }
  }
  onTouchEvent() {
    if (!this.touchEvent) { this.touchEvent = true; this.checkOnScreenControls(); }
  }
  onMouseEvent() {
    if (!this.mouseEvent) { this.mouseEvent = true; this.checkOnScreenControls(); }
  }

  updateOnScreenControls(initial = false) {
    const controls = this.prefs.getScreenControls();
    if (controls === SCREEN_CONTROLS.SC_OFF) {
      this.showTouchOverlay(false);
    } else if (controls === SCREEN_CONTROLS.SC_ON) {
      this.showTouchOverlay(true);
    } else if (controls === SCREEN_CONTROLS.SC_AUTO) {
      if (!initial) {
        setTimeout(() => { this.showTouchOverlay(this.touchEvent || this.mouseEvent); this.app.forceRefresh(); }, 0);
      }
    }
  }

  // Builds standardized filename for disk images
  // Strips zip paths, preserves parenthetical info (disk number, version) and NTSC/PAL markers
  // Example: "subdir/Game (Disk 1).dsk" → "game525_0 (Disk 1).dsk"
  _buildMediaEntry(rawName, prefix, index) {
    const slashIdx = rawName.lastIndexOf('/');
    if (slashIdx !== -1) rawName = rawName.substring(slashIdx + 1);
    const extIdx = rawName.lastIndexOf('.');
    let fileName = '', ext = '';
    if (extIdx !== -1) { fileName = rawName.substring(0, extIdx); ext = rawName.substring(extIdx + 1); }
    const pstartIdx = fileName.indexOf('(');
    const pendIdx = fileName.lastIndexOf(')');
    const parens = (pstartIdx !== -1 && pendIdx !== -1) ? fileName.substring(pstartIdx, pendIdx + 1) : '';
    const updatedNameNoExt = prefix + index +
      (parens.length > 0 ? (' ' + parens) : '') +
      (fileName.toLowerCase().indexOf('ntsc') !== -1 ? ' NTSC' : '') +
      (fileName.toLowerCase().indexOf('pal') !== -1 ? ' PAL' : '');
    return {
      updatedName: updatedNameNoExt + (ext.length > 0 ? ('.' + ext) : ''),
      stateName: updatedNameNoExt + '.state',
      originalName: rawName,
      shortName: rawName,
    };
  }

  // Writes all media files to Emscripten FS and categorizes by type
  // 5.25" disks → flop1List, 3.5" disks → flop3List, hard disks → hdMedia
  async onStoreMedia() {
    const { FS } = window;
    this.flop1List = [];
    this.flop3List = [];
    this.hdMedia = null;

    const systemDir = this.RA_DIR + 'apple2gs/';
    let f525Count = 0, f35Count = 0;

    for (let i = 0; i < this.media.length; i++) {
      const m = this.media[i];
      const bytes = m[0];
      const rawName = m[1] || ('game' + i + '.dsk');
      const diskType = getDiskType(bytes);

      if (diskType === '525') {
        const entry = this._buildMediaEntry(rawName, 'game525_', f525Count++);
        const item = {
          name: entry.updatedName,
          md5: await this.getFileContentMd5(bytes),
          path: systemDir + entry.updatedName,
          stateName: entry.stateName,
          statePath: '/home/web_user/retroarch/userdata/states/' + entry.stateName,
          originalName: entry.originalName,
          shortName: entry.shortName,
        };
        this.flop1List.push(item);
        const s = FS.open(item.path, 'a');
        FS.write(s, bytes, 0, bytes.length, 0, true);
        FS.close(s);
        LOG.info('Wrote 5.25" disk: ' + item.path);
      } else if (diskType === '35') {
        const entry = this._buildMediaEntry(rawName, 'game35_', f35Count++);
        const item = {
          name: entry.updatedName,
          md5: await this.getFileContentMd5(bytes),
          path: systemDir + entry.updatedName,
          stateName: entry.stateName,
          statePath: '/home/web_user/retroarch/userdata/states/' + entry.stateName,
          originalName: entry.originalName,
          shortName: entry.shortName,
        };
        this.flop3List.push(item);
        const s = FS.open(item.path, 'a');
        FS.write(s, bytes, 0, bytes.length, 0, true);
        FS.close(s);
        LOG.info('Wrote 3.5" disk: ' + item.path);
      } else if (!this.hdMedia) {
        const entry = this._buildMediaEntry(rawName, 'hd_', 0);
        const item = {
          name: entry.updatedName,
          md5: await this.getFileContentMd5(bytes),
          path: systemDir + entry.updatedName,
          originalName: entry.originalName,
          shortName: entry.shortName,
        };
        this.hdMedia = item;
        const s = FS.open(item.path, 'a');
        FS.write(s, bytes, 0, bytes.length, 0, true);
        FS.close(s);
        LOG.info('Wrote HD: ' + item.path);
      }
    }

    let cmd = 'apple2gs -ramsize 8m -gameio joy';

    // Check if 2nd drives are enabled via properties
    const enable2nd525 = this.getProps().enable2nd525 || false;
    const enable2nd35 = this.getProps().enable2nd35 || false;

    // Mount 5.25" disks: flop1 always gets first disk, flop2 only if enabled and 2+ disks
    if (this.flop1List.length > 0) cmd += ' -flop1 "' + this.flop1List[0].path + '"';
    if (enable2nd525 && this.flop1List.length > 1) {
      cmd += ' -flop2 "' + this.flop1List[1].path + '"';
      this.flop2Index = 1; // Auto-mount second disk
    }

    // Mount 3.5" disks: flop3 always gets first disk, flop4 only if enabled and 2+ disks
    if (this.flop3List.length > 0) cmd += ' -flop3 "' + this.flop3List[0].path + '"';
    if (enable2nd35 && this.flop3List.length > 1) {
      cmd += ' -flop4 "' + this.flop3List[1].path + '"';
      this.flop4Index = 1; // Auto-mount second disk
    }

    if (this.hdMedia) cmd += ' -sl7 cffa2 -hard1 "' + this.hdMedia.path + '"';
    this.game = cmd;

    if (this.flop1List.length > 0) this.setFlop1Index(0);
    else if (this.flop3List.length > 0) this.setFlop3Index(0);

    // RA names its own save-state file after whichever disk is in the
    // highest-numbered actively-mounted drive -- flop4 beats flop3 beats
    // flop2 beats flop1 (confirmed via live testing). Decided once, here,
    // rather than inside setFlopNIndex -- those get called from several
    // other places (disk swap, state restore) that have no business
    // re-deciding which drive RA considers primary.
    if (enable2nd35 && this.flop3List.length > 1) {
      this.setStateFilePath(this.flop3List[1].statePath);
    } else if (this.flop3List.length > 0) {
      this.setStateFilePath(this.flop3List[0].statePath);
    } else if (enable2nd525 && this.flop1List.length > 1) {
      this.setStateFilePath(this.flop1List[1].statePath);
    } else if (this.flop1List.length > 0) {
      this.setStateFilePath(this.flop1List[0].statePath);
    }

    this._computeShortNames(this.flop1List);
    this._computeShortNames(this.flop3List);
  }

  _computeShortNames(list) {
    const shorts = computeShortNames(list.map(m => m.originalName));
    for (let i = 0; i < list.length; i++) {
      const dot = shorts[i].indexOf('.');
      list[i].shortName = dot !== -1 ? shorts[i].substring(0, dot) : shorts[i];
    }
  }

  async onWriteAdditionalFiles() {
    const { FS } = window;
    try { FS.mkdir(this.RA_DIR + 'apple2gs'); } catch (e) {}
    await super.onWriteAdditionalFiles();
    const biosBuffers = this.biosBuffers;
    if (biosBuffers) {
      try { FS.mkdir('/home/web_user/retroarch/userdata/system/mame'); } catch (e) {}
      try { FS.mkdir('/home/web_user/retroarch/userdata/system/mame/bios'); } catch (e) {}
      for (const name of Object.keys(biosBuffers)) {
        try {
          FS.writeFile('/home/web_user/retroarch/userdata/system/mame/bios/' + name, biosBuffers[name]);
          LOG.info('Wrote BIOS: ' + name);
        } catch (e) { LOG.error('Error writing BIOS ' + name + ': ' + e); }
      }
    }
    const mameOpt =
      'mame_alternate_renderer = "disabled"\n' +
      'mame_altres = "640x480"\n' +
      'mame_auto_save = "disabled"\n' +
      'mame_boot_to_bios = "disabled"\n' +
      'mame_boot_to_osd = "disabled"\n' +
      'mame_cheats_enable = "disabled"\n' +
      'mame_joystick_deadzone = "0.15"\n' +
      'mame_joystick_saturation = "0.85"\n' +
      'mame_joystick_threshold = "0.30"\n' +
      'mame_mouse_enable = "enabled"\n' +
      'mame_read_config = "disabled"\n' +
      'mame_rotation_mode = "libretro"\n' +
      'mame_saves = "game"\n' +
      'mame_softlists_enable = "disabled"\n' +
      'mame_thread_mode = "disabled"\n' +
      'mame_throttle = "disabled"\n' +
      'mame_write_config = "disabled"\n';
    try { FS.mkdir('/home/web_user/retroarch/userdata/config/MAME'); } catch (e) {}
    try { FS.writeFile('/home/web_user/retroarch/userdata/config/MAME/MAME.opt', mameOpt); }
    catch (e) { LOG.error('Error writing MAME.opt: ' + e); }
  }

  async saveState() {
    const { FS, Module } = window;
    const files = [];
    try {
      const hasMedia = this.flop1List.length > 0 || this.flop3List.length > 0;
      // 5.25"-only sessions are fast enough (small disks, no extra 3.5"
      // eject/swap loop) that this never looked like a freeze in testing --
      // only show the message when 3.5" media is actually involved, which
      // is meaningfully slower (larger disks + the flop3/flop4 loops below).
      const showAnalyzingMessage = this.flop3List.length > 0;

      // Ejecting/swapping through every disk plus hashing each one can take
      // long enough to look like a freeze with no feedback -- show a status
      // message for this phase, same mechanism already used for cloud
      // save/load progress.
      if (showAnalyzingMessage && this.saveMessageCallback) {
        // Spinner suppressed -- it's jumpy rather than smooth since each
        // disk op is a single synchronous native call with no way to paint
        // mid-operation; the text alone is the useful signal. A single
        // yield isn't reliably enough for the browser to actually paint
        // before work resumes -- two is.
        this.saveMessageCallback('Analyzing media...', false, SaveWhiteImage);
        await new Promise(r => setTimeout(r, 0));
        await new Promise(r => setTimeout(r, 0));
      }

      if (hasMedia) {
        // Save current state
        const savedFlop1 = this.flop1Index;
        const savedFlop2 = this.flop2Index;
        const savedFlop3 = this.flop3Index;
        const savedFlop4 = this.flop4Index;

        // Eject/swap through all 5.25" disks to trigger state file creation
        for (let i = 0; i < this.flop1List.length; i++) {
          this.flop1Index = i;
          Module._wrc_set_options(this.OPT12);
          await new Promise(r => setTimeout(r, 0));
        }
        for (let i = 0; i < this.flop1List.length; i++) {
          this.flop2Index = i;
          Module._wrc_set_options(this.OPT12);
          await new Promise(r => setTimeout(r, 0));
        }

        // Eject/swap through all 3.5" disks
        for (let i = 0; i < this.flop3List.length; i++) {
          this.flop3Index = i;
          Module._wrc_set_options(this.OPT12);
          await new Promise(r => setTimeout(r, 0));
        }
        for (let i = 0; i < this.flop3List.length; i++) {
          this.flop4Index = i;
          Module._wrc_set_options(this.OPT12);
          await new Promise(r => setTimeout(r, 0));
        }

        // Restore original state
        this.flop1Index = savedFlop1;
        this.flop2Index = savedFlop2;
        this.flop3Index = savedFlop3;
        this.flop4Index = savedFlop4;
        Module._wrc_set_options(this.OPT12);
        await new Promise(r => setTimeout(r, 0));
      }

      const allMedia = [
        ...this.flop1List,
        ...this.flop3List,
        ...(this.hdMedia ? [this.hdMedia] : []),
      ];

      for (const m of allMedia) {
        try {
          const res = FS.analyzePath(m.path, true);
          if (res.exists) {
            const s = FS.readFile(m.path);
            if (s) {
              const currentMd5 = await this.getFileContentMd5(s);
              if (currentMd5 !== m.md5) files.push({ name: m.name, content: s });
            }
          }
        } catch (e) { LOG.error(e); }
      }

      const hasChanges = await this.getSaveManager().checkFilesChanged(files);
      if (hasChanges) {
        await this.getSaveManager().save(
          `${this.saveStatePrefix}${this.SAVE_NAME}`,
          files,
          this.saveMessageCallback,
        );
      } else if (showAnalyzingMessage && this.saveMessageCallback) {
        // save() clears the status message itself when it runs; nothing
        // changed here, so clear the "Analyzing media..." message directly.
        this.saveMessageCallback(null);
      }
    } catch (e) { LOG.error('Error persisting save state: ' + e); }
  }

  async loadState() {
    const { FS } = window;
    try {
      const files = await this.getSaveManager().load(
        `${this.saveStatePrefix}${this.SAVE_NAME}.zip`,
        this.loadMessageCallback,
      );
      await this.getSaveManager().checkFilesChanged(files);
      const allMedia = [
        ...this.flop1List,
        ...this.flop3List,
        ...(this.hdMedia ? [this.hdMedia] : []),
      ];
      for (const f of files) {
        const item = allMedia.find(m => m.name === f.name);
        if (item && f.content) FS.writeFile(item.path, f.content);
      }
    } catch (e) { LOG.error('Error loading save state: ' + e); }
  }

  onFrame() {
    // Start audio processor after a few frames
    if (this.audioStarted !== -1) {
      if (this.audioStarted > 1) {
        this.audioStarted = -1;
        this.audioProcessor.start();
      } else {
        this.audioStarted++;
      }
    }

    if (!this.gameRunning) {
      this.setGameRunning(true);
    }
    if (this.firstFrame) {
      this.firstFrame = false;
      this.setKeyboardJoystickMode(this.isKeyboardJoystickMode());
      setTimeout(() => {
        const onTouch = () => { this.onTouchEvent() };
        window.addEventListener("touchstart", onTouch);
        window.addEventListener("touchend", onTouch);
        window.addEventListener("touchcancel", onTouch);
        window.addEventListener("touchmove", onTouch);
        const onMouse = () => { this.onMouseEvent() };
        window.addEventListener("mousedown", onMouse);
        window.addEventListener("mouseup", onMouse);
        window.addEventListener("mousemove", onMouse);
        document.onkeydown = (e) => {
          if (this.paused || this.app.isKeyboardShown()) return;
          this.onKeyboardEvent(e);
          if (this.isKeyboardJoystickMode() &&
            this.controllers.getController(0).getKeyCodeToControllerMapping().getKeyCodeToControlId()[e.code] !== undefined)
            return;
          if (e.repeat !== undefined && e.repeat) return;
          const retrok = this._browserCodeToRetrok(e.code);
          if (retrok) { window.Module._wrc_on_key(retrok, 1); e.stopPropagation(); e.preventDefault(); }
        };
        document.onkeyup = (e) => {
          if (this.paused || this.app.isKeyboardShown()) return;
          if (this.isKeyboardJoystickMode() &&
            this.controllers.getController(0).getKeyCodeToControllerMapping().getKeyCodeToControlId()[e.code] !== undefined)
            return;
          const retrok = this._browserCodeToRetrok(e.code);
          if (retrok) { window.Module._wrc_on_key(retrok, 0); e.stopPropagation(); e.preventDefault(); }
        };
        this.app.showCanvas();
      }, 10);
    }
  }

  _browserCodeToRetrok(code) {
    const map = {
      'KeyA': 97,  'KeyB': 98,  'KeyC': 99,  'KeyD': 100, 'KeyE': 101,
      'KeyF': 102, 'KeyG': 103, 'KeyH': 104, 'KeyI': 105, 'KeyJ': 106,
      'KeyK': 107, 'KeyL': 108, 'KeyM': 109, 'KeyN': 110, 'KeyO': 111,
      'KeyP': 112, 'KeyQ': 113, 'KeyR': 114, 'KeyS': 115, 'KeyT': 116,
      'KeyU': 117, 'KeyV': 118, 'KeyW': 119, 'KeyX': 120, 'KeyY': 121,
      'KeyZ': 122,
      'Digit0': 48, 'Digit1': 49, 'Digit2': 50, 'Digit3': 51, 'Digit4': 52,
      'Digit5': 53, 'Digit6': 54, 'Digit7': 55, 'Digit8': 56, 'Digit9': 57,
      'Space': 32, 'Enter': 13, 'Backspace': 8, 'Escape': 27, 'Tab': 9,
      'Delete': 127, 'Insert': 277, 'Home': 278, 'End': 279,
      'PageUp': 280, 'PageDown': 281, 'CapsLock': 301,
      'ArrowUp': 273, 'ArrowDown': 274, 'ArrowRight': 275, 'ArrowLeft': 276,
      'F1': 282, 'F2': 283, 'F3': 284, 'F4': 285,
      'F5': 286, 'F6': 287, 'F7': 288, 'F8': 289,
      'F9': 290, 'F10': 291, 'F11': 292, 'F12': 293,
      'ShiftLeft': 304, 'ShiftRight': 303,
      'ControlLeft': 306, 'ControlRight': 305,
      'AltLeft': 308, 'AltRight': 307,
      'Minus': 45, 'Equal': 61,
      'BracketLeft': 91, 'BracketRight': 93,
      'Semicolon': 59, 'Quote': 39,
      'Comma': 44, 'Period': 46, 'Slash': 47, 'Backslash': 92,
      'Backquote': 96,
    };
    return map[code] || 0;
  }

  sendKeyDown(code) {
    const retrok = this._browserCodeToRetrok(code);
    const { Module } = window;
    if (retrok && Module && Module._wrc_on_key) Module._wrc_on_key(retrok, 1);
  }

  sendKeyUp(code) {
    const retrok = this._browserCodeToRetrok(code);
    const { Module } = window;
    if (retrok && Module && Module._wrc_on_key) Module._wrc_on_key(retrok, 0);
  }
}
