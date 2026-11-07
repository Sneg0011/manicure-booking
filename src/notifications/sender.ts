export interface Button {
  text: string;
  callbackData?: string;
  url?: string;
}
export interface MessageSender {
  send(chatId: string, text: string, buttons?: Button[][]): Promise<void>;
}
