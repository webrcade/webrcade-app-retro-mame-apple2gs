import React from 'react';

import { Select } from '@webrcade/app-common';
import { VK_TRANSPARENCY } from '../emulator/prefs';

export function VkTransparencySelect(props) {
  const { onPad, value, onChange, selectRef } = props;

  const opts = [];
  opts.push({ value: VK_TRANSPARENCY.LOW, label: "Low" });
  opts.push({ value: VK_TRANSPARENCY.HIGH, label: "High" });

  return (
    <Select
      ref={selectRef}
      options={opts}
      onChange={value => onChange(value)}
      value={value}
      onPad={e => onPad(e)}
    />
  )
}
