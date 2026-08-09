import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/interview/route';

// Mock dependencies
vi.mock('@/lib/supabase', () => {
  let mockState: any = null;
  return {
    supabase: {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockImplementation((payload) => {
          mockState = payload[0];
          return { error: null };
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockImplementation(() => {
              if (!mockState) return { data: null, error: { code: 'PGRST116' } };
              return { data: mockState, error: null };
            })
          })
        }),
        update: vi.fn().mockImplementation((payload) => {
          mockState = { ...mockState, ...payload };
          return { eq: vi.fn().mockReturnValue({ error: null }) };
        })
      })
    }
  };
});

vi.mock('@/lib/huggingface', () => ({
  generateInterviewResponse: vi.fn().mockImplementation(async (systemPrompt) => {
    if (systemPrompt.includes('the final question')) {
      return JSON.stringify({
        reply: 'Thank you for your time.',
        questionComplete: true,
        done: true,
        feedback: { summary: 'Good job', strengths: ['A'], gaps: ['B'], next: ['C'] }
      });
    }
    return JSON.stringify({
      reply: 'Mock LLM Response',
      questionComplete: true,
      done: false
    });
  })
}));

describe('Interview API State Machine', () => {
  const sessionId = '123e4567-e89b-12d3-a456-426614174000';
  
  it('should successfully run through an 8-question interview and generate feedback', async () => {
    // 1. Start Interview
    let req = new Request('http://localhost/api/interview', {
      method: 'POST',
      body: JSON.stringify({ sessionId, candidate: { member: { id: 'CAND-001', name: 'Test', jobRole: 'Dev', yearsExperience: 2 }, missions: [] } })
    });
    let res = await POST(req);
    let data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.done).toBe(false);

    // Track state manually for test assertions
    let currentDayTracked = null;
    let daySwitches = 0;
    
    // 2. Loop for 8 turns
    for (let i = 1; i <= 8; i++) {
      req = new Request('http://localhost/api/interview', {
        method: 'POST',
        body: JSON.stringify({ sessionId, message: `Answer for question ${i}` })
      });
      res = await POST(req);
      data = await res.json();
      
      expect(res.status).toBe(200);
      
      // We can inspect the internal mocked state by making a fake select call
      const { supabase } = await import('@/lib/supabase');
      const { data: state } = await supabase.from('interviews').select('*').eq('session_id', sessionId).single();
      
      if (currentDayTracked === null) {
        currentDayTracked = state.current_day;
      } else if (currentDayTracked !== state.current_day) {
        daySwitches++;
        currentDayTracked = state.current_day;
      }
      
      if (i === 8) {
        // 8th question should end the interview
        expect(data.done).toBe(true);
        expect(data.feedback).toBeDefined();
        expect(state.status).toBe('COMPLETED');
      } else {
        expect(data.done).toBe(false);
        expect(state.status).toBe('IN_PROGRESS');
      }
    }
    
    // Day should switch after every 2 questions (at question 2, 4, 6)
    // By the time 8th question finishes, we've gone through 4 unique days.
    // That means we switch 3 times.
    expect(daySwitches).toBe(3);
  });
});
