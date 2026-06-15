import { NewRetroPrefs } from '@webrcade/app-common';

export const VK_TRANSPARENCY = {
  LOW: "low",
  HIGH: "high"
}

export const VK_POSITION = {
  MIDDLE: "middle",
  BOTTOM: "bottom"
}

export class Prefs extends NewRetroPrefs {
  constructor(emu) {
    super(emu);

    this.emu = emu;
    const app = emu.getApp();

    this.vkTransparencyPath = app.getStoragePath(`${this.PREFS_PREFIX}.vkTransparency`);
    this.vkTransparency = VK_TRANSPARENCY.HIGH;

    this.vkPositionPath = app.getStoragePath(`${this.PREFS_PREFIX}.vkPosition`);
    this.vkPosition = VK_POSITION.MIDDLE;
  }

  async load() {
    await super.load();
    this.vkTransparency = await super.loadValue(this.vkTransparencyPath, VK_TRANSPARENCY.LOW);
    this.vkPosition = await super.loadValue(this.vkPositionPath, VK_POSITION.MIDDLE);
  }

  async save() {
    await super.save();
    await super.saveValue(this.vkTransparencyPath, this.vkTransparency);
    await super.saveValue(this.vkPositionPath, this.vkPosition);
  }

  getVkTransparency() { return this.vkTransparency; }
  setVkTransparency(v) { this.vkTransparency = v; this.save(); }

  getVkPosition() { return this.vkPosition; }
  setVkPosition(v) { this.vkPosition = v; this.save(); }
}
