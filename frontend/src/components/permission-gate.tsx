'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import type { PermissionFlag } from '@/lib/types';
import { can } from '@/lib/permissions';
import { Splash } from './splash';

export function PermissionGate({
  flag,
  anyOf,
  ownerOnly = false,
  children
}: {
  flag?: PermissionFlag;
  anyOf?: PermissionFlag[];
  ownerOnly?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const allowed = Boolean(
    user &&
      (ownerOnly
        ? user.role === 'owner'
        : flag
          ? can(user, flag)
          : anyOf
            ? anyOf.some((entry) => can(user, entry))
            : true)
  );

  useEffect(() => {
    if (user && !allowed) router.replace(flag === 'sales.make' ? '/more/profile' : '/pos');
  }, [allowed, router, user, flag]);

  if (!allowed) return <Splash label="Checking permissions…" />;
  return <>{children}</>;
}
