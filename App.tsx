
import React, { useState } from 'react';
import { AppStage, Question } from './types';
import { generateQuestions, analyzeDecision, AnalysisResult } from './geminiService';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

const App: React.FC = () => {
  const [stage, setStage] = useState<AppStage>(AppStage.START);
  const [topic, setTopic] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startDecisionProcess = async () => {
    if (!topic.trim()) return;
    setError(null);

    const currentKey = process.env.API_KEY;
    const isMissing = !currentKey || currentKey === 'undefined' || currentKey.trim() === '';

    if (isMissing && window.aistudio) {
      try {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await window.aistudio.openSelectKey();
        }
      } catch (e) {
        console.error("Environment setup failed", e);
      }
    }

    setStage(AppStage.GENERATING_QUESTIONS);
    setLoadingMessage('당신의 고민을 정밀 분석하여 최적의 질문 20개를 생성 중입니다...');
    
    try {
      const generated = await generateQuestions(topic);
      setQuestions(generated);
      setStage(AppStage.ANSWERING);
      setCurrentIndex(0);
    } catch (err: any) {
      handleError(err, '질문 생성 중 문제가 발생했습니다.');
      setStage(AppStage.START); // 질문 생성 단계 실패는 초기 화면으로
    }
  };

  const handleAnswer = (option: string) => {
    setAnswers(prev => ({ ...prev, [questions[currentIndex].id]: option }));
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      finishAnswering();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const finishAnswering = async () => {
    setError(null);
    setStage(AppStage.ANALYZING);
    setLoadingMessage('20개의 답변을 종합 분석하여 마스터 플랜을 작성 중입니다...');
    try {
      const result = await analyzeDecision(topic, questions, answers);
      setAnalysis(result);
      setStage(AppStage.RESULT);
    } catch (err: any) {
      handleError(err, '최종 분석 중 문제가 발생했습니다.');
      // 중요: 분석 실패 시 START로 돌아가지 않고 ANALYZING 상태를 유지하여 재시도를 유도함
    }
  };

  const handleError = (err: any, fallback: string) => {
    console.error("Application Error:", err);
    let msg = err.message || fallback;
    
    if (msg.startsWith('{')) {
      try {
        const parsed = JSON.parse(msg);
        msg = parsed.error?.message || msg;
      } catch (e) {}
    }

    if (msg.includes("overloaded") || msg.includes("503")) {
      setError("구글 AI 서버가 현재 매우 바쁩니다. 잠시만 기다렸다가 아래 '다시 시도' 버튼을 눌러주세요.");
    } else if (msg.includes("Quota") || msg.includes("429")) {
      setError("무료 사용 한도를 초과했습니다. 약 1분 뒤에 다시 시도해주세요.");
    } else {
      setError(msg);
    }
  };

  const resetApp = () => {
    setStage(AppStage.START);
    setTopic('');
    setQuestions([]);
    setAnswers({});
    setCurrentIndex(0);
    setAnalysis(null);
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 bg-[#fcfdff] text-slate-900">
      <div className="w-full max-w-2xl bg-white rounded-[3rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] overflow-hidden transition-all duration-700 border border-slate-100">
        
        <header className="bg-indigo-600 px-8 py-10 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-4 shadow-lg">
               <i className="fas fa-compass-drafting text-2xl"></i>
            </div>
            <h1 className="text-3xl font-black tracking-tight">decider20</h1>
            <p className="opacity-70 mt-2 text-sm font-medium tracking-wide">AI가 설계하는 당신만의 의사결정 솔루션</p>
          </div>
        </header>

        {/* Professional Alert (Start stage only or General errors) */}
        {error && stage !== AppStage.ANALYZING && (
          <div className="mx-8 mt-8 p-5 bg-rose-50 border border-rose-100 rounded-[2rem] text-rose-800 flex items-start gap-4 animate-shake">
            <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
               <i className="fas fa-triangle-exclamation"></i>
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-bold leading-relaxed">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-rose-300 hover:text-rose-500 flex-shrink-0">
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}

        <main className="p-8 md:p-12">
          {stage === AppStage.START && (
            <div className="space-y-10 animate-fadeIn">
              <div className="space-y-5 text-center">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">무엇을 결정하고 싶으신가요?</h2>
                <textarea 
                  className="w-full p-8 border-2 border-slate-50 bg-slate-50 rounded-[2.5rem] focus:border-indigo-500 focus:bg-white focus:ring-[12px] focus:ring-indigo-50 transition-all text-lg h-48 resize-none outline-none shadow-inner leading-relaxed"
                  placeholder="예: 이번 여름에 가족들과 갈 만한 해외 여행지, 혹은 내 커리어를 위해 공부해야 할 기술 스택 등..."
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>
              <button 
                onClick={startDecisionProcess}
                disabled={!topic.trim()}
                className="group w-full py-6 bg-slate-900 hover:bg-indigo-600 disabled:bg-slate-100 disabled:text-slate-300 text-white font-black text-xl rounded-[2.5rem] shadow-2xl transform transition-all active:scale-[0.97] flex items-center justify-center gap-4"
              >
                분석 프로세스 시작 <i className="fas fa-arrow-right-long group-hover:translate-x-2 transition-transform"></i>
              </button>
            </div>
          )}

          {/* GENERATING QUESTIONS STAGE */}
          {stage === AppStage.GENERATING_QUESTIONS && (
            <div className="flex flex-col items-center justify-center py-24 space-y-10 animate-fadeIn">
              <div className="relative">
                <div className="w-32 h-32 border-[12px] border-slate-50 border-t-indigo-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center text-indigo-600">
                  <i className="fas fa-microchip text-4xl animate-pulse"></i>
                </div>
              </div>
              <div className="text-center space-y-4">
                <p className="text-2xl font-black text-slate-800 tracking-tighter">{loadingMessage}</p>
              </div>
            </div>
          )}

          {/* ANALYZING STAGE (WITH ERROR RETRY) */}
          {stage === AppStage.ANALYZING && (
            <div className="flex flex-col items-center justify-center py-10 space-y-10 animate-fadeIn">
              {error ? (
                <div className="w-full space-y-8 text-center">
                  <div className="w-24 h-24 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <i className="fas fa-triangle-exclamation text-3xl"></i>
                  </div>
                  <div className="space-y-4">
                    <h2 className="text-2xl font-black text-slate-800">분석 중에 오류가 발생했습니다</h2>
                    <p className="text-slate-500 font-medium leading-relaxed max-w-sm mx-auto">
                      {error}
                    </p>
                    <p className="text-xs text-indigo-500 font-bold uppercase tracking-wider">사용자의 답변 20개는 안전하게 보관되어 있습니다.</p>
                  </div>
                  <div className="flex flex-col gap-3 pt-6">
                    <button 
                      onClick={finishAnswering}
                      className="w-full py-6 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xl rounded-[2.5rem] shadow-2xl transition-all transform active:scale-[0.97] flex items-center justify-center gap-4"
                    >
                      <i className="fas fa-rotate-right"></i> 지금 다시 분석 시도
                    </button>
                    <button 
                      onClick={() => setStage(AppStage.ANSWERING)}
                      className="w-full py-5 bg-white border-2 border-slate-100 text-slate-400 font-bold rounded-[2.5rem] hover:bg-slate-50 transition-all"
                    >
                      답변 수정하러 가기
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <div className="w-32 h-32 border-[12px] border-slate-50 border-t-indigo-600 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center text-indigo-600">
                      <i className="fas fa-brain text-4xl animate-pulse"></i>
                    </div>
                  </div>
                  <div className="text-center space-y-4">
                    <p className="text-2xl font-black text-slate-800 tracking-tighter">{loadingMessage}</p>
                    <p className="text-slate-400 text-sm animate-pulse">서버 과부하 시 자동으로 재시도를 시도합니다. 잠시만 기다려주세요.</p>
                  </div>
                </>
              )}
            </div>
          )}

          {stage === AppStage.ANSWERING && questions.length > 0 && (
            <div className="space-y-10 animate-fadeIn">
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                   <span className="px-3 py-1 bg-indigo-100 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest">Question {currentIndex + 1} / 20</span>
                </div>
                <h2 className="text-2xl font-black text-slate-800 leading-[1.3] tracking-tight">
                  {questions[currentIndex].text}
                </h2>
              </div>

              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-600 transition-all duration-1000 ease-out"
                  style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                ></div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {questions[currentIndex].options.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(option)}
                    className={`p-7 text-left rounded-[2rem] border-2 transition-all duration-300 flex items-center gap-6 group ${
                      answers[questions[currentIndex].id] === option
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-md translate-x-1'
                        : 'border-slate-50 hover:border-indigo-100 bg-slate-50/50 hover:bg-white hover:shadow-lg'
                    }`}
                  >
                    <span className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg transition-all ${
                      answers[questions[currentIndex].id] === option
                        ? 'bg-indigo-600 text-white shadow-lg rotate-3'
                        : 'bg-white text-slate-300 group-hover:text-indigo-400 group-hover:scale-110'
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className={`font-bold text-lg md:text-xl transition-colors ${
                      answers[questions[currentIndex].id] === option ? 'text-indigo-900' : 'text-slate-600'
                    }`}>{option}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-10 mt-10 border-t border-slate-50">
                <button
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className="px-8 py-4 rounded-2xl font-bold text-slate-400 disabled:opacity-0 hover:bg-slate-50 transition-all flex items-center gap-3"
                >
                  <i className="fas fa-arrow-left-long"></i> 이전
                </button>
                <button
                  onClick={handleNext}
                  disabled={!answers[questions[currentIndex].id]}
                  className="px-14 py-5 bg-slate-900 hover:bg-indigo-600 text-white font-black rounded-[2rem] shadow-2xl disabled:bg-slate-100 disabled:text-slate-300 transition-all flex items-center gap-3 transform active:scale-95"
                >
                  {currentIndex === questions.length - 1 ? '최종 리포트 생성' : '다음 단계'} 
                  <i className={`fas ${currentIndex === questions.length - 1 ? 'fa-award' : 'fa-arrow-right-long'}`}></i>
                </button>
              </div>
            </div>
          )}

          {stage === AppStage.RESULT && analysis && (
            <div className="space-y-12 animate-fadeIn pb-10">
              <div className="flex flex-col items-center gap-4">
                 <div className="relative w-24 h-24 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100"/>
                      <circle cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={264} strokeDashoffset={264 - (264 * analysis.score) / 100} className="text-indigo-600 transition-all duration-1000 ease-out"/>
                    </svg>
                    <span className="absolute text-xl font-black text-slate-800">{analysis.score}%</span>
                 </div>
                 <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em]">AI Confidence Score</p>
              </div>

              <div className="text-center space-y-6">
                <span className="inline-block px-5 py-2 bg-indigo-50 text-indigo-700 rounded-full text-xs font-black uppercase tracking-widest border border-indigo-100">Recommended Path</span>
                <h2 className="text-3xl md:text-5xl font-black text-slate-900 leading-[1.2] tracking-tight px-4">
                  {analysis.finalRecommendation}
                </h2>
                <p className="text-slate-500 text-lg md:text-xl font-medium max-w-xl mx-auto leading-relaxed">
                  {analysis.summary}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-3">
                     <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center text-xs">
                        <i className="fas fa-magnifying-glass"></i>
                     </div>
                     분석 근거
                  </h3>
                  <div className="space-y-4">
                    {analysis.reasoning.map((item, i) => (
                      <div key={i} className="p-5 bg-white border border-slate-100 rounded-2xl shadow-sm flex items-start gap-4">
                         <span className="text-indigo-500 font-black text-xs mt-1">{i+1}.</span>
                         <p className="text-sm font-bold text-slate-700 leading-relaxed">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-3">
                     <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center text-xs">
                        <i className="fas fa-scale-balanced"></i>
                     </div>
                     장단점 체크리스트
                  </h3>
                  <div className="space-y-4">
                    <div className="p-6 bg-emerald-50 rounded-[2rem] border border-emerald-100">
                      <ul className="space-y-3">
                        {analysis.pros.map((item, i) => (
                          <li key={i} className="text-emerald-800 text-sm font-bold flex items-center gap-3">
                             <i className="fas fa-check-circle text-emerald-400"></i> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-6 bg-rose-50 rounded-[2rem] border border-rose-100">
                      <ul className="space-y-3">
                        {analysis.cons.map((item, i) => (
                          <li key={i} className="text-rose-800 text-sm font-bold flex items-center gap-3">
                             <i className="fas fa-circle-info text-rose-300"></i> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl space-y-8 relative overflow-hidden">
                <div className="absolute bottom-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full -mb-24 -mr-24 blur-3xl"></div>
                <h3 className="text-2xl font-black flex items-center gap-4 relative z-10">
                  <i className="fas fa-paper-plane text-indigo-400"></i> 실행 가이드
                </h3>
                <div className="grid grid-cols-1 gap-4 relative z-10">
                  {analysis.nextSteps.map((step, i) => (
                    <div key={i} className="flex items-center gap-5 bg-white/5 p-5 rounded-[1.5rem] border border-white/10 hover:border-indigo-400/50 transition-all group">
                      <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center font-black group-hover:bg-indigo-600 transition-colors">
                        {i+1}
                      </div>
                      <p className="font-bold text-slate-100 leading-snug">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 no-print pt-6">
                <button 
                  onClick={() => window.print()}
                  className="py-6 bg-white border-2 border-slate-100 text-slate-800 font-black rounded-[2rem] hover:bg-slate-50 transition-all flex items-center justify-center gap-3"
                >
                  <i className="fas fa-download"></i> PDF로 보관하기
                </button>
                <button 
                  onClick={resetApp}
                  className="py-6 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-[2rem] shadow-xl transition-all flex items-center justify-center gap-3 transform active:scale-95"
                >
                  <i className="fas fa-rotate-left"></i> 처음으로 돌아가기
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
      
      <footer className="mt-12 text-slate-300 text-[10px] font-black uppercase tracking-[0.5em] flex flex-col items-center gap-4 no-print pb-10">
        <div className="flex items-center gap-8 opacity-50">
          <span className="flex items-center gap-2 underline underline-offset-4 decoration-2 decoration-indigo-500/20">decider20</span>
          <span className="flex items-center gap-2">Built with Gemini AI</span>
        </div>
      </footer>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-fadeIn {
          animation: fadeIn 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
        .no-print { display: flex; }
        @media print {
          body { background: white; padding: 0; }
          .min-h-screen { display: block; height: auto; padding: 20px; }
          .max-w-2xl { max-width: 100%; border: none; box-shadow: none; border-radius: 0; }
          .no-print { display: none !important; }
          header { background: #4f46e5 !important; -webkit-print-color-adjust: exact; }
          .bg-slate-900 { background: #1e293b !important; -webkit-print-color-adjust: exact; }
          .rounded-[3rem], .rounded-[2.5rem], .rounded-[2rem] { border-radius: 20px !important; }
        }
      `}</style>
    </div>
  );
};

export default App;
