
import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "./types";

const createAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
    throw new Error("서비스 구성이 완료되지 않았습니다. 잠시 후 다시 시도해주세요.");
  }
  return new GoogleGenAI({ apiKey });
};

export const generateQuestions = async (topic: string): Promise<Question[]> => {
  const ai = createAI();

  const prompt = `I want to make a decision about: "${topic}". 
  Please generate exactly 20 multiple-choice questions to help me narrow down the best decision. 
  Each question should have 3 to 4 clear options. 
  The questions should range from practical needs, personal preferences, budget, long-term goals, and situational context relevant to "${topic}".`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.INTEGER },
            text: { type: Type.STRING },
            options: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["id", "text", "options"],
          propertyOrdering: ["id", "text", "options"]
        }
      }
    }
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error("분석을 위한 질문을 생성하지 못했습니다.");
  }

  try {
    return JSON.parse(responseText);
  } catch (e) {
    throw new Error("데이터 해석 중 오류가 발생했습니다.");
  }
};

export interface AnalysisResult {
  finalRecommendation: string;
  summary: string;
  reasoning: string[];
  pros: string[];
  cons: string[];
  nextSteps: string[];
  score: number;
}

export const analyzeDecision = async (topic: string, questions: Question[], answers: Record<number, string>): Promise<AnalysisResult> => {
  const ai = createAI();

  const context = questions.map(q => `Q: ${q.text} | A: ${answers[q.id]}`).join('\n');
  const prompt = `The user wants to decide on: "${topic}".
  Here are 20 questions and the user's answers:
  ${context}
  
  Based on these specific answers, provide a comprehensive final decision in Korean.
  
  CRITICAL RULES:
  1. DO NOT use any Markdown formatting (like **, #, -, etc.) inside the string values.
  2. The text should be clean and ready to be displayed in an HTML card.
  3. Ensure the 'finalRecommendation' is punchy and clear.
  4. 'score' should be a number from 1 to 100 representing the confidence of this recommendation.
  
  Output MUST be in valid JSON.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          finalRecommendation: { type: Type.STRING },
          summary: { type: Type.STRING },
          reasoning: { type: Type.ARRAY, items: { type: Type.STRING } },
          pros: { type: Type.ARRAY, items: { type: Type.STRING } },
          cons: { type: Type.ARRAY, items: { type: Type.STRING } },
          nextSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
          score: { type: Type.NUMBER }
        },
        required: ["finalRecommendation", "summary", "reasoning", "pros", "cons", "nextSteps", "score"]
      }
    }
  });

  const resultText = response.text;
  if (!resultText) {
    throw new Error("분석 결과를 생성하지 못했습니다.");
  }

  try {
    return JSON.parse(resultText);
  } catch (e) {
    console.error("Analysis JSON parse error", e);
    throw new Error("결과 데이터를 처리하는 중 오류가 발생했습니다.");
  }
};
