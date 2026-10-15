export type MessageSender = 'user' | 'assistant' | 'system';
export type MessageType = 'text' | 'proposal' | 'milestone' | 'welcome' | 'organize';

export interface ProposalData {
  summary: string;
  instruction: string;
  changes: string[];
  revision: string;
  specSnapshot: string;
  selectionSnapshot: string;
  targetPartId?: string;
  locationAssetId?: string;
  locationPointSnapshot?: string;
  applied?: boolean;
  jobId?: string;
  jobStatus?: string;
  jobMessage?: string;
  appliedRevisionId?: string | null;
}

export interface MilestoneData {
  revisionNumber: number;
  reason: string;
  time: string;
}

export interface OrganizeData {
  prompt: string;
  template: string;
  height_mm?: number;
  width_mm?: number;
  depth_mm?: number;
  thickness_mm?: number;
  base?: boolean;
  hole?: boolean;
  assumptions: string[];
  specSnapshot?: string;
  applied?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  type: MessageType;
  content?: string;
  mode?: 'tune' | 'prompt';
  timestamp: number;
  locationImageId?: string;
  locationPoint?: [number, number];
  proposal?: ProposalData;
  milestone?: MilestoneData;
  organize?: OrganizeData;
  assumptions?: string[];
}
