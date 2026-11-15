import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, MessageSquare, RotateCcw, Send, X } from 'lucide-react';
import { api } from '../api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

const STARTER_PROMPTS = [
  'What are all membership packages & PKR prices?',
  'What are the Ladies-Only hours and weekly classes?',
  'How do JazzCash/EasyPaisa payments & biometric check-in work?',
  'Is FitBase open on Friday?',
];

const INITIAL_WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'model',
  text: 'Welcome to FitBase Fitness Center (Green Avenue, Faisalabad). Ask me anything about our 5 membership packages, Summer Co-Ed & Ladies-Only timings, twice-daily female classes, JazzCash/EasyPaisa/Bank transfers, or biometric fingerprint check-in policies.',
};

function renderFormattedReply(text: string) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const clean = trimmed.replace(/\*\*(.*?)\*\*/g, '$1');
        if (clean.startsWith('- ') || clean.startsWith('* ') || clean.startsWith('• ')) {
          return (
            <div key={i} className="flex items-start gap-2 pl-1">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
              <span>{clean.slice(2)}</span>
            </div>
          );
        }
        return <p key={i}>{clean}</p>;
      })}
    </div>
  );
}

export function useFitBaseChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_WELCOME]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = async (rawText?: string) => {
    const text = (rawText ?? input).trim();
    if (!text || busy) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      text,
    };

    const historyPayload = messages
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMsg]);
    if (!rawText) setInput('');
    setBusy(true);
    setError(null);

    try {
      const res = await api.chatWithFitBase({
        message: text,
        history: historyPayload,
      });

      const modelMsg: ChatMessage = {
        id: `mod-${Date.now()}`,
        role: 'model',
        text: res.reply,
      };
      setMessages((prev) => [...prev, modelMsg]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach FitBase AI Concierge.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const resetChat = () => {
    setMessages([INITIAL_WELCOME]);
    setError(null);
    setInput('');
  };

  return { messages, input, setInput, busy, error, sendMessage, resetChat };
}

interface FitBaseChatPanelProps {
  messages: ChatMessage[];
  input: string;
  onChangeInput: (val: string) => void;
  busy: boolean;
  error: string | null;
  onSend: (rawText?: string) => Promise<void>;
  onReset: () => void;
  compact?: boolean;
}

export function FitBaseChatPanel({
  messages,
  input,
  onChangeInput,
  busy,
  error,
  onSend,
  onReset,
  compact = false,
}: FitBaseChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void onSend();
  };

  return (
    <div className="flex flex-col rounded-xl border border-zinc-800 bg-[#111114] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/80 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-500/40 bg-red-600/15 text-red-400">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">FitBase AI Concierge</p>
            <p className="text-[11px] text-zinc-400">
              Trained on all packages, timings, female classes &amp; biometric rules
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onReset}
          title="Start new conversation"
          className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Reset</span>
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className={`flex-1 space-y-3.5 overflow-y-auto px-5 py-4 ${
          compact ? 'h-72' : 'h-80 sm:h-96'
        }`}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs ${
                msg.role === 'user'
                  ? 'bg-red-600 text-white font-medium'
                  : 'border border-zinc-800 bg-zinc-950 text-zinc-200'
              }`}
            >
              {msg.role === 'model' ? renderFormattedReply(msg.text) : msg.text}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs text-zinc-400">
              Checking FitBase pricing, timings &amp; policies...
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Starter Prompt Buttons */}
      {messages.length <= 2 && (
        <div className="border-t border-zinc-800/80 bg-zinc-950/60 px-4 py-2.5">
          <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-zinc-500">
            INSTANT QUESTIONS
          </p>
          <div className="flex flex-wrap gap-1.5">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={busy}
                onClick={() => void onSend(prompt)}
                className="rounded-md border border-zinc-800 bg-[#111114] px-2.5 py-1 text-left text-[11px] text-zinc-300 transition-colors hover:border-red-500/60 hover:text-white disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-950 p-3"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => onChangeInput(e.target.value)}
          placeholder="Ask about fees, Ladies timing, Friday off, JazzCash, biometrics..."
          className="flex-1 rounded-lg border border-zinc-800 bg-[#111114] px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-red-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send question"
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50 shrink-0"
        >
          <Send className="h-3.5 w-3.5" />
          <span>Ask</span>
        </button>
      </form>
    </div>
  );
}

export function FitBaseFloatingChatbot({
  chat,
}: {
  chat: ReturnType<typeof useFitBaseChat>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <div className="w-[calc(100vw-2.5rem)] max-w-md shadow-2xl shadow-black/80">
          <div className="mb-1.5 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Minimize FitBase AI assistant"
              className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-[#111114] px-2.5 py-1 text-[11px] text-zinc-300 hover:border-zinc-700 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
              <span>Minimize</span>
            </button>
          </div>
          <FitBaseChatPanel
            messages={chat.messages}
            input={chat.input}
            onChangeInput={chat.setInput}
            busy={chat.busy}
            error={chat.error}
            onSend={chat.sendMessage}
            onReset={chat.resetChat}
            compact
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close FitBase AI Concierge' : 'Open FitBase AI Concierge'}
        className="inline-flex items-center gap-2 rounded-lg border border-red-500/60 bg-red-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-black/60 transition-colors hover:bg-red-500"
      >
        <MessageSquare className="h-4 w-4 shrink-0" />
        <span>{open ? 'Close AI Chat' : 'Ask FitBase AI'}</span>
      </button>
    </div>
  );
}
