import { useEffect, useState } from 'react';
import { isSoundEnabled, playSound, setSoundEnabled, subscribeSound, unlockAudio } from '../lib/sounds.js';
import { buttonClass } from './ui/classes.js';
import { SpeakerIcon, SpeakerOffIcon } from './ui/icons.jsx';

/**
 * Turns notification sounds on/off on THIS device. Turning them on plays a short sample (which
 * also unlocks audio in the browser). `compact` shows only the icon (with an accessible name).
 */
export default function SoundToggle({ className = '', compact = false }) {
  const [enabled, setEnabled] = useState(isSoundEnabled);

  useEffect(() => subscribeSound(setEnabled), []);

  function toggle() {
    const next = !enabled;
    setSoundEnabled(next);
    if (next) {
      unlockAudio();
      playSound('success', { force: true });
    }
  }

  const Icon = enabled ? SpeakerIcon : SpeakerOffIcon;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={compact ? 'Notification sounds' : undefined}
      title={enabled ? 'Notification sounds are on' : 'Notification sounds are off'}
      className={buttonClass({ variant: 'secondary', size: compact ? 'icon' : 'md', className })}
    >
      <Icon className="h-4 w-4" />
      {!compact && (enabled ? 'Sound on' : 'Sound off')}
    </button>
  );
}
