'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Dialog } from './ui/dialog';
import { PinPad } from './pin-pad';
import { savePin } from '@/lib/auth';
import { useAuthStore } from '@/store/auth-store';
import { t } from '@/lib/strings';
import { toast } from './ui/toast';

export function PinSetupDialog({
  open,
  onDone
}: {
  open: boolean;
  onDone: () => void;
}) {
  const user = useAuthStore((state) => state.user);
  const device = useAuthStore((state) => state.device);
  const [stage, setStage] = useState<'create' | 'confirm'>('create');
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const handlePin = async (pin: string) => {
    setError(null);
    if (stage === 'create') {
      setFirst(pin);
      setStage('confirm');
      setResetKey((key) => key + 1);
      return;
    }
    if (pin !== first) {
      setError(t.auth.pinMismatch);
      setStage('create');
      setFirst('');
      setResetKey((key) => key + 1);
      return;
    }
    if (!user || !device) return;
    setSaving(true);
    try {
      await savePin(user, device.id, pin);
      toast.success('PIN saved', 'You can now open your duka offline.');
      onDone();
    } catch {
      setError(t.common.somethingWrong);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      title={t.auth.setPin}
      description={t.auth.setPinSubtitle}
      size="sm"
    >
      <div className="mb-5 flex items-center gap-3 rounded-2xl bg-brand-50 p-3 text-brand-700">
        <span className="rounded-xl bg-white p-2">
          <ShieldCheck size={18} />
        </span>
        <p className="text-xs font-medium">
          {stage === 'create'
            ? 'Choose 4 digits you will remember. It never leaves this device.'
            : t.auth.confirmPin}
        </p>
      </div>
      <PinPad
        keyReset={resetKey}
        busy={saving}
        onComplete={(pin) => {
          void handlePin(pin);
        }}
      />
      {error && (
        <p className="mt-4 text-center text-sm font-medium text-berry animate-fade-in">{error}</p>
      )}
      <p className="mt-6 text-center text-[11px] text-muted">
        Your PIN protects offline sales on this device. It is separate from your password.
      </p>
    </Dialog>
  );
}
