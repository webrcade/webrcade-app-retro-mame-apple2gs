import React, { Fragment } from 'react';
import { Component } from 'react';

import {
  AppDisplaySettingsTab,
  EditorScreen,
  FieldsTab,
  FieldRow,
  FieldLabel,
  FieldControl,
  GamepadWhiteImage,
  TelevisionWhiteImage,
  KeyboardWhiteImage,
  BlurImage,
  ShaderSettingsTab,
  WebrcadeContext,
} from '@webrcade/app-common';
import { DiskSelect } from './diskselect';
import { VkTransparencySelect } from './vktransparencyselect';

export class Apple2GsSettingsEditor extends Component {
  constructor() {
    super();
    this.state = {
      tabIndex: null,
      focusGridComps: null,
      values: {},
    };
    this.busy = false;
  }

  componentDidMount() {
    const { emulator } = this.props;

    const values = {
      origBilinearMode: emulator.getPrefs().getBilinearMode(),
      bilinearMode: emulator.getPrefs().getBilinearMode(),
      origScreenSize: emulator.getPrefs().getScreenSize(),
      screenSize: emulator.getPrefs().getScreenSize(),
      origScreenControls: emulator.getPrefs().getScreenControls(),
      screenControls: emulator.getPrefs().getScreenControls(),
      origVkTransparency: emulator.getPrefs().getVkTransparency(),
      vkTransparency: emulator.getPrefs().getVkTransparency(),
      origFlop1Index: emulator.getFlop1Index(),
      flop1Index: emulator.getFlop1Index(),
      origFlop2Index: emulator.getFlop2Index(),
      flop2Index: emulator.getFlop2Index(),
      origFlop3Index: emulator.getFlop3Index(),
      flop3Index: emulator.getFlop3Index(),
      origFlop4Index: emulator.getFlop4Index(),
      flop4Index: emulator.getFlop4Index(),
    };

    this.shaderService = emulator.getShadersService();
    this.shaderService.addEditorValues(values);

    this.setState({ values });
  }

  render() {
    const { emulator, onClose, showOnScreenControls } = this.props;
    const { tabIndex, values, focusGridComps } = this.state;

    const setFocusGridComps = (comps) => this.setState({ focusGridComps: comps });
    const setValues = (values) => this.setState({ values: values });

    const hasFlop1 = emulator.getFlop1List().length > 1;
    const hasFlop3 = emulator.getFlop3List().length > 1;
    const hasSession = hasFlop1 || hasFlop3;
    const o = hasSession ? 1 : 0;

    return (
      <EditorScreen
        showCancel={true}
        onOk={async () => {
          if (this.busy) return;
          this.busy = true;

          let change = false;
          if (values.origBilinearMode !== values.bilinearMode) {
            emulator.getPrefs().setBilinearMode(values.bilinearMode);
            change = true;
          }
          if (values.origScreenSize !== values.screenSize) {
            emulator.getPrefs().setScreenSize(values.screenSize);
            emulator.updateScreenSize();
            change = true;
          }
          if (values.origScreenControls !== values.screenControls) {
            emulator.getPrefs().setScreenControls(values.screenControls);
            emulator.updateOnScreenControls();
            change = true;
          }
          if (values.origVkTransparency !== values.vkTransparency) {
            emulator.getPrefs().setVkTransparency(values.vkTransparency);
            emulator.updateVkTransparency();
            change = true;
          }
          if (change) emulator.getPrefs().save();

          const newFlop1 = parseInt(values.flop1Index);
          if (values.origFlop1Index !== newFlop1) emulator.setFlop1Index(newFlop1, true);
          const newFlop2 = parseInt(values.flop2Index);
          if (values.origFlop2Index !== newFlop2) emulator.setFlop2Index(newFlop2, true);
          const newFlop3 = parseInt(values.flop3Index);
          if (values.origFlop3Index !== newFlop3) emulator.setFlop3Index(newFlop3, true);
          const newFlop4 = parseInt(values.flop4Index);
          if (values.origFlop4Index !== newFlop4) emulator.setFlop4Index(newFlop4, true);

          await this.shaderService.setShader(values.shaderId);
          emulator.updateBilinearFilter();

          onClose();
        }}
        onClose={onClose}
        focusGridComps={focusGridComps}
        onTabChange={(oldTab, newTab) => this.setState({ tabIndex: newTab })}
        tabs={[
          ...(hasSession ? [{
            image: GamepadWhiteImage,
            label: 'Apple IIGS Settings (Session only)',
            content: (
              <Apple2GsSessionSettingsTab
                emulator={emulator}
                isActive={tabIndex === 0}
                setFocusGridComps={setFocusGridComps}
                values={values}
                setValues={setValues}
              />
            ),
          }] : []),
          {
            image: TelevisionWhiteImage,
            label: 'Display Settings',
            content: (
              <AppDisplaySettingsTab
                emulator={emulator}
                isBilinearMode={true}
                isActive={tabIndex === o}
                showOnScreenControls={showOnScreenControls}
                setFocusGridComps={setFocusGridComps}
                values={values}
                setValues={setValues}
              />
            ),
          },
          {
            image: BlurImage,
            label: 'Shader Settings',
            content: (
              <ShaderSettingsTab
                shaderService={this.shaderService}
                emulator={emulator}
                isActive={tabIndex === o + 1}
                setFocusGridComps={setFocusGridComps}
                values={values}
                setValues={setValues}
              />
            ),
          },
          {
            image: KeyboardWhiteImage,
            label: 'Virtual Keyboard Settings',
            content: (
              <Apple2GsVirtualKeyboardTab
                emulator={emulator}
                isActive={tabIndex === o + 2}
                setFocusGridComps={setFocusGridComps}
                values={values}
                setValues={setValues}
              />
            ),
          },
        ]}
      />
    );
  }
}

class Apple2GsSessionSettingsTab extends FieldsTab {
  constructor(props) {
    super(props);
    this.flop1Ref = React.createRef();
    this.flop2Ref = React.createRef();
    this.flop3Ref = React.createRef();
    this.flop4Ref = React.createRef();
    this.flop1List = props.emulator.getFlop1List();
    this.flop3List = props.emulator.getFlop3List();
    const enable2nd525 = props.emulator.getProps().enable2nd525 || false;
    const enable2nd35 = props.emulator.getProps().enable2nd35 || false;
    this.gridComps = [];
    // Show flop1 selector only if there are 5.25" disks
    if (this.flop1List.length > 0) this.gridComps.push([this.flop1Ref]);
    // Show flop2 selector only if enabled AND there are 2+ 5.25" disks
    if (enable2nd525 && this.flop1List.length > 1) this.gridComps.push([this.flop2Ref]);
    // Show flop3 selector only if there are 3.5" disks
    if (this.flop3List.length > 0) this.gridComps.push([this.flop3Ref]);
    // Show flop4 selector only if enabled AND there are 2+ 3.5" disks
    if (enable2nd35 && this.flop3List.length > 1) this.gridComps.push([this.flop4Ref]);
  }

  componentDidUpdate(prevProps, prevState) {
    const { setFocusGridComps, isActive } = this.props;
    if (isActive && isActive !== prevProps.isActive) {
      setFocusGridComps(this.gridComps);
    }
  }

  render() {
    const { flop1Ref, flop2Ref, flop3Ref, flop4Ref, flop1List, flop3List } = this;
    const { emulator } = this.props;
    const { focusGrid } = this.context;
    const { setValues, values } = this.props;

    // Check if 2nd drives are enabled via properties
    const enable2nd525 = emulator.getProps().enable2nd525 || false;
    const enable2nd35 = emulator.getProps().enable2nd35 || false;

    // Build filtered lists with mutual exclusion and "(none)" option
    const get525Options = (excludeIndex) => {
      const opts = [{ value: -1, label: "(none)" }];
      for (let i = 0; i < flop1List.length; i++) {
        if (i !== excludeIndex) {
          opts.push({ value: i, label: (i + 1) + ": " + flop1List[i].shortName });
        }
      }
      return opts;
    };

    const get35Options = (excludeIndex) => {
      const opts = [{ value: -1, label: "(none)" }];
      for (let i = 0; i < flop3List.length; i++) {
        if (i !== excludeIndex) {
          opts.push({ value: i, label: (i + 1) + ": " + flop3List[i].shortName });
        }
      }
      return opts;
    };

    return (
      <>
        {flop1List.length > 0 && (
          <FieldRow>
            <FieldLabel>5.25&quot; Drive 1</FieldLabel>
            <FieldControl>
              <DiskSelect
                selectRef={flop1Ref}
                mediaList={flop1List}
                customOptions={flop1List.length > 1 ? get525Options(values.flop2Index) : null}
                onChange={(value) => setValues({ ...values, flop1Index: value })}
                value={values.flop1Index}
                onPad={e => focusGrid.moveFocus(e.type, flop1Ref)}
              />
            </FieldControl>
          </FieldRow>
        )}
        {enable2nd525 && flop1List.length > 1 && (
          <FieldRow>
            <FieldLabel>5.25&quot; Drive 2</FieldLabel>
            <FieldControl>
              <DiskSelect
                selectRef={flop2Ref}
                mediaList={flop1List}
                customOptions={get525Options(values.flop1Index)}
                onChange={(value) => setValues({ ...values, flop2Index: value })}
                value={values.flop2Index}
                onPad={e => focusGrid.moveFocus(e.type, flop2Ref)}
              />
            </FieldControl>
          </FieldRow>
        )}
        {flop3List.length > 0 && (
          <FieldRow>
            <FieldLabel>3.5&quot; Drive 1</FieldLabel>
            <FieldControl>
              <DiskSelect
                selectRef={flop3Ref}
                mediaList={flop3List}
                customOptions={flop3List.length > 1 ? get35Options(values.flop4Index) : null}
                onChange={(value) => setValues({ ...values, flop3Index: value })}
                value={values.flop3Index}
                onPad={e => focusGrid.moveFocus(e.type, flop3Ref)}
              />
            </FieldControl>
          </FieldRow>
        )}
        {enable2nd35 && flop3List.length > 1 && (
          <FieldRow>
            <FieldLabel>3.5&quot; Drive 2</FieldLabel>
            <FieldControl>
              <DiskSelect
                selectRef={flop4Ref}
                mediaList={flop3List}
                customOptions={get35Options(values.flop3Index)}
                onChange={(value) => setValues({ ...values, flop4Index: value })}
                value={values.flop4Index}
                onPad={e => focusGrid.moveFocus(e.type, flop4Ref)}
              />
            </FieldControl>
          </FieldRow>
        )}
      </>
    );
  }
}
Apple2GsSessionSettingsTab.contextType = WebrcadeContext;

class Apple2GsVirtualKeyboardTab extends FieldsTab {
  constructor() {
    super();
    this.vkTransparencyRef = React.createRef();
    this.gridComps = [[this.vkTransparencyRef]];
  }

  componentDidUpdate(prevProps, prevState) {
    const { setFocusGridComps, isActive } = this.props;
    if (isActive && isActive !== prevProps.isActive) {
      setFocusGridComps(this.gridComps);
    }
  }

  render() {
    const { vkTransparencyRef } = this;
    const { focusGrid } = this.context;
    const { setValues, values } = this.props;

    return (
      <Fragment>
        <FieldRow>
          <FieldLabel>Transparency</FieldLabel>
          <FieldControl>
            <VkTransparencySelect
              selectRef={vkTransparencyRef}
              onChange={(value) => setValues({ ...values, vkTransparency: value })}
              value={values.vkTransparency}
              onPad={e => focusGrid.moveFocus(e.type, vkTransparencyRef)}
            />
          </FieldControl>
        </FieldRow>
      </Fragment>
    );
  }
}
Apple2GsVirtualKeyboardTab.contextType = WebrcadeContext;
