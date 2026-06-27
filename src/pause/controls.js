import React from 'react';
import { ControlsTab } from '@webrcade/app-common';

export const OPTIONS = [
  { label: "Button 0",      value: "button0"     },
  { label: "Button 1",      value: "button1"     },
  { label: "Open Apple",    value: "openapple"   },
  { label: "Closed Apple",  value: "closedapple" },
  { label: "Return",        value: "return"      },
  { label: "Space Bar",     value: "space"       },
  { label: "Escape",        value: "escape"      },
  { label: "Tab",           value: "tab"         },
  { label: "Delete",        value: "delete"      },
  { label: "A", value: "a" }, { label: "B", value: "b" }, { label: "C", value: "c" },
  { label: "D", value: "d" }, { label: "E", value: "e" }, { label: "F", value: "f" },
  { label: "G", value: "g" }, { label: "H", value: "h" }, { label: "I", value: "i" },
  { label: "J", value: "j" }, { label: "K", value: "k" }, { label: "L", value: "l" },
  { label: "M", value: "m" }, { label: "N", value: "n" }, { label: "O", value: "o" },
  { label: "P", value: "p" }, { label: "Q", value: "q" }, { label: "R", value: "r" },
  { label: "S", value: "s" }, { label: "T", value: "t" }, { label: "U", value: "u" },
  { label: "V", value: "v" }, { label: "W", value: "w" }, { label: "X", value: "x" },
  { label: "Y", value: "y" }, { label: "Z", value: "z" },
  { label: "1", value: "1" }, { label: "2", value: "2" }, { label: "3", value: "3" },
  { label: "4", value: "4" }, { label: "5", value: "5" }, { label: "6", value: "6" },
  { label: "7", value: "7" }, { label: "8", value: "8" }, { label: "9", value: "9" },
  { label: "0", value: "0" },
  { label: "-",  value: "minus"     }, { label: "=",  value: "equal"     },
  { label: "[",  value: "lbracket"  }, { label: "]",  value: "rbracket"  },
  { label: "\\", value: "backslash" }, { label: ";",  value: "semicolon" },
  { label: "'",  value: "quote"     }, { label: "`",  value: "backtick"  },
  { label: ",",  value: "comma"     }, { label: ".",  value: "period"    },
  { label: "/",  value: "slash"     },
];

let keymap = null;

const getKeyName = (key) => {
  if (keymap === null) {
    keymap = {};
    for (let i = 0; i < OPTIONS.length; i++) {
      keymap[OPTIONS[i].value] = OPTIONS[i].label;
    }
  }
  return keymap[key];
};

export class GamepadControlsTab extends ControlsTab {
  render() {
    const { emulator } = this.props;
    const mappings = emulator.getMappings();

    const startName = mappings["start"] ? getKeyName(mappings["start"]) : null;
    const aName     = mappings["a"]     ? getKeyName(mappings["a"])     : null;
    const bName     = mappings["b"]     ? getKeyName(mappings["b"])     : null;
    const xName     = mappings["x"]     ? getKeyName(mappings["x"])     : null;
    const yName     = mappings["y"]     ? getKeyName(mappings["y"])     : null;
    const lbName    = mappings["lb"]    ? getKeyName(mappings["lb"])    : null;
    const rbName    = mappings["rb"]    ? getKeyName(mappings["rb"])    : null;
    const ltName    = mappings["lt"]    ? getKeyName(mappings["lt"])    : null;
    const rtName    = mappings["rt"]    ? getKeyName(mappings["rt"])    : null;

    return (
      <>
        {this.renderControl('select', 'Toggle Keyboard')}
        {this.renderControl('lanalog', 'Joystick')}
        {this.renderControl('dpad', 'Joystick')}
        {aName     ? this.renderControl('a',     aName)  : this.renderControl('a', 'Button 0')}
        {bName     ? this.renderControl('b',     bName)  : this.renderControl('b', 'Button 1')}
        {xName     && this.renderControl('x',     xName)}
        {yName     && this.renderControl('y',     yName)}
        {lbName    && this.renderControl('lbump', lbName)}
        {rbName    && this.renderControl('rbump', rbName)}
        {ltName    && this.renderControl('ltrig', ltName)}
        {rtName    && this.renderControl('rtrig', rtName)}
        {startName && this.renderControl('start', startName)}
      </>
    );
  }
}

export class KeyboardControlsTab extends ControlsTab {
  render() {
    const { emulator } = this.props;
    const mappings = emulator.getMappings();

    const aName = mappings["a"] ? getKeyName(mappings["a"]) : null;
    const bName = mappings["b"] ? getKeyName(mappings["b"]) : null;

    return (
      <>
        {this.renderKey('ArrowUp',    'Joystick Up')}
        {this.renderKey('ArrowDown',  'Joystick Down')}
        {this.renderKey('ArrowLeft',  'Joystick Left')}
        {this.renderKey('ArrowRight', 'Joystick Right')}
        {aName ? this.renderKey('KeyZ', aName)  : this.renderKey('KeyZ', 'Button 0')}
        {bName ? this.renderKey('KeyX', bName)  : this.renderKey('KeyX', 'Button 1')}
      </>
    );
  }
}
