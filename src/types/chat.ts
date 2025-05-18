export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
}

export interface ChatState {
  messages: Message[];
  isTyping: boolean;
  error: string | null;
} 