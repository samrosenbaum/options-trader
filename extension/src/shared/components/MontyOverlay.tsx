import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Minimize2, Maximize2, GripVertical, Camera } from 'lucide-react';
import type { Message, RobinhoodContext, Position } from '../types';

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

  // Get Monty avatar URL
  const montyAvatarUrl = chrome.runtime.getURL('monty-avatar.png');

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

    try {
      const response = await fetch(`${apiEndpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversation }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let buffer = '';
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          buffer += decoder.decode(value, { stream: !readerDone });
        }

        const segments = buffer.split('\n\n');
        buffer = segments.pop() ?? '';

        for (const segment of segments) {
          const line = segment.trim();
          if (!line.startsWith('data:')) continue;

          const data = line.slice(5).trim();
          if (!data) continue;

          if (data === '[DONE]') {
            done = true;
            break;
          }

          try {
            const parsed = JSON.parse(data) as { text?: string };
            if (parsed.text) {
              assistantContent += parsed.text;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, content: assistantContent, timestamp: new Date() }
                    : msg
                )
              );
            }
          } catch (error) {
            console.error('Failed to parse chunk:', error);
          }
        }
      }

      if (!assistantContent.trim()) {
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

      // Send vision request to backend
      const visionResponse = await fetch(`${apiEndpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: 'Analyze this screenshot of my Robinhood portfolio and extract all positions. Return a JSON array of positions with ticker, type (stock/option), quantity, averageCost, currentPrice, marketValue, profitLoss, and profitLossPercent. For options, include optionType (call/put), strike, and expiration. Only return the JSON, no additional text.',
            },
          ],
          screenshot,
        }),
      });

      if (!visionResponse.ok) {
        throw new Error('Failed to analyze screenshot');
      }

      if (!visionResponse.body) {
        throw new Error('No response body');
      }

      // Parse streaming response
      const reader = visionResponse.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let buffer = '';
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          buffer += decoder.decode(value, { stream: !readerDone });
        }

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
              assistantContent += parsed.text;
            }
          } catch (error) {
            console.error('Failed to parse chunk:', error);
          }
        }
      }

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
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
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
