import { HfInference } from '@huggingface/inference';

const hf = new HfInference(process.env.HUGGINGFACE_TOKEN);

async function run() {
  try {
    const response = await hf.chatCompletion({
      model: 'Qwen/Qwen2.5-72B-Instruct',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 50
    });
    console.log("Success:", response.choices[0].message.content);
  } catch (err: any) {
    console.error("Error details:", JSON.stringify(err, null, 2));
  }
}
run();
