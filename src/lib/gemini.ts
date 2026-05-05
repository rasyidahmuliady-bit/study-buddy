import { GoogleGenAI, Type } from "@google/genai";

const getApiKey = () => {
  return process.env.GEMINI_API_KEY || "";
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

export async function generateStudyChunks(content: string, weakTopics?: string[]) {
  const wordCount = content.split(/\s+/).length;
  // Adaptive Logic: Aim for ~300-500 words per chunk
  const targetChunks = Math.max(1, Math.ceil(wordCount / 400));

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: `You are an expert tutor. Analyze the following study material and break it down into approximately ${targetChunks} comprehensive, high-quality study chunks. 
    
    DYNAMIC CHUNKING RULES:
    - Do NOT be strictly bound by the target count of ${targetChunks} if the content flows better otherwise.
    - Each chunk should aim for 300-500 words of detailed content.
    - Ensure logical breaks (e.g., at the end of a major topic or chapter).
    
    ${weakTopics && weakTopics.length > 0 ? `SPACED REPETITION MODE: The student has difficulty with these specific topics: [${weakTopics.join(", ")}]. 
    PRIORITIZE these topics in your chunking. Ensure the explanations for these are more detailed and clear.` : ''}

    For each chunk:
    1. Provide a clear, descriptive title.
    2. Write detailed content using a highly organized structure:
       - Use H3 headers (###) for major sub-topics.
       - Use bullet points for lists and definitions.
       - Use bold text for key terminology.
       - **CRITICAL FORMATTING**:
         - EVERY header (### Header) MUST be on its own line and preceded by TWO empty lines.
         - EVERY bullet point (*) MUST be on its own line and preceded by at least ONE empty line if it follows a title or paragraph.
         - NEVER combine a header or bullet on the same line as other text.
         - Add a "Summary Note" at the end of each chunk in a blockquote (>) format.
    3. Ensure no important information from the original text is lost.
    4. Format key takeaways clearly.
    
    Return as a JSON array of objects with 'title' and 'content' keys.

    Material:
    ${content}`,
    config: {
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
  return JSON.parse(response.text);
}

export async function generateQuiz(content: string, seenQuestions: string[] = []) {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: `Generate a 5-question multiple choice quiz based on the following study material. 
    
    UNIFORMITY VS VARIETY:
    - AI MISSION: Every quiz session MUST feel fresh and unique.
    - DO NOT repeat wording or structure from previously generated questions listed below.
    - If a concept has been tested before, approach it from a DIFFERENT ANGLE (e.g., if the previous question was a definition, make this one a scenario or an application-based question).
    
    VARIATION TECHNIQUES TO USE:
    1. SCENARIO-BASED: Put the concept into a real-world situation (e.g., "A researcher is doing X, what ethical principle applies?").
    2. APPLICATION: Ask how a concept is used or its implications.
    3. CONTRAST: Compare or contrast two similar concepts.
    4. DEFINITIONAL: Simple identification of terms (use sparingly).
    5. DATA INTERPRETATION: Ask about relationships or predicted outcomes based on concepts.

    PREVIOUSLY SEEN QUESTIONS (AVOID THESE):
    ${seenQuestions.length > 0 ? seenQuestions.map(q => `- ${q}`).join('\n') : "None yet."}

    REQUIREMENTS:
    - 5 unique questions.
    - 4 options per question.
    - Shuffle the position of the correct answer.
    - Mix difficulty levels (Easy, Medium, Hard).
    
    CRITICAL FIELDS:
    1. 'topic': 2-3 words conceptual summary (e.g., "Cognitive Dissonance").
    2. 'explanation': Detailed breakdown of why the answer is correct.
    
    Return as JSON array of objects with 'question', 'options' (array of 4 strings), 'correctAnswer' (string matching one of the options), 'topic' (string), and 'explanation' (string) keys.

    Material:
    ${content}`,
    config: {
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
  return JSON.parse(response.text);
}
