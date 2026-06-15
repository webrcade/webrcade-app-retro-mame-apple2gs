import React from 'react';
import { ControlsTab } from '@webrcade/app-common';

export class GamepadControlsTab extends ControlsTab {
  render() {
    return (
      <>
        {/* {this.renderControl('dpad', 'Joystick')}
        {this.renderControl('lanalog', 'Joystick')}
        {this.renderControl('a', 'Button 0 (Fire)')}
        {this.renderControl('b', 'Button 1')}
        {this.renderControl('select', 'Toggle Keyboard')} */}
      </>
    );
  }
}

export class KeyboardControlsTab extends ControlsTab {
  render() {
    return (
      <>
        {/* {this.renderKey('ArrowUp', 'Up')}
        {this.renderKey('ArrowDown', 'Down')}
        {this.renderKey('ArrowLeft', 'Left')}
        {this.renderKey('ArrowRight', 'Right')}
        {this.renderKey('KeyZ', 'Button 0 (Fire)')}
        {this.renderKey('KeyX', 'Button 1')} */}
      </>
    );
  }
}
