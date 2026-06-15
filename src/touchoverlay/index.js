import { Component, Fragment } from "react";

import {
  ImageButton,
  KeyboardWhiteImage,
  PauseWhiteImage,
  VideoGameAssetWhiteImage,
  VideoGameAssetOffWhiteImage,
} from '@webrcade/app-common';

import './style.scss'

export class TouchOverlay extends Component {
  constructor() {
    super();

    this.state = {
      refresh: 0,
      initialShow: true
    }
  }

  render() {
    const { show } = this.props;
    const { initialShow } = this.state;
    const { emulator } = window;

    if (!emulator || !show) return <></>;

    if (initialShow) {
      this.setState({initialShow: false});
      setTimeout(() => {
        emulator.updateOnScreenControls(true);
      }, 0);
    }

    const app = emulator.app;

    const showPause = () => {
      if (!app.isShowOverlay() && emulator.pause(true)) {
        setTimeout(() => emulator.showPauseMenu(), 50);
      }
    }

    return (
      <Fragment>
      <div id="disk-led" style={{
        position: 'fixed',
        bottom: '0.8rem',
        left: '0.8rem',
        width: '1rem',
        height: '1rem',
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 35%, #ff9090 0%, #dd0000 50%, #880000 100%)',
        boxShadow: '0 0 3px 1px #aa000088, inset 0 1px 2px #ff000044',
        opacity: 0.2,
        pointerEvents: 'none',
        zIndex: 100,
      }} />
      <div className="touch-overlay" id="touch-overlay">
        <div className="touch-overlay-buttons">
          <div className="touch-overlay-buttons-left"></div>
          <div className="touch-overlay-buttons-center"></div>
          <div className="touch-overlay-buttons-right">
            <ImageButton
              className="touch-overlay-button"
              imgSrc={KeyboardWhiteImage}
              onClick={() => {
                emulator.toggleKeyboard();
              }}
              onFocus={(e) => {e.target.blur()}}
            />
            {emulator.isKeyboardEvent() &&
              <ImageButton
                className="touch-overlay-button"
                imgSrc={emulator.isKeyboardJoystickMode() ? VideoGameAssetWhiteImage : VideoGameAssetOffWhiteImage}
                onClick={() => {
                  emulator.setKeyboardJoystickMode(!emulator.isKeyboardJoystickMode());
                  this.setState({ refresh: this.state.refresh + 1 });
                }}
              />
            }
            <ImageButton
              className="touch-overlay-button touch-overlay-button-last"
              onClick={showPause}
              imgSrc={PauseWhiteImage}
              onFocus={(e) => {e.target.blur()}}
            />
          </div>
        </div>
      </div>
      </Fragment>
    );
  }
}
