import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Pause, Play, BarChart3 } from 'lucide-react';
import { api } from '../api/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ChatWidgetProps {
  /** 当前任务 ID，用于自动关联 */
  taskId?: number;
}

export function ChatWidget({ taskId }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 加载历史消息
  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, taskId]);

  const loadHistory = async () => {
    try {
      const res = await api.chat.getHistory(taskId);
      if (res.history && res.history.length > 0) {
        // 类型转换
        setMessages(res.history.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.timestamp,
        })));
      } else {
        // 欢迎消息
        setMessages([
          {
            role: 'assistant',
            content: '你好！我是小研助手 🤖\n\n我可以帮你管控流水线：\n• 暂停/继续流水线\n• 查询进度\n• 审批通过/拒绝\n• 重拾步骤重新执行',
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setMessages([
        {
          role: 'assistant',
          content: '你好！我是小研助手 🤖',
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || loading) return;

    setInput('');
    setMessages(prev => [
      ...prev,
      { role: 'user', content: messageText, timestamp: new Date().toISOString() },
    ]);
    setLoading(true);

    try {
      const res = await api.chat.sendMessage(messageText, taskId);

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: res.message, timestamp: new Date().toISOString() },
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '抱歉，操作失败了。请稍后重试。',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 快捷操作
  const quickActions = [
    { label: '进度', icon: BarChart3, action: '进度怎么样' },
    { label: '暂停', icon: Pause, action: '暂停' },
    { label: '继续', icon: Play, action: '继续' },
  ];

  return (
    <>
      {/* 悬浮按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 z-50 ${
          isOpen
            ? 'bg-gray-600 hover:bg-gray-700'
            : 'bg-blue-500 hover:bg-blue-600'
        }`}
        aria-label={isOpen ? '关闭聊天' : '打开聊天'}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <MessageCircle className="w-6 h-6 text-white" />
        )}
      </button>

      {/* 聊天窗口 */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 max-w-[calc(100vw-3rem)] bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col z-50 overflow-hidden">
          {/* 头部 */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-500 to-blue-600">
            <div className="flex items-center gap-2">
              <span className="text-xl">🤖</span>
              <div>
                <h3 className="text-white font-medium text-sm">小研助手</h3>
                {taskId && (
                  <p className="text-blue-100 text-xs">任务 #{taskId}</p>
                )}
              </div>
            </div>
          </div>

          {/* 消息区域 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-80 min-h-60">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-blue-500 text-white rounded-br-sm'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-lg text-sm">
                  <span className="animate-pulse">思考中...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 快捷操作 */}
          <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex gap-2">
            {quickActions.map(({ label, icon: Icon, action }) => (
              <button
                key={action}
                onClick={() => sendMessage(action)}
                disabled={loading}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-600 dark:text-gray-400 transition-colors disabled:opacity-50"
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          {/* 输入区域 */}
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息..."
                className="flex-1 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 placeholder-gray-400"
                disabled={loading}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 rounded-lg transition-colors"
                aria-label="发送"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
