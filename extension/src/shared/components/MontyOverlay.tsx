import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Minimize2, Maximize2, GripVertical, Camera, Trash2 } from 'lucide-react';
import type {
  Message,
  RobinhoodContext,
  Position,
  CatalystSummaryPayload,
} from '../types';

interface MontyFetchResponse<T = unknown> {
  success: boolean;
  status: number;
  data?: T;
  error?: string;
}

interface MontyStreamAck {
  success: boolean;
  status?: number;
  error?: string;
}

function sendRuntimeMessage<TMessage, TResponse>(message: TMessage): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        resolve(response as TResponse);
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function performBackgroundFetch<T = unknown>(
  url: string,
  options: RequestInit = {},
  responseType: 'json' | 'text' = 'json',
): Promise<MontyFetchResponse<T>> {
  const response = await sendRuntimeMessage<
    {
      type: 'MONTY_FETCH';
      url: string;
      fetchOptions?: RequestInit;
      responseType?: 'json' | 'text';
    },
    MontyFetchResponse<T>
  >({
    type: 'MONTY_FETCH',
    url,
    fetchOptions: options,
    responseType,
  });

  if (!response?.success) {
    throw new Error(response?.error || `Request failed with status ${response?.status ?? 'unknown'}`);
  }

  return response;
}

async function streamMontyApi({
  url,
  options,
  onText,
}: {
  url: string;
  options: RequestInit;
  onText?: (textChunk: string) => void;
}): Promise<string> {
  const requestId = crypto.randomUUID();
  let cleanupListener: () => void = () => {};
  let aggregated = '';
  let buffer = '';

  const streamPromise = new Promise<string>((resolve, reject) => {
    const handleMessage = (message: {
      type: string;
      requestId?: string;
      chunk?: string;
      error?: string;
    }) => {
      if (message?.requestId !== requestId) {
        return;
      }

      if (message.type === 'MONTY_STREAM_CHUNK' && typeof message.chunk === 'string') {
        buffer += message.chunk;
        const segments = buffer.split('\n\n');
        buffer = segments.pop() ?? '';

        for (const segment of segments) {
          const line = segment.trim();
          if (!line.startsWith('data:')) continue;

          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data) as { text?: string };
            if (parsed.text) {
              aggregated += parsed.text;
              onText?.(parsed.text);
            }
          } catch (error) {
            console.error('[Monty] Failed to parse stream chunk:', error);
          }
        }
      } else if (message.type === 'MONTY_STREAM_COMPLETE') {
        cleanupListener();
        resolve(aggregated);
      } else if (message.type === 'MONTY_STREAM_ERROR') {
        cleanupListener();
        reject(new Error(message.error || 'Stream failed'));
      }
    };

    cleanupListener = () => chrome.runtime.onMessage.removeListener(handleMessage);
    chrome.runtime.onMessage.addListener(handleMessage);
  });

  try {
    const ack = await sendRuntimeMessage<
      {
        type: 'MONTY_STREAM_REQUEST';
        requestId: string;
        url: string;
        fetchOptions?: RequestInit;
      },
      MontyStreamAck
    >({
      type: 'MONTY_STREAM_REQUEST',
      requestId,
      url,
      fetchOptions: options,
    });

    if (!ack?.success) {
      cleanupListener();
      throw new Error(ack?.error || `Request failed with status ${ack?.status ?? 'unknown'}`);
    }

    return await streamPromise;
  } catch (error) {
    cleanupListener();
    throw error instanceof Error ? error : new Error(String(error));
  }
}

interface MontyOverlayProps {
  apiEndpoint: string; // e.g., 'http://localhost:3000' or your deployed URL
  robinhoodContext?: RobinhoodContext;
}

export function MontyOverlay({ apiEndpoint, robinhoodContext }: MontyOverlayProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [isCapturingPositions, setIsCapturingPositions] = useState(false);
  const [detectedPositions, setDetectedPositions] = useState<Position[]>([]);
  const [catalystSummary, setCatalystSummary] = useState<CatalystSummaryPayload | null>(null);
  const [isCatalystLoading, setIsCatalystLoading] = useState(false);
  const [catalystError, setCatalystError] = useState<string | null>(null);

  // Get Monty avatar URL
  const montyAvatarUrl = chrome.runtime.getURL('monty-avatar.png');

  const formatCatalystDate = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatCatalystTiming = (value?: number | null) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return null;
    const rounded = Math.round(value);
    if (value >= 0) {
      if (rounded === 0) return 'Today';
      if (rounded === 1) return 'Tomorrow';
      return `In ${rounded} days`;
    }
    const absRounded = Math.abs(rounded);
    if (absRounded === 1) return '1 day ago';
    return `${absRounded} days ago`;
  };

  // Dragging state
  const [position, setPosition] = useState({ x: window.innerWidth - 450, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(messages.length);

  // Load messages and positions from storage on mount
  useEffect(() => {
    chrome.storage.local.get(['monty_messages', 'monty_positions'], (result) => {
      if (result.monty_messages) {
        setMessages(result.monty_messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        })));
      }
      if (result.monty_positions) {
        setDetectedPositions(result.monty_positions);
      }
    });
  }, []);

  // Save messages to storage
  useEffect(() => {
    if (messages.length > 0) {
      chrome.storage.local.set({ monty_messages: messages });
    }
  }, [messages]);

  // Detect new messages
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current && !isOpen) {
      setHasNewMessage(true);
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role === 'assistant') {
        setIsOpen(true);
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, isOpen]);

  // Clear notification when opened
  useEffect(() => {
    if (isOpen) {
      setHasNewMessage(false);
    }
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isMinimized]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch catalyst summary when ticker changes
  useEffect(() => {
    const symbol = robinhoodContext?.ticker?.trim().toUpperCase();

    if (!symbol) {
      setCatalystSummary(null);
      setCatalystError(null);
      setIsCatalystLoading(false);
      return undefined;
    }

    let cancelled = false;

    const loadSummary = async () => {
      setIsCatalystLoading(true);
      setCatalystError(null);

      try {
        const response = await performBackgroundFetch<{
          summaries?: Record<string, CatalystSummaryPayload | null>;
        }>(
          `${apiEndpoint}/api/catalyst-summary?symbol=${encodeURIComponent(symbol)}`,
          { method: 'GET' },
          'json',
        );

        if (cancelled) return;

        const payload = response.data;
        const summary: CatalystSummaryPayload | null = payload?.summaries?.[symbol] ?? null;
        setCatalystSummary(summary ?? null);
        setCatalystError(summary?.error ?? null);
      } catch (error) {
        if (cancelled) return;
        setCatalystSummary(null);
        setCatalystError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setIsCatalystLoading(false);
        }
      }
    };

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [apiEndpoint, robinhoodContext?.ticker]);

  // Handle dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (overlayRef.current) {
      const rect = overlayRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setIsDragging(true);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: Math.max(0, Math.min(window.innerWidth - 400, e.clientX - dragOffset.x)),
          y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y)),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    const assistantId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const assistantPlaceholder: Message = {
      id: assistantId,
      role: 'assistant',
      content: '...',
      timestamp: new Date(),
    };

    const conversation = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userMessage.content },
    ];

    // Add Robinhood context and positions to the first message
    if (conversation.length === 1) {
      let contextParts: string[] = [];

      if (robinhoodContext?.ticker) {
        contextParts.push(`I'm looking at ${robinhoodContext.ticker} on Robinhood.`);
        if (robinhoodContext.currentPrice) {
          contextParts.push(`Current price: $${robinhoodContext.currentPrice}.`);
        }
        if (robinhoodContext.optionData) {
          contextParts.push(
            `Option: ${robinhoodContext.optionData.type} $${robinhoodContext.optionData.strike} exp ${robinhoodContext.optionData.expiration}.`
          );
        }
      }

      if (detectedPositions.length > 0) {
        const positionSummary = detectedPositions
          .map((p) => {
            const pl = p.profitLoss ? ` (P/L: $${p.profitLoss.toFixed(2)})` : '';
            if (p.type === 'option' && p.optionType) {
              return `${p.ticker} ${p.optionType} $${p.strike} exp ${p.expiration} x${p.quantity}${pl}`;
            }
            return `${p.ticker} x${p.quantity}${pl}`;
          })
          .join(', ');
        contextParts.push(`\n\nMy positions: ${positionSummary}`);
      }

      if (contextParts.length > 0) {
        conversation[0].content = `Context: ${contextParts.join(' ')}\n\nQuestion: ${conversation[0].content}`;
      }
    }

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setInput('');
    setIsLoading(true);

    let assistantContent = '';

    try {
      const finalContent = await streamMontyApi({
        url: `${apiEndpoint}/api/chat`,
        options: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: conversation }),
        },
        onText: (textChunk) => {
          assistantContent += textChunk;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: assistantContent, timestamp: new Date() }
                : msg
            )
          );
        },
      });

      if (!finalContent.trim()) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: 'I apologize, I had trouble processing that. Could you try asking in a different way?',
                  timestamp: new Date(),
                }
              : msg
          )
        );
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content: 'Sorry, I encountered an error. Please try again.',
                timestamp: new Date(),
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDetectPositions = async () => {
    if (isCapturingPositions || isLoading) return;

    setIsCapturingPositions(true);

    try {
      // Request screenshot from background script
      const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' });

      if (!response.success || !response.screenshot) {
        throw new Error(response.error || 'Failed to capture screenshot');
      }

      const screenshot = response.screenshot;

      // Send vision request to backend through background proxy
      const assistantContent = await streamMontyApi({
        url: `${apiEndpoint}/api/chat`,
        options: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                role: 'user',
                content:
                  'Analyze this screenshot of my Robinhood portfolio and extract all positions. Return a JSON array of positions with ticker, type (stock/option), quantity, averageCost, currentPrice, marketValue, profitLoss, and profitLossPercent. For options, include optionType (call/put), strike, and expiration. Only return the JSON, no additional text.',
              },
            ],
            screenshot,
          }),
        },
      });

      // Parse positions from response
      try {
        // Try to extract JSON from the response (might have markdown formatting)
        const jsonMatch = assistantContent.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const positions = JSON.parse(jsonMatch[0]) as Position[];
          setDetectedPositions(positions);

          // Store positions in chrome storage
          chrome.storage.local.set({ monty_positions: positions });

          // Add a system message showing detected positions
          const positionSummary = positions
            .map((p) => `${p.ticker} (${p.quantity} ${p.type})`)
            .join(', ');

          const systemMessage: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: `✅ Detected ${positions.length} position${positions.length !== 1 ? 's' : ''}: ${positionSummary}\n\nI can now help you analyze these positions. What would you like to know?`,
            timestamp: new Date(),
            screenshot,
          };

          setMessages((prev) => [...prev, systemMessage]);
        } else {
          throw new Error('No valid JSON found in response');
        }
      } catch (parseError) {
        console.error('Failed to parse positions:', parseError);
        const errorMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `I captured the screenshot but had trouble parsing the positions. Here's what I saw:\n\n${assistantContent.slice(0, 500)}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Position detection error:', error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Sorry, I encountered an error detecting your positions: ${error instanceof Error ? error.message : 'Unknown error'}. Please make sure you're on your Robinhood portfolio page.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsCapturingPositions(false);
    }
  };

  const handleClearHistory = () => {
    if (window.confirm('Are you sure you want to clear all chat history? This cannot be undone.')) {
      // Clear messages from state
      setMessages([]);
      // Clear detected positions
      setDetectedPositions([]);
      // Clear from chrome storage
      chrome.storage.local.remove(['monty_messages', 'monty_positions'], () => {
        console.log('[Monty] Chat history and positions cleared');
      });
    }
  };

  return (
    <div style={{ position: 'fixed', zIndex: 2147483647 }}>
      {/* Floating button */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 260, damping: 20 }}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'white',
          boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          zIndex: 2147483647,
        }}
      >
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {isOpen ? (
            <X size={24} style={{ color: '#10b981' }} />
          ) : (
            <img
              src={montyAvatarUrl}
              alt="Monty"
              style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover' }}
            />
          )}
        </motion.div>

        {/* Pulse animation */}
        {!isOpen && (
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: '#10b981',
            }}
          />
        )}

        {/* Notification badge */}
        {hasNewMessage && !isOpen && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: '#ef4444',
              color: 'white',
              fontSize: '12px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
          >
            !
          </motion.div>
        )}
      </motion.button>

      {/* Chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={overlayRef}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{
              position: 'fixed',
              left: `${position.x}px`,
              top: `${position.y}px`,
              width: '400px',
              height: isMinimized ? 'auto' : '600px',
              maxWidth: 'calc(100vw - 48px)',
              maxHeight: 'calc(100vh - 48px)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderRadius: '24px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(40px) saturate(180%)',
              zIndex: 2147483646,
            }}
          >
            {/* Header */}
            <div
              onMouseDown={handleMouseDown}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
                padding: '16px 24px',
                background: 'rgba(255, 255, 255, 0.5)',
                cursor: isDragging ? 'grabbing' : 'grab',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <GripVertical size={16} style={{ color: '#94a3b8' }} />
                <img
                  src={montyAvatarUrl}
                  alt="Monty"
                  style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Monty</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Options Assistant</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDetectPositions(); }}
                  disabled={isCapturingPositions}
                  title="Detect positions from screenshot"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: isCapturingPositions ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    cursor: isCapturingPositions ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#10b981',
                  }}
                >
                  <Camera size={16} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleClearHistory(); }}
                  disabled={messages.length === 0}
                  title="Clear chat history"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: messages.length === 0 ? 'rgba(255, 255, 255, 0.3)' : 'rgba(239, 68, 68, 0.1)',
                    border: messages.length === 0 ? 'none' : '1px solid rgba(239, 68, 68, 0.3)',
                    cursor: messages.length === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: messages.length === 0 ? '#94a3b8' : '#ef4444',
                    opacity: messages.length === 0 ? 0.5 : 1,
                  }}
                >
                  <Trash2 size={16} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.5)',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748b',
                  }}
                >
                  {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.5)',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748b',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {robinhoodContext?.ticker && (
                    <div
                      style={{
                        borderRadius: '16px',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.05))',
                        padding: '12px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#047857' }}>
                          Catalysts for {robinhoodContext.ticker.toUpperCase()}
                        </span>
                        {isCatalystLoading && (
                          <span style={{ fontSize: '11px', color: '#10b981' }}>Loading…</span>
                        )}
                      </div>
                      {catalystError ? (
                        <div style={{ fontSize: '12px', color: '#b91c1c' }}>{catalystError}</div>
                      ) : (
                        <>
                          {catalystSummary?.events?.length ? (
                            <ul
                              style={{
                                listStyle: 'none',
                                margin: 0,
                                padding: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                              }}
                            >
                              {catalystSummary.events.slice(0, 3).map((event, index) => (
                                <li
                                  key={`catalyst-${index}`}
                                  style={{
                                    fontSize: '12px',
                                    color: '#065f46',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                  }}
                                >
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600 }}>{event.name}</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '2px 0' }}>
                                      {event.type && (
                                        <span
                                          style={{
                                            padding: '2px 6px',
                                            borderRadius: '9999px',
                                            background: 'rgba(129, 140, 248, 0.12)',
                                            color: '#3730a3',
                                            fontSize: '10px',
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.04em',
                                          }}
                                        >
                                          {event.type}
                                        </span>
                                      )}
                                      {event.approximate && (
                                        <span
                                          style={{
                                            padding: '2px 6px',
                                            borderRadius: '9999px',
                                            background: 'rgba(251, 191, 36, 0.18)',
                                            color: '#b45309',
                                            fontSize: '10px',
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.04em',
                                          }}
                                        >
                                          Estimated
                                        </span>
                                      )}
                                      {event.impact && (
                                        <span style={{ fontSize: '10px', color: '#0f766e', fontWeight: 600 }}>
                                          Impact: {event.impact}
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#0f766e' }}>
                                      {formatCatalystTiming(event.days_until) ??
                                        formatCatalystDate(event.date) ??
                                        'Timing TBA'}
                                    </div>
                                    {event.description && (
                                      <div style={{ fontSize: '11px', color: '#0f172a', marginTop: '2px' }}>
                                        {event.description}
                                      </div>
                                    )}
                                  </div>
                                  {formatCatalystDate(event.date) && (
                                    <span style={{ fontSize: '11px', color: '#047857' }}>
                                      {formatCatalystDate(event.date)}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p style={{ fontSize: '12px', color: '#047857', margin: 0 }}>
                              {isCatalystLoading
                                ? 'Scanning event calendar...'
                                : 'No scheduled catalysts detected yet. Watch for fresh headlines.'}
                            </p>
                          )}

                          {catalystSummary?.technical &&
                            catalystSummary.technical.commentary &&
                            catalystSummary.technical.commentary.length > 0 && (
                              <div
                                style={{
                                  marginTop: '4px',
                                  padding: '10px',
                                  borderRadius: '12px',
                                  background: 'rgba(15, 23, 42, 0.08)',
                                }}
                              >
                                <div style={{ fontSize: '11px', fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>
                                  Technical notes
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '16px', color: '#1f2937', fontSize: '12px' }}>
                                  {catalystSummary.technical.commentary.slice(0, 2).map((note, idx) => (
                                    <li key={`tech-note-${idx}`}>{note}</li>
                                  ))}
                                </ul>
                                <div
                                  style={{
                                    marginTop: '6px',
                                    fontSize: '11px',
                                    color: '#1e293b',
                                    display: 'flex',
                                    gap: '12px',
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  {typeof catalystSummary.technical.support === 'number' && (
                                    <span>Support: ${catalystSummary.technical.support.toFixed(2)}</span>
                                  )}
                                  {typeof catalystSummary.technical.resistance === 'number' && (
                                    <span>Resistance: ${catalystSummary.technical.resistance.toFixed(2)}</span>
                                  )}
                                </div>
                              </div>
                            )}
                        </>
                      )}
                    </div>
                  )}

                  {messages.length === 0 ? (
                    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
                          <img
                            src={montyAvatarUrl}
                            alt="Monty"
                            style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover' }}
                          />
                        </div>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Hey! I'm Monty</p>
                        <p style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                          I can see you're on Robinhood! Ask me about the stock or option you're viewing.
                        </p>
                        {robinhoodContext?.ticker && (
                          <p style={{ marginTop: '8px', fontSize: '12px', color: '#10b981', fontWeight: 600 }}>
                            Detected: {robinhoodContext.ticker}
                          </p>
                        )}
                        <button
                          onClick={handleDetectPositions}
                          disabled={isCapturingPositions}
                          style={{
                            marginTop: '16px',
                            padding: '10px 20px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: 'white',
                            border: 'none',
                            cursor: isCapturingPositions ? 'not-allowed' : 'pointer',
                            fontSize: '13px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                            opacity: isCapturingPositions ? 0.6 : 1,
                          }}
                        >
                          <Camera size={16} />
                          {isCapturingPositions ? 'Detecting...' : '📸 Detect My Positions'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {messages.map((message) => (
                        <motion.div
                          key={message.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          style={{ display: 'flex', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start' }}
                        >
                          <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {message.role === 'assistant' && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '4px' }}>
                                <img
                                  src={montyAvatarUrl}
                                  alt="Monty"
                                  style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                                />
                                <span style={{ fontSize: '12px', color: '#64748b' }}>Monty</span>
                              </div>
                            )}
                            <div
                              style={{
                                borderRadius: '18px',
                                padding: '12px 16px',
                                boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
                                background: message.role === 'user'
                                  ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                                  : 'rgba(255, 255, 255, 0.6)',
                                color: message.role === 'user' ? 'white' : '#0f172a',
                                border: message.role === 'assistant' ? '1px solid rgba(255, 255, 255, 0.4)' : 'none',
                              }}
                            >
                              <p style={{ fontSize: '15px', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>{message.content}</p>
                            </div>
                            <span style={{ paddingLeft: '4px', fontSize: '10px', color: '#94a3b8' }}>
                              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </motion.div>
                      ))}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>

                {/* Input */}
                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.2)', padding: '16px', background: 'rgba(255, 255, 255, 0.5)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Ask Monty anything..."
                      disabled={isLoading}
                      style={{
                        flex: 1,
                        borderRadius: '16px',
                        border: '1px solid rgba(255, 255, 255, 0.4)',
                        background: 'rgba(255, 255, 255, 0.6)',
                        padding: '12px 16px',
                        fontSize: '14px',
                        color: '#0f172a',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={handleDetectPositions}
                      disabled={isCapturingPositions || isLoading}
                      title="Capture a screenshot so Monty can detect your positions"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '0 16px',
                        height: '44px',
                        borderRadius: '16px',
                        background: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                        color: '#047857',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: isCapturingPositions || isLoading ? 'not-allowed' : 'pointer',
                        opacity: isCapturingPositions || isLoading ? 0.6 : 1,
                        boxShadow: '0 1px 2px 0 rgb(16 185 129 / 0.15)',
                        backgroundImage: isCapturingPositions
                          ? 'linear-gradient(135deg, rgba(16,185,129,0.25) 0%, rgba(5,150,105,0.25) 100%)'
                          : 'linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(5,150,105,0.12) 100%)',
                      }}
                    >
                      <Camera size={18} />
                      {isCapturingPositions ? 'Capturing…' : 'Capture Portfolio'}
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || isLoading}
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '16px',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: 'white',
                        border: 'none',
                        cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        opacity: input.trim() && !isLoading ? 1 : 0.5,
                      }}
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
