import React, { Fragment } from "react";

import { WebrcadeRetroApp } from '@webrcade/app-common';

import { Emulator } from './emulator';
import { EmulatorPauseScreen } from './pause';
import { VK_TRANSPARENCY } from "./emulator/prefs";
import { TouchOverlay } from "./touchoverlay";
import { Keyboard } from "./keyboard";

import './App.scss';

class App extends WebrcadeRetroApp {

  constructor() {
    super();
    this.state = {
      ...this.state,
      showKeyboard: false,
      kbTransparency: VK_TRANSPARENCY.HIGH,
    };
  }

  createEmulator(app, isDebug) {
    return new Emulator(app, isDebug);
  }

  isBiosRequired() {
    return true;
  }

  getBiosMap() {
    return {
      'a24d447d71a223343f5382f393fa80a7': 'a2cffa2.zip',
      'ca86796676d3de0607661677b86a3ac7': 'apple2gs.zip',
    };
  }

  getBiosUrls(appProps) {
    return appProps.apple2gs_bios ? appProps.apple2gs_bios : [];
  }

  isDiscBased() {
    return false;
  }

  isMediaBased() {
    return true;
  }

  isKeyboardShown() {
    return this.state.showKeyboard;
  }

  setKeyboardShown(value) {
    this.setState({ showKeyboard: value });
  }

  setKeyboardTransparency(value) {
    this.setState({ kbTransparency: value });
  }

  showCanvas() {
    this.setState({ showCanvas: true });
  }

  renderPauseScreen() {
    const { appProps, emulator } = this;
    return (
      <EmulatorPauseScreen
        emulator={emulator}
        appProps={appProps}
        closeCallback={() => this.resume()}
        exitCallback={() => this.exitFromPause()}
        isEditor={this.isEditor}
        isStandalone={this.isStandalone}
      />
    );
  }

  render() {
    const { showCanvas, showKeyboard, kbTransparency } = this.state;
    return (
      <Fragment>
        {super.render()}
        <TouchOverlay show={showCanvas} />
        <Keyboard
          show={showKeyboard}
          transparency={kbTransparency}
        />
      </Fragment>
    );
  }
}

export default App;
