
import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "./types";

const createAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
    throw new Error("API 키가 설정되지 않았습니다. 환경 변수를 확인해주세요.");
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

  if (!response.text) {
    throw new Error("질문을 생성하는 도중 AI 응답이 차단되었습니다. (안전 정책 등의 이유)");
  }

  try {
    return JSON.parse(response.text);
  } catch (e) {
    throw new Error("생성된 질문 데이터를 해석하는 데 실패했습니다.");
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

  // 답변 데이터 정제 및 컨텍스트 구성
  const context = questions.map(q => {
    const answer = answers[q.id] || "답변 없음";
    return `질문: ${q.text}\n답변: ${answer}`;
  }).join('\n\n');

  const prompt = `당신은 세계 최고의 의사결정 컨설턴트입니다.
사용자의 주제: "${topic}"

아래는 사용자가 20가지 질문에 대해 응답한 내용입니다:
${context}

위 답변들을 철저히 분석하여, 사용자가 최선의 선택을 내릴 수 있도록 전문적인 리포트를 작성하세요.

[필수 규칙]
1. 모든 응답은 한국어로 작성하세요.
2. 마크다운 기호(예: **, #, -, \` 등)를 절대 사용하지 마세요. 순수 텍스트만 사용하세요.
3. finalRecommendation은 아주 명확하고 단호하게 한 문장으로 작성하세요.
4. score는 1~100 사이의 숫자로, 답변의 일관성과 확신도를 나타냅니다.
5. JSON 형식을 엄격히 준수하세요.`;

  try {
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

    const text = response.text;
    if (!text) {
      throw new Error("분석 결과가 비어있습니다. 주제가 너무 민감하거나 위험하여 AI가 응답을 거부했을 수 있습니다.");
    }

    // 혹시 모를 앞뒤 공백이나 마크다운 코드 블록 기호 제거
    const cleanJson = text.replace(/^```json/, '').replace(/```$/, '').trim();
    return JSON.parse(cleanJson);
  } catch (e: any) {
    console.error("Gemini Analysis Error:", e);
    throw new Error(e.message || "분석 엔진에서 알 수 없는 오류가 발생했습니다.");
  }
};
