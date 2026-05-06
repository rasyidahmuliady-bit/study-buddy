import { GoogleGenAI, Type } from "@google/genai";

const getApiKey = () => {
  // Always use process.env.GEMINI_API_KEY for the Gemini API as per platform rules.
  // This is injected by the platform and defined in vite.config.ts for the client.
  try {
    const key = process.env.GEMINI_API_KEY;
    if (key && key !== "MY_GEMINI_API_KEY" && key !== "" && key !== "undefined" && key !== "null") {
      return key;
    }
  } catch (e) {
    // Falls back gracefully
  }

  // Fallback to import.meta.env if process.env is missing (sometimes happens in certain Vite setups)
  try {
    const viteKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (viteKey && viteKey !== "MY_GEMINI_API_KEY" && viteKey !== "" && viteKey !== "undefined" && viteKey !== "null") {
      return viteKey;
    }
  } catch (e) {
    // Falls back gracefully
  }

  return "";
};

const apiKey = getApiKey();
if (!apiKey) {
  console.warn("Gemini API key is not set. AI features will be disabled. Please set GEMINI_API_KEY in your environment.");
}

const ai = new GoogleGenAI({ apiKey });

export const hasApiKey = !!apiKey;

export async function generateStudyChunks(content: string, weakTopics?: string[]) {
  if (!hasApiKey) {
    throw new Error("API key is missing. Please set GEMINI_API_KEY in your environment variables.");
  }
  const wordCount = content.split(/\s+/).length;
  // Adaptive Logic: Aim for ~300-500 words per chunk
  const targetChunks = Math.max(1, Math.ceil(wordCount / 400));

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
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
  const text = response.text || "[]";
  const cleanJson = text.replace(/```json\s?|```/g, "").trim();
  try {
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error("Failed to parse AI chunks response:", text);
    return [];
  }
}

export async function generateVideoRecommendations(topic: string, subject?: string, context?: string) {
  if (!hasApiKey) {
    return []; // Return empty instead of throwing for recommendations to be less disruptive
  }
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are an educational content curator with access to real-time search.
    Find 2-3 REAL, high-quality educational YouTube videos that explain the core concepts of: "${topic}" ${subject ? `(Subject: ${subject})` : ""}.
    
    CONTEXT:
    ${context?.slice(0, 1000)}
    
    STRATEGY:
    - If the topic title is long or academic (e.g., "Foundations and Global Philosophy of Inclusive Education"), DO NOT search for the exact title.
    - Instead, EXTRACT simplified educational keywords (e.g., "Inclusive Education", "Philosophy of Inclusion", "Inclusive Classroom").
    - Use these keywords to find the most popular and authoritative videos from trusted sources.
    
    YOUR MISSION:
    - Use your SEARCH tool to find the most relevant, popular, and currently available educational videos.
    - Prioritize channels: Khan Academy, CrashCourse, TED-Ed, 3Blue1Brown, Kurzgesagt, freeCodeCamp, or Veritasium.
    - YOU MUST provide DIRECT YouTube URLs that work.
    - ABSOLUTELY NO HALLUCINATIONS. If you can't find a direct, verifiable link using search, return an empty array [].
    
    Each recommendation MUST include:
    1. title: The exact video title.
    2. channel: The official channel name.
    3. description: A helpful 1-sentence summary.
    4. url: The direct watch link (starts with https://www.youtube.com/watch?v=).
    
    Output: JSON array of objects.`,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            channel: { type: Type.STRING },
            description: { type: Type.STRING },
            url: { type: Type.STRING }
          },
          required: ["title", "channel", "description", "url"]
        }
      }
    }
  });
  const text = response.text || "[]";
  const cleanJson = text.replace(/```json\s?|```/g, "").trim();
  try {
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error("Failed to parse AI recommendations response:", text);
    return [];
  }
}

export async function generateQuiz(content: string, seenQuestions: string[] = []) {
  if (!hasApiKey) {
    throw new Error("API key is missing. Cannot generate quiz.");
  }
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
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
  const text = response.text || "[]";
  const cleanJson = text.replace(/```json\s?|```/g, "").trim();
  try {
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error("Failed to parse AI quiz response:", text);
    throw new Error("Invalid quiz data format received from AI.");
  }
}
