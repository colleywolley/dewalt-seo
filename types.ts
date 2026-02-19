
export interface Product {
  id: string;
  sku: string;
  originalDescription: string;
  generatedTitle?: string;
  generatedCopy?: string;
  generatedTags?: string;
  personaUsed?: 'Woodworker' | 'Plumber' | 'Electrician' | 'Tool Expert' | 'Heavy Civil';
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}
