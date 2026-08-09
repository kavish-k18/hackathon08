import { HfInference } from '@huggingface/inference';

const hfToken = process.env.HUGGINGFACE_API_KEY || process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN || '';

if (!hfToken) {
  console.warn('Missing Hugging Face API key');
}

export const hf = new HfInference(hfToken);
export const DEFAULT_MODEL = 'Qwen/Qwen2.5-7B-Instruct'; // Changed to 7B model for faster response times (less lag)

export async function generateInterviewResponse(
  systemPrompt: string,
  conversationHistory: { role: 'user' | 'assistant' | 'system', content: string }[],
  model: string = DEFAULT_MODEL
) {
  try {
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory
    ];

    const response = await hf.chatCompletion({
      model,
      messages: formattedMessages,
      max_tokens: 400,
      temperature: 0.6,
      // Some models support response_format: { type: "json_object" } but Llama 3 via HF 
      // might just need strong prompting. We will rely on strong system prompting.
    });
    
    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Hugging Face returned an empty response');
    }
    return content;
  } catch (error) {
    console.error('Error in HF inference:', error);
    throw new Error('Failed to generate response from Hugging Face.');
  }
}
