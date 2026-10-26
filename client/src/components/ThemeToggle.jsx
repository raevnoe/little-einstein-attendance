import { useEffect, useState } from 'react';
import { getThemeChoice, resolveTheme, setThemeChoice, subscribeTheme } from '../lib/theme.js';
import { buttonClass } from './ui/classes.js';
import { MoonIcon, SunIcon } from './ui/icons.jsx';

/**
 * Dark mode on/off for anyone, signed in or not (the app is light unless someone turns this on).
 * Saved on THIS device. Settings -> Appearance also offers "Match this device".
 * `compact` shows only the icon (with an accessible name).
 */
export default function ThemeToggle({ className = '', compact = false }) {
  const [choice, setChoice] = useState(getThemeChoice);
  useEffect(() => subscribeTheme(setChoice), []);

  const dark = resolveTheme(choice) === 'dark';
  const Icon = dark ? SunIcon : MoonIcon;
  return (
    <button
      type="button"
      onClick={() => setThemeChoice(dark ? 'light' : 'dark')}
      aria-pressed={dark}
      aria-label={compact ? 'Dark mode' : undefined}
      title={dark ? 'Dark mode is on. Switch to light mode' : 'Switch to dark mode'}
      className={buttonClass({ variant: 'secondary', size: compact ? 'icon' : 'md', className })}
    >
      <Icon className="h-4 w-4" />
      {!compact && (dark ? 'Light mode' : 'Dark mode')}
    </button>
  );
}
