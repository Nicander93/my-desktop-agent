import { Header } from '../layout/Header';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { useAgent } from '@/hooks/useAgent';

export function ChatPanel() {
  const { sendMessage } = useAgent();

  return (
    <div className="flex flex-col h-full">
      <Header title="Desktop Agent" />
      <MessageList />
      <ChatInput onSend={sendMessage} />
    </div>
  );
}