
import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "./types";

const createAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
    throw new Error("API 키가 설정되지 않았습니다. 환경 변수를 확인해주세요.");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * 일시적인 서버 오류(503)나 할당량 초과(429) 발생 시 지수 백오프를 적용하여 재시도합니다.
 */
async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isRetryable = 
        error.message?.includes("503") || 
        error.message?.includes("overloaded") || 
        error.message?.includes("429") ||
        error.message?.includes("RESOURCE_EXHAUSTED");

      if (isRetryable && i < maxRetries - 1) {
        // 지수 백오프: 1초, 2초, 4초 대기
        const waitTime = Math.pow(2, i) * 1000;
        console.warn(`AI 서버가 바쁩니다. ${waitTime}ms 후 재시도합니다... (시도 ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export const generateQuestions = async (topic: string): Promise<Question[]> => {
  const ai = createAI();

  return callWithRetry(async () => {
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

    if (!response.text) {
      throw new Error("질문을 생성하는 도중 AI 응답이 차단되었습니다. (안전 정책 등)");
    }

    return JSON.parse(response.text);
  });
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

  const context = questions.map(q => {
    const answer = answers[q.id] || "답변 없음";
    return `질문: ${q.text}\n답변: ${answer}`;
  }).join('\n\n');

  const prompt = `당신은 세계 최고의 의사결정 컨설턴트입니다.
사용자의 주제: "${topic}"

아래는 사용자가 20가지 질문에 대해 응답한 내용입니다:
${context}

위 답변들을 철저히 분석하여, 사용자가 최선의 선택을 내릴 수 있도록 전문적인 리포트를 작성하세요.
한국어로 작성하고, 마크다운 기호를 사용하지 마세요.`;

  return callWithRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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

      const text = response.text;
      if (!text) {
        throw new Error("분석 결과가 비어있습니다. 주제가 민감하여 차단되었을 수 있습니다.");
      }

      const cleanJson = text.replace(/^```json/, '').replace(/```$/, '').trim();
      return JSON.parse(cleanJson);
    } catch (e: any) {
      // 구체적인 에러 상황별 메시지 래핑
      if (e.message?.includes("429") || e.message?.includes("QUOTA")) {
        throw new Error("API 사용량이 한도를 초과했습니다. 1분 뒤에 다시 시도해주세요.");
      }
      if (e.message?.includes("503") || e.message?.includes("overloaded")) {
        throw new Error("현재 구글 AI 서버에 사용자가 너무 많아 처리가 지연되고 있습니다. 잠시 후 다시 시도해주세요.");
      }
      throw e;
    }
  });
};
