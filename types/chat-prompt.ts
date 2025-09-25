// チャットプロンプト関連の型定義
export interface ChatPromptData {
  aiName: string;
  description: string;
  starterMessage: string;
  systemInstruction: string;
  knowledgeBase: string;
}

export interface ChatPromptPreset {
  id: string;
  name: string;
  data: ChatPromptData;
  createdAt: Date;
}

export interface ChatPromptState {
  currentData: ChatPromptData;
  presets: ChatPromptPreset[];
  selectedPresetId: string | null;
  isModified: boolean;
}