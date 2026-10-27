import type { Permissions } from './permissions';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: 'owner' | 'employee';
  permissions: Permissions;
  isActive: boolean;
  mustChangePassword: boolean;
  deviceId: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthDevice {
  id: string;
  receiptPrefix: string;
  name: string;
  userId: string | null;
  lastReceiptSeq: number;
}

declare global {
  namespace Express {
    interface Request {
      auth?: {
        user: AuthUser;
        device: AuthDevice | null;
      };
    }
  }
}

export {};
