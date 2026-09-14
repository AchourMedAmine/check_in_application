// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Participant Types
export interface Participant {
  id: string;
  qrCode: string;
  name: string | null;
  email: string | null;
  scannedAt: Date;
  updatedAt: Date;
}

export interface ScanQRInput {
  qrCode: string;
}
