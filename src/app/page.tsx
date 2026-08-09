'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, Variants } from 'framer-motion';
import { createTimeline, set as animeSet, stagger } from 'animejs';
import candidatesData from '../../candidates.json';
import styles from './page.module.css';
import TypewriterMarkdown from '@/components/TypewriterMarkdown';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type InterviewState = {
  totalQuestions: number;
  currentDay: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
};

// Framer Motion Variants
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.15 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

export default function InterviewDashboard() {
  const [sessionId, setSessionId] = useState<string>('');
  const [candidateId, setCandidateId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [interviewState, setInterviewState] = useState<InterviewState | null>(null);
  const [feedback, setFeedback] = useState<any>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCodeMode, setIsCodeMode] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Anime.js Refs
  const dashboardRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<SVGSVGElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (showFeedbackModal && feedback && dashboardRef.current) {
      // Create a timeline using Anime.js v4
      const tl = createTimeline();

      // Initial state
      animeSet(dashboardRef.current, { opacity: 0, translateY: 40 });
      if (iconRef.current) animeSet(iconRef.current, { scale: 0.5, rotate: -45, opacity: 0 });
      if (cardsRef.current.length > 0) animeSet(cardsRef.current, { opacity: 0, translateY: 20 });

      tl.add(dashboardRef.current!, {
        opacity: [0, 1],
        translateY: [40, 0],
        duration: 800,
        ease: 'outExpo'
      })
      .add(iconRef.current!, {
        opacity: [0, 1],
        scale: [0.5, 1],
        rotate: [-45, 0],
        ease: 'outElastic(1, .6)',
        duration: 1000
      }, '-=400')
      .add(cardsRef.current as HTMLElement[], {
        opacity: [0, 1],
        translateY: [20, 0],
        delay: stagger(100),
        duration: 800,
        ease: 'outExpo'
      }, '-=800');
    }
  }, [feedback]);

  const startInterview = async () => {
    if (!candidateId) {
      setError("Please select a candidate first.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setMessages([]);
    setFeedback(null);
    
    const newSessionId = crypto.randomUUID();
    setSessionId(newSessionId);
    const candidate = candidatesData.candidates.find(c => c.member.id === candidateId);
    
    try {
      const res = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: newSessionId, candidate }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start interview');
      }
      
      setMessages([{ role: 'assistant', content: data.reply }]);
      if (data.state) setInterviewState(data.state);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || !sessionId || isLoading) return;
    
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    setError(null);
    
    try {
      const res = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: userMessage }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send message');
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      if (data.state) setInterviewState(data.state);
      
      if (data.done && data.feedback) {
        setFeedback(data.feedback);
        setShowFeedbackModal(true);
      }
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedCandidate = candidatesData.candidates.find(c => c.member.id === candidateId);
  const progressPercent = interviewState ? (interviewState.totalQuestions / 8) * 100 : 0;

  return (
    <div className={styles.container}>
      {/* Header */}
      <motion.header 
        className={styles.header}
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className={styles.headerContent}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
            </div>
            <h1 className={styles.logoTitle}>AI Interviewer</h1>
          </div>
          
          <div className={styles.controls}>
            <select
              disabled={!!sessionId && interviewState?.status !== 'COMPLETED'}
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              className={styles.select}
            >
              <option value="">Select Candidate...</option>
              {candidatesData.candidates.map((c) => (
                <option key={c.member.id} value={c.member.id}>
                  {c.member.name} ({c.member.jobRole})
                </option>
              ))}
            </select>
            
            {!sessionId || interviewState?.status === 'COMPLETED' ? (
              <button
                onClick={startInterview}
                disabled={!candidateId || isLoading}
                className={styles.btnPrimary}
              >
                {isLoading ? 'Starting...' : 'Start Interview'}
              </button>
            ) : (
              <button
                onClick={() => { setSessionId(''); setMessages([]); setInterviewState(null); }}
                className={styles.btnDanger}
              >
                End Session
              </button>
            )}
          </div>
        </div>
      </motion.header>

      {/* Main Content or Hero */}
      {!sessionId ? (
        <motion.div 
          className={styles.hero}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <motion.h2 className={styles.heroTitle} initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
            Master Your Next Technical Interview
          </motion.h2>
          <motion.p className={styles.heroSubtitle} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
            Practice real-world technical challenges with an advanced AI interviewer designed to assess your skills, ask follow-up questions, and provide actionable feedback.
          </motion.p>
          <motion.div className={styles.heroGlowingBox} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}>
            <p className={styles.heroInstruction}>Ready to test your skills?</p>
            <p style={{ color: 'var(--text-muted)' }}>Use the dropdown in the top menu to select a candidate profile and start your interview session.</p>
          </motion.div>
        </motion.div>
      ) : (
      <motion.main 
        className={styles.main}
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        
        {/* Sidebar */}
        <div className={styles.sidebar}>
          <motion.div variants={itemVariants} whileHover={{ y: -5 }} className={styles.glassCard}>
            <h3 className={styles.cardTitle}>Interview Status</h3>
            
            {interviewState ? (
              <div>
                <div className={styles.progressContainer}>
                  <div className={styles.progressHeader}>
                    <span className={styles.progressLabel}>Progress</span>
                    <span className={styles.progressValue}>{interviewState.totalQuestions} / 8</span>
                  </div>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${progressPercent}%` }}></div>
                  </div>
                </div>
                
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Topic Day</span>
                  <span className={`${styles.badge} ${styles.badgeBlue}`}>
                    Day {interviewState.currentDay}
                  </span>
                </div>
                
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Status</span>
                  <span className={`${styles.badge} ${interviewState.status === 'COMPLETED' ? styles.badgeGreen : styles.badgeAmber}`}>
                    {interviewState.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            ) : (
              <div className={styles.emptyState}>No active session. Select a candidate to begin.</div>
            )}
          </motion.div>

          {selectedCandidate && (
            <motion.div variants={itemVariants} whileHover={{ y: -5 }} className={styles.glassCard}>
              <h3 className={styles.cardTitle}>Candidate Profile</h3>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Name:</span>
                <span className={styles.infoValue}>{selectedCandidate.member.name}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Role:</span>
                <span className={styles.infoValue}>{selectedCandidate.member.jobRole}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Experience:</span>
                <span className={styles.infoValue}>{selectedCandidate.member.yearsExperience} yrs</span>
              </div>
            </motion.div>
          )}
        </div>

        {/* Chat Interface */}
        <motion.div variants={itemVariants} className={styles.chatInterface}>
          
          {error && (
            <div className={styles.errorBanner}>
              {error}
            </div>
          )}

          <div className={styles.messagesArea}>
            {messages.length === 0 && !isLoading && !error && (
              <div className={styles.emptyState}>
                Start an interview to begin chatting.
              </div>
            )}
            
            {messages.map((msg, idx) => {
              const isLastMessage = idx === messages.length - 1;
              const shouldAnimate = isLastMessage && msg.role === 'assistant';

              return (
                <div key={idx} className={`${styles.messageWrapper} ${msg.role === 'user' ? styles.messageWrapperUser : styles.messageWrapperAssistant}`}>
                  <div className={`${styles.messageBubble} ${msg.role === 'user' ? styles.messageUser : styles.messageAssistant}`}>
                    {msg.role === 'user' ? (
                      <p>{msg.content}</p>
                    ) : (
                      <TypewriterMarkdown content={msg.content} animate={shouldAnimate} />
                    )}
                  </div>
                </div>
              );
            })}
            
            {isLoading && (
              <div className={`${styles.messageWrapper} ${styles.messageWrapperAssistant}`}>
                <div className={styles.loadingIndicator}>
                  <div className={styles.dot}></div>
                  <div className={styles.dot}></div>
                  <div className={styles.dot}></div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {sessionId && interviewState?.status !== 'COMPLETED' && (
            <div className={styles.inputArea}>
              <form onSubmit={sendMessage} className={styles.inputForm}>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your answer here..."
                  className={styles.inputField}
                  disabled={isLoading}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className={styles.sendBtn}
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                </button>
              </form>
            </div>
          )}
          {sessionId && interviewState?.status === 'COMPLETED' && !showFeedbackModal && (
            <div className={styles.inputArea} style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
              <button 
                className={styles.btnPrimary} 
                onClick={() => setShowFeedbackModal(true)}
              >
                View Interview Report
              </button>
            </div>
          )}
        </motion.div>
      </motion.main>
      )}

      {feedback && showFeedbackModal && (
        <div className={styles.modalOverlay}>
          <div 
            className={styles.feedbackSection}
            ref={dashboardRef}
            style={{ opacity: 0, position: 'relative' }}
          >
            <button 
              onClick={() => setShowFeedbackModal(false)}
              style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
              title="Close Report"
            >
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 className={styles.feedbackTitle}>
              <svg ref={iconRef} width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Interview Feedback Report
            </h3>
            
            <div className={styles.feedbackGrid}>
              <div className={styles.feedbackCard} ref={(el) => { cardsRef.current[0] = el; }}>
                <h4>Summary</h4>
                <p className={styles.summaryText}>{feedback.summary}</p>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                <div className={`${styles.feedbackCard} ${styles.strengthsCard}`} ref={(el) => { cardsRef.current[1] = el; }}>
                  <h4>Strengths</h4>
                  <ul className={styles.list}>
                    {feedback.strengths?.map((s: string, i: number) => <li key={i} className={styles.listItem}>{s}</li>)}
                  </ul>
                </div>
                
                <div className={`${styles.feedbackCard} ${styles.gapsCard}`} ref={(el) => { cardsRef.current[2] = el; }}>
                  <h4>Areas for Improvement</h4>
                  <ul className={styles.list}>
                    {feedback.gaps?.map((g: string, i: number) => <li key={i} className={styles.listItem}>{g}</li>)}
                  </ul>
                </div>
              </div>
              
              <div className={`${styles.feedbackCard} ${styles.nextCard}`} ref={(el) => { cardsRef.current[3] = el; }}>
                <h4>Next Steps</h4>
                <ul className={styles.list}>
                  {feedback.next?.map((n: string, i: number) => <li key={i} className={styles.listItem}>{n}</li>)}
                </ul>
              </div>
            </div>
            
            <button 
              className={styles.btnPrimary} 
              style={{ marginTop: '2rem', width: '100%' }}
              onClick={() => { setFeedback(null); setShowFeedbackModal(false); setSessionId(''); setMessages([]); setInterviewState(null); }}
            >
              Start New Interview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
