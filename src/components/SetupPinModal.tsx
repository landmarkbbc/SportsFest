import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { hashPin } from '../utils/crypto';

interface SetupPinModalProps {
  open: boolean;
  onSave: (adminPinHash: string, scorerPinHash: string) => Promise<void>;
}

export function SetupPinModal({ open, onSave }: SetupPinModalProps) {
  const [adminPin, setAdminPin] = useState('');
  const [scorerPin, setScorerPin] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanAdmin = adminPin.trim();
    const cleanScorer = scorerPin.trim();

    if (cleanAdmin.length < 4) {
      setError('Admin PIN must be at least 4 characters.');
      return;
    }
    if (cleanScorer.length < 4) {
      setError('Scorer PIN must be at least 4 characters.');
      return;
    }
    if (cleanAdmin === cleanScorer) {
      setError('Admin PIN and Scorer PIN must be different.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      const [adminHash, scorerHash] = await Promise.all([
        hashPin(cleanAdmin),
        hashPin(cleanScorer),
      ]);
      await onSave(adminHash, scorerHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save PINs.');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-pin-title"
    >
      <div className="bg-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-edge p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-nested border border-edge flex items-center justify-center shrink-0">
            <ShieldCheck size={20} className="text-fg" />
          </div>
          <div>
            <h2 id="setup-pin-title" className="text-[16px] font-semibold text-fg">
              Set Up Role PINs
            </h2>
            <p className="text-xs text-fg-muted">First-launch fellowship configuration</p>
          </div>
        </div>

        <p className="text-sm text-fg-muted mb-4">
          Set an Admin PIN and a Scorer PIN for this event. Members open in read-only Viewer mode by default.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="setup-admin-pin" className="block text-sm font-medium text-fg mb-1">
              Admin PIN
            </label>
            <input
              id="setup-admin-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              placeholder="At least 4 digits"
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-nested text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-fg"
            />
          </div>

          <div>
            <label htmlFor="setup-scorer-pin" className="block text-sm font-medium text-fg mb-1">
              Scorer PIN
            </label>
            <input
              id="setup-scorer-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={scorerPin}
              onChange={(e) => setScorerPin(e.target.value)}
              placeholder="At least 4 digits"
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-nested text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-fg"
            />
          </div>

          {error && (
            <p className="text-xs font-medium text-status-red-fg bg-status-red-bg border border-status-red-edge rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[44px] px-4 py-2.5 bg-primary text-primary-fg text-sm font-medium rounded-xl hover:bg-primary-hover transition-colors duration-150 disabled:opacity-50"
          >
            {saving ? 'Initializing database...' : 'Save PINs & Seed Default Games'}
          </button>
        </form>
      </div>
    </div>
  );
}
