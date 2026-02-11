
import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "./types";

/**
 * 호출 시점의 process.env.API_KEY를 사용하여 최신 AI 인스턴스를 생성합니다.
 */
const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
    throw new Error("API 키가 설정되지 않았습니다. 하단의 'API 키 선택'을 통해 키를 설정해주세요.");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * 일시적인 서버 오류(503)나 할당량 초과(429) 발생 시 지수 백오프를 적용하여 재시도합니다.
 */
async function callWithRetry<T>(fn: (ai: GoogleGenAI) => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const ai = getAI();
      return await fn(ai);
    } catch (error: any) {
      lastError = error;
      const errorMsg = error.message || "";
      const isRetryable = 
        errorMsg.includes("503") || 
        errorMsg.includes("overloaded") || 
        errorMsg.includes("429") ||
        errorMsg.includes("RESOURCE_EXHAUSTED");

      if (isRetryable && i < maxRetries - 1) {
        const waitTime = Math.pow(2, i) * 1000;
        console.warn(`AI 서버 응답 지연 혹은 한도 초과. ${waitTime}ms 후 재시도... (${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export const generateQuestions = async (topic: string): Promise<Question[]> => {
  return callWithRetry(async (ai) => {
    const prompt = `I want to make a decision about: "${topic}". 
    Please determine the optimal number of questions needed to make a high-quality recommendation.
    Generate at least 5 but no more than 20 multiple-choice questions. 
    Each question must have 3 to 4 clear options. 
    Ensure the questions cover all critical factors for "${topic}".`;

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
      throw new Error("질문을 생성하는 도중 AI 응답이 차단되었습니다.");
    }

    const questions: Question[] = JSON.parse(response.text);
    return questions.map((q, index) => ({ ...q, id: index + 1 }));
  });
};

export interface Alternative {
  title: string;
  summary: string;
  whyThis: string;
}

export interface AnalysisResult {
  finalRecommendation: string;
  summary: string;
  reasoning: string[];
  pros: string[];
  cons: string[];
  nextSteps: string[];
  score: number;
  alternatives: Alternative[];
  refinedInsight?: string;
}

export const analyzeDecision = async (
  topic: string, 
  questions: Question[], 
  answers: Record<number, string>, 
  additionalInput?: string,
  targetAlternative?: string
): Promise<AnalysisResult> => {
  const qAndA = questions.map(q => {
    const answer = answers[q.id] || "답변 없음";
    return `질문: ${q.text}\n답변: ${answer}`;
  }).join('\n\n');

  let prompt = `당신은 세계 최고의 의사결정 컨설턴트입니다.
사용자의 주제: "${topic}"

[기본 데이터]
${qAndA}

${additionalInput ? `[사용자의 추가 요청 사항]\n${additionalInput}\n` : ""}
${targetAlternative ? `[강조 대안]\n사용자가 기존 추천안 대신 "${targetAlternative}" 이라는 선택지에 대해 더 깊이 알고 싶어합니다. 이 대안을 '주 추천안(finalRecommendation)'으로 설정하여 그에 따른 상세 분석 리포트를 다시 작성하세요.` : ""}

위 데이터를 바탕으로 전문적인 리포트를 작성하세요. 
만약 강조 대안이 지정되었다면, 그 대안이 왜 합리적인 선택이 될 수 있는지 집중적으로 분석하여 근거(reasoning), 장점(pros), 단점(cons), 그리고 실행 가이드(nextSteps)를 그에 맞춰 새롭게 생성해야 합니다.
결과는 JSON 형식으로 출력하며, 모든 텍스트는 한국어로 마크다운 없이 작성하세요.`;

  return callWithRetry(async (ai) => {
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
            score: { type: Type.NUMBER },
            alternatives: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  whyThis: { type: Type.STRING }
                },
                required: ["title", "summary", "whyThis"]
              }
            },
            refinedInsight: { type: Type.STRING }
          },
          required: ["finalRecommendation", "summary", "reasoning", "pros", "cons", "nextSteps", "score", "alternatives"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("분석 결과가 비어있습니다.");
    return JSON.parse(text.replace(/^```json/, '').replace(/```$/, '').trim());
  });
};
