
export interface Question {
  id: number;
  text: string;
  options: string[];
}

export interface DecisionState {
  topic: string;
  questions: Question[];
  answers: Record<number, string>;
  currentStep: number;
  loading: boolean;
  result: string | null;
  error: string | null;
}

export enum AppStage {
  START = 'START',
  GENERATING_QUESTIONS = 'GENERATING_QUESTIONS',
  ANSWERING = 'ANSWERING',
  ANALYZING = 'ANALYZING',
  RESULT = 'RESULT'
}
