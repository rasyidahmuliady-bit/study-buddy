import { GoogleGenAI, Type } from "@google/genai";

const getApiKey = () => {
  // Check for Vite environment variable (standard for Vite apps)
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) {
    return import.meta.env.VITE_GEMINI_API_KEY;
  }
  // AI Studio specific env variable, often polyfilled in vite.config
  if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  return "";
};

const ai = new GoogleGenAI({ 
  apiKey: getApiKey(),
  apiVersion: "v1beta" 
});

const getModel = (modelName: string, systemInstruction?: string) => {
  return ai.getGenerativeModel({ 
    model: modelName,
    systemInstruction
  });
};

export async function generateStudyChunks(content: string, weakTopics?: string[]) {
  const wordCount = content.split(/\s+/).length;
  const targetChunks = Math.max(1, Math.ceil(wordCount / 400));

  const systemInstruction = `You are an expert tutor. Break material into ~${targetChunks} high-quality chunks.
  - Chunks: 300-500 words each.
  - Formatting: ### headers and * bullets on new lines.
  - End each chunk with a > Summary Note.
  ${weakTopics && weakTopics.length > 0 ? `- Focus on these weak topics: ${weakTopics.join(", ")}` : ""}`;

  const model = getModel("gemini-1.5-flash", systemInstruction);
  
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: `Material:\n\n${content}` }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING }
          },
          required: ["title", "content"]
        }
      }
    }
  });

  return JSON.parse(result.response.text());
}

export async function generateQuiz(content: string, seenQuestions: string[] = []) {
  const systemInstruction = `Generate a 5-question multiple choice quiz. FAST MODE.
  VARIATION: Scenario, Application, or Contrast.
  AVOID: ${seenQuestions.slice(-5).join(" | ")}.
  SPECS: 5 questions, 4 options. Include 'topic' (short) and 'explanation'.`;

  const model = getModel("gemini-3-flash-preview", systemInstruction);

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: `Material:\n\n${content}` }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswer: { type: Type.STRING },
            topic: { type: Type.STRING },
            explanation: { type: Type.STRING }
          },
          required: ["question", "options", "correctAnswer", "topic", "explanation"]
        }
      }
    }
  });

  return JSON.parse(result.response.text());
}
