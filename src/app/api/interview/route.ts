import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { generateInterviewResponse } from '@/lib/huggingface';
import fs from 'fs';
import path from 'path';

// Define schemas
const startInterviewSchema = z.object({
  sessionId: z.string().min(1),
  candidate: z.any(),
});

const turnInterviewSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
});

import curriculumData from '../../../../curriculum.json';

// Ensure the LLM outputs exactly what we need
function createSystemPrompt(
  candidate: any,
  currentTopic: any,
  nextTopic: any,
  isEnding: boolean,
  isFirstQuestion: boolean
) {
  if (isEnding) {
    return `You are a strict technical interviewer. The candidate has answered the final question.
Evaluate their final answer. If it is complete nonsense, a blatant evasion, or totally insufficient, set "questionComplete": false and ask them to clarify.
If it is a genuine attempt (even if flawed), set "questionComplete": true, "done": true, and provide the final feedback.

Output MUST be a JSON object with this exact structure:
{
  "reply": "Your response (or clarification request if questionComplete is false)",
  "questionComplete": true or false,
  "done": true (only if questionComplete is true, otherwise false),
  "feedback": {
    "summary": "Overall summary of the candidate's performance",
    "strengths": ["strength 1", "strength 2"],
    "gaps": ["gap 1", "gap 2"],
    "next": ["next step 1"]
  }
}

Evaluate the candidate based on the previous conversation history.
Candidate Profile:
Role: ${candidate.member.jobRole}
Experience: ${candidate.member.yearsExperience} years`;
  }

  if (isFirstQuestion) {
    return `You are a strict, professional technical interviewer for a software engineering position.
The candidate is ${candidate.member.name} applying for ${candidate.member.jobRole} with ${candidate.member.yearsExperience} years of experience.

Your task is to ask the VERY FIRST technical question of the interview.
Topic for this question: Day ${currentTopic.day} - ${currentTopic.title}
Objectives: ${currentTopic.objectives.join(', ')}

You MUST output your response as a valid JSON object matching this structure EXACTLY (no markdown fences, no extra text):
{
  "reply": "Your first question here",
  "done": false,
  "questionComplete": true
}`;
  }

  return `You are a strict, professional technical interviewer for a software engineering position.
The candidate is ${candidate.member.name} applying for ${candidate.member.jobRole} with ${candidate.member.yearsExperience} years of experience.

The candidate has just answered a question about the following topic:
Current Topic: Day ${currentTopic.day} - ${currentTopic.title}
Objectives: ${currentTopic.objectives.join(', ')}

Your task is to evaluate the candidate's answer.

If the candidate's response is complete nonsense, a blatant evasion (e.g., "I don't know", "skip"), or totally insufficient:
- Set "questionComplete": false
- Provide corrective feedback and ask them to clarify or try again. DO NOT ask a new question.

If the candidate's response is a genuine attempt to answer (even if slightly flawed):
- Set "questionComplete": true
- Provide VERY BRIEF feedback (maximum 1 short sentence). DO NOT write a long explanation or summarize their answer. Just acknowledge it and immediately move on.
${nextTopic 
  ? `- Ask the NEXT question to transition to a new topic.\n  The next question MUST be about: Day ${nextTopic.day} - ${nextTopic.title} (${nextTopic.objectives.join(', ')})` 
  : `- Ask an intelligent follow-up question based on their previous response to dig deeper into their understanding of the current topic.`}

You MUST output your response as a valid JSON object matching this structure EXACTLY (no markdown fences, no extra text):
{
  "reply": "Your response and next question (or clarification request) here",
  "questionComplete": true or false,
  "done": false
}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    let sessionId = body.sessionId;
    let isStart = !!body.candidate;
    
    if (isStart) {
      const result = startInterviewSchema.safeParse(body);
      if (!result.success) return NextResponse.json({ error: 'Invalid start payload', details: result.error.format() }, { status: 400 });
      
      const { candidate } = result.data;
      
      // Curriculum data is now imported directly
      
      if (!curriculumData) {
        return NextResponse.json({ error: 'Internal data files missing' }, { status: 500 });
      }
      
      // Pick 4 unique days for this candidate (e.g. from their passed missions, or just random 4)
      const passedMissions = candidate.missions?.filter((m: any) => m.passed).map((m: any) => m.day) || [];
      let selectedDays = passedMissions.slice(0, 4);
      if (selectedDays.length < 4) {
         // Fallback to random curriculum days if they don't have enough passed missions
         selectedDays = curriculumData.days.slice(0, 4).map((d: any) => d.day);
      }
      
      const firstDay = selectedDays[0];
      const initialDayData = curriculumData.days.find((d: any) => d.day === firstDay);
      
      const systemPrompt = createSystemPrompt(candidate, initialDayData, null, false, true);
      const history: any[] = [];
      
      // Generate first question
      let aiResponseStr = '';
      try {
        aiResponseStr = await generateInterviewResponse(systemPrompt, history);
      } catch (err) {
        console.error('LLM error on start:', err);
        return NextResponse.json({ error: 'Failed to generate initial question' }, { status: 500 });
      }
      
      // Extract JSON from LLM response (in case it added markdown or conversational prefix)
      let aiResponseStrClean = aiResponseStr.replace(/```json/g, '').replace(/```/g, '').trim();
      const jsonMatch1 = aiResponseStrClean.match(/\{[\s\S]*\}/);
      if (jsonMatch1) {
          aiResponseStrClean = jsonMatch1[0];
      }
      
      let aiResponse;
      try {
        aiResponse = JSON.parse(aiResponseStrClean);
      } catch (e) {
        console.error('Failed to parse LLM JSON:', aiResponseStr);
        aiResponse = { reply: aiResponseStr, done: false };
      }
      
      history.push({ role: 'assistant', content: aiResponse.reply });
      
      // Save state to Supabase
      const { error: insertError } = await supabase.from('interviews').insert([{
        session_id: sessionId,
        candidate_id: candidate.member?.id || 'unknown',
        candidate_data: candidate,
        history,
        total_questions_asked: 1,
        unique_days_covered: selectedDays,
        current_day: firstDay,
        questions_asked_current_day: 1,
        status: 'IN_PROGRESS'
      }]);
      
      if (insertError) {
        console.error('Supabase error:', insertError);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
      }
      
      return NextResponse.json({
        ...aiResponse,
        state: {
          totalQuestions: 1,
          currentDay: firstDay,
          status: 'IN_PROGRESS'
        }
      });
      
    } else {
      // Turn Interview
      const result = turnInterviewSchema.safeParse(body);
      if (!result.success) return NextResponse.json({ error: 'Invalid turn payload', details: result.error.format() }, { status: 400 });
      
      const { message } = result.data;
      
      // Fetch state
      const { data: interviewData, error: fetchError } = await supabase
        .from('interviews')
        .select('*')
        .eq('session_id', sessionId)
        .single();
        
      if (fetchError || !interviewData) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      
      if (interviewData.status === 'COMPLETED') {
        return NextResponse.json({ reply: 'Interview already completed.', done: true, feedback: interviewData.feedback });
      }
      
      // Curriculum data is imported at the top of the file
      const candidate = interviewData.candidate_data;
      const history = interviewData.history;
      let totalQuestions = interviewData.total_questions_asked;
      let uniqueDays = interviewData.unique_days_covered;
      let currentDay = interviewData.current_day;
      let questionsCurrentDay = interviewData.questions_asked_current_day;
      
      history.push({ role: 'user', content: message });
      
      // State transition calculation
      const MAX_TOTAL_QUESTIONS = 8;
      const QUESTIONS_PER_DAY = 2;
      
      let isEnding = totalQuestions >= MAX_TOTAL_QUESTIONS;
      let nextDayData = null;
      let potentialCurrentDay = currentDay;
      let potentialQuestionsCurrentDay = questionsCurrentDay + 1;
      
      if (!isEnding) {
        if (potentialQuestionsCurrentDay > QUESTIONS_PER_DAY) {
          const currentIndex = uniqueDays.indexOf(currentDay);
          if (currentIndex !== -1 && currentIndex + 1 < uniqueDays.length) {
            potentialCurrentDay = uniqueDays[currentIndex + 1];
          }
        }
        nextDayData = curriculumData.days.find((d: any) => d.day === potentialCurrentDay);
      }
      
      const currentDayData = curriculumData.days.find((d: any) => d.day === currentDay);
      const systemPrompt = createSystemPrompt(candidate, currentDayData, nextDayData, isEnding, false);
      
      let aiResponseStr = '';
      try {
        aiResponseStr = await generateInterviewResponse(systemPrompt, history);
      } catch (err) {
        console.error('LLM error on turn:', err);
        return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
      }
      
      // Parse JSON from LLM (in case it added conversational prefix)
      let aiResponseStrClean = aiResponseStr.replace(/```json/g, '').replace(/```/g, '').trim();
      const jsonMatch2 = aiResponseStrClean.match(/\{[\s\S]*\}/);
      if (jsonMatch2) {
          aiResponseStrClean = jsonMatch2[0];
      }
      
      let aiResponse;
      try {
        aiResponse = JSON.parse(aiResponseStrClean);
      } catch (e) {
        console.error('Failed to parse LLM JSON:', aiResponseStr);
        if (isEnding) {
           aiResponse = { reply: 'Interview completed.', done: true, feedback: { summary: "Error generating feedback", strengths: [], gaps: [], next: [] } };
        } else {
           aiResponse = { reply: aiResponseStr, done: false };
        }
      }
      
      history.push({ role: 'assistant', content: aiResponse.reply || JSON.stringify(aiResponse) });
      
      let updatePayload: any = {
        history
      };
      
      const questionComplete = aiResponse.questionComplete !== false; 
      
      if (questionComplete && !isEnding) {
         totalQuestions++;
         questionsCurrentDay++;
         if (questionsCurrentDay > QUESTIONS_PER_DAY) {
            const currentIndex = uniqueDays.indexOf(currentDay);
            if (currentIndex !== -1 && currentIndex + 1 < uniqueDays.length) {
              currentDay = uniqueDays[currentIndex + 1];
            }
            questionsCurrentDay = 1;
         }
         updatePayload.total_questions_asked = totalQuestions;
         updatePayload.current_day = currentDay;
         updatePayload.questions_asked_current_day = questionsCurrentDay;
      }
      
      if (aiResponse.done) {
        updatePayload.status = 'COMPLETED';
        updatePayload.feedback = aiResponse.feedback;
      }
      
      await supabase.from('interviews').update(updatePayload).eq('session_id', sessionId);
      
      return NextResponse.json({
        ...aiResponse,
        state: {
          totalQuestions: totalQuestions,
          currentDay: currentDay,
          status: aiResponse.done ? 'COMPLETED' : 'IN_PROGRESS'
        }
      });
    }

  } catch (err) {
    console.error('Unhandled API error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
