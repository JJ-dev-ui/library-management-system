import { useEffect, useState } from 'react';
import { API_BASE } from '../api';
import { initials } from '../utils/format';

// Round avatar: the person's profile photo when they have one (avatarKey), otherwise their initials.
// If the photo fails to load, the initials are shown instead. size: 'sm' | 'md' | 'lg' | 'xl'
export default function Avatar({ name, avatarKey, size = 'md', gold = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatarKey]); // a new photo -> try again

  const cls = ['avatar', size !== 'md' && `avatar-${size}`, gold && 'avatar-gold'].filter(Boolean).join(' ');
  if (avatarKey && !failed) {
    return <img className={`${cls} avatar-photo`} src={`${API_BASE}/avatars/${avatarKey}`} alt="" loading="lazy" onError={() => setFailed(true)} />;
  }
  return <div className={cls} aria-hidden="true">{initials(name)}</div>;
}
