import { useEffect, useRef, useState } from 'react';
import { PRESENCE_PALETTE } from '@syncflow/shared';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { uploadImage } from '@/features/canvas/api/upload-image';
import { useAuth } from '../auth-context';
import * as authApi from '../api/auth-api';

interface Props {
  onClose: () => void;
}

export function ProfileModal({ onClose }: Props): JSX.Element {
  const { user, updateUser } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [color, setColor] = useState(user?.color ?? PRESENCE_PALETTE[0]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape, and lock background scroll while the modal is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { assetUrl } = await uploadImage(file);
      setAvatarUrl(assetUrl);
    } catch {
      setError('Failed to upload image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAvatar = (): void => {
    setAvatarUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async (): Promise<void> => {
    if (!displayName.trim()) {
      setError('Display name cannot be empty.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await authApi.updateProfile({
        displayName: displayName.trim(),
        color,
        avatarUrl,
      });
      updateUser(updated);
      onClose();
    } catch {
      setError('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const initial = (user?.displayName ?? 'U').charAt(0).toUpperCase();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit profile"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40"
    >
      <div
        className="flex min-h-full items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-md rounded-xl border border-line bg-raised p-6 shadow-lg dark:border-line-dark dark:bg-raised-dark">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink dark:text-ink-dark">
            Edit Profile
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark"
          >
            ✕
          </button>
        </div>

        {/* Avatar section */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <div
            className="h-20 w-20 overflow-hidden rounded-full border-2 border-line dark:border-line-dark"
            style={avatarUrl ? undefined : { backgroundColor: color }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Profile avatar"
                className="h-full w-full object-cover"
                crossOrigin="anonymous"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-2xl font-semibold text-white">
                {initial}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="text-xs"
            >
              {uploading ? 'Uploading…' : 'Change image'}
            </Button>
            {avatarUrl && (
              <Button
                type="button"
                variant="ghost"
                disabled={uploading}
                onClick={handleRemoveAvatar}
                className="text-xs text-danger"
              >
                Remove
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Upload profile image"
            onChange={(e) => void handleAvatarChange(e)}
          />
        </div>

        {/* Display name */}
        <div className="mb-4">
          <TextField
            label="Display name"
            name="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={60}
            placeholder="Your name"
          />
        </div>

        {/* Color picker */}
        <div className="mb-6">
          <p className="mb-2 block text-sm font-medium text-ink-600 dark:text-ink-400">Presence color</p>
          <div className="flex flex-wrap gap-2">
            {PRESENCE_PALETTE.map((swatch) => (
              <button
                key={swatch}
                type="button"
                title={swatch}
                aria-label={`Select color ${swatch}`}
                aria-pressed={color === swatch}
                onClick={() => setColor(swatch)}
                className="h-7 w-7 rounded-full border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                style={{
                  backgroundColor: swatch,
                  borderColor: color === swatch ? '#fff' : 'transparent',
                  boxShadow: color === swatch ? `0 0 0 2px ${swatch}` : undefined,
                }}
              />
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-md bg-danger/10 p-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving || uploading}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || uploading || !displayName.trim()}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
        </div>
      </div>
    </div>
  );
}
