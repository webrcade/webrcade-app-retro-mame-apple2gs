import React from 'react';

import { Select } from '@webrcade/app-common';

export function DiskSelect(props) {
  const { onPad, value, onChange, selectRef, mediaList, customOptions } = props;

  let opts;
  if (customOptions) {
    // Use custom options (with mutual exclusion)
    opts = customOptions;
  } else {
    // Build default options (no "(none)" option, just disk list)
    opts = [];
    for (let i = 0; i < mediaList.length; i++) {
      opts.push({ value: i, label: (i + 1) + ": " + mediaList[i].shortName });
    }
  }

  return (
    <Select
      width={"16rem"}
      ref={selectRef}
      options={opts}
      onChange={value => onChange(value)}
      value={value}
      onPad={e => onPad(e)}
    />
  )
}
