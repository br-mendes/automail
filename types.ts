
export interface Recipient {
  id: string;
  name: string;
  agency: string; // Órgão
  email: string;
  status: 'pending' | 'file_found' | 'ready' | 'sent';
  matchedFileName?: string;
  emailSubject?: string;
  emailBody?: string;
}

export interface FileEntry {
  name: string;
  handle: FileSystemFileHandle;
}

export enum AppState {
  UPLOAD_CSV = 'UPLOAD_CSV',
  SELECT_FOLDER = 'SELECT_FOLDER',
  DASHBOARD = 'DASHBOARD'
}

export interface EmailGenerationResponse {
  subject: string;
  body: string;
}

export type AutoScanMode = 'disabled' | 'interval' | 'fixed';

export interface AutoScanConfig {
  mode: AutoScanMode;
  intervalMinutes: number; // Used if mode is 'interval'
}
