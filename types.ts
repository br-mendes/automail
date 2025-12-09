
export interface Client {
  id: string;
  sigla: string; // Ex: JFAL (Used for matching)
  name: string; // Ex: Justiça Federal de Alagoas (Used for Email Body)
  email: string; // To recipients
}

export interface Recipient extends Client {
  status: 'pending' | 'file_found' | 'ready' | 'sent';
  matchedFileName?: string;
  emailSubject?: string;
  emailBody?: string;
  agency: string; // Kept for compatibility, maps to sigla or name depending on usage
}

export interface FileEntry {
  name: string;
  handle: FileSystemFileHandle;
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
}

export type AutoScanMode = 'disabled' | 'interval' | 'fixed';

export interface AutoScanConfig {
  mode: AutoScanMode;
  intervalMinutes: number; // Used if mode is 'interval'
}
