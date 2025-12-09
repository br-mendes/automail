
export interface Client {
  id: string;
  sigla: string; // Ex: JFAL (Used for matching)
  name: string; // Ex: Justiça Federal de Alagoas (Used for Email Body)
  email: string; // To recipients
}

export interface Recipient extends Client {
  status: 'pending' | 'file_found' | 'ready' | 'sent';
  matchedFileName?: string;
  matchedTime?: Date; // Timestamp when the file was identified
  emailSubject?: string;
  emailBody?: string; // Plain text for mailto
  emailBodyHtml?: string; // HTML structure with signature embed
  agency: string; // Kept for compatibility, maps to sigla or name depending on usage
}

export interface FileEntry {
  name: string;
  handle: FileSystemFileHandle | File; // Support standard File object for fallback
}

export enum AppState {
  HOME = 'HOME',
  MANAGE_CLIENTS = 'MANAGE_CLIENTS',
  SELECT_FOLDER = 'SELECT_FOLDER',
  DASHBOARD = 'DASHBOARD'
}

export interface EmailGenerationResponse {
  subject: string;
  body: string;
  bodyHtml: string;
}

export type AutoScanMode = 'disabled' | 'interval' | 'fixed';

export interface AutoScanConfig {
  mode: AutoScanMode;
  intervalMinutes: number; // Used if mode is 'interval'
}

export interface SentLog {
  id: string;
  timestamp: Date;
  recipientSigla: string;
  recipientEmail: string;
  subject: string;
}

export type DashboardTab = 'all' | 'pending' | 'ready' | 'sent' | 'history';
