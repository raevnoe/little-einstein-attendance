import { useEffect, useState } from 'react';
import { getThemeChoice, setThemeChoice, subscribeTheme } from '../../lib/theme.js';
import SoundToggle from '../SoundToggle.jsx';
import { Card, CardHeader } from '../ui/index.js';
import { FOCUS_RING } from '../ui/classes.js';
import { DeviceIcon, MoonIcon, SunIcon } from '../ui/icons.jsx';

const CHOICES = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'Match this device', icon: DeviceIcon },
];

/** Light/dark colours and notification sounds. Both are saved on THIS device only. */
export default function AppearanceSettings() {
  const [choice, setChoice] = useState(getThemeChoice);
  useEffect(() => subscribeTheme(setChoice), []);

  return (
    <Card as="section" aria-labelledby="appearance-title">
      <CardHeader titleId="appearance-title" title="Appearance and sound" subtitle="Saved on this device only." />
      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-brand-900">Colours</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {CHOICES.map(({ value, label, icon: Icon }) => {
            const selected = choice === value;
            return (
              <label
                key={value}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2 text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
                  selected ? 'border-brand-500 bg-brand-50 text-brand-900' : 'border-brand-100 bg-paper text-brand-700 hover:border-brand-200'
                }`}
              >
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={selected}
                  onChange={() => setThemeChoice(value)}
                  className={`h-4 w-4 accent-brand-600 ${FOCUS_RING}`}
                />
                <Icon className="h-5 w-5 shrink-0" />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-brand-100 pt-4">
        <div>
          <p className="text-sm font-semibold text-brand-900">Notification sounds</p>
          <p className="text-sm text-brand-500">Scan results, new dismissal requests and new notifications.</p>
        </div>
        <SoundToggle />
      </div>
    </Card>
  );
}
