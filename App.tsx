
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
  const [additionalInput, setAdditionalInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  const handleOpenKeySelector = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setError(null);
    }
  };

  const startDecisionProcess = async () => {
    if (!topic.trim()) return;
    setError(null);
    setStage(AppStage.GENERATING_QUESTIONS);
    setLoadingMessage('당신의 고민에 꼭 필요한 핵심 질문들을 생성 중입니다...');
    
    try {
      const generated = await generateQuestions(topic);
      setQuestions(generated);
      setStage(AppStage.ANSWERING);
      setCurrentIndex(0);
    } catch (err: any) {
      handleError(err, '질문 생성 중 문제가 발생했습니다.');
      setStage(AppStage.START);
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
    setLoadingMessage('제공하신 답변들을 정밀 분석하여 최적의 해답을 도출 중입니다...');
    try {
      const result = await analyzeDecision(topic, questions, answers);
      setAnalysis(result);
      setStage(AppStage.RESULT);
    } catch (err: any) {
      handleError(err, '최종 분석 중 문제가 발생했습니다.');
    }
  };

  const handleRefineAnalysis = async () => {
    if (!additionalInput.trim()) return;
    setIsRefining(true);
    setError(null);
    try {
      const result = await analyzeDecision(topic, questions, answers, additionalInput);
      setAnalysis(result);
      setAdditionalInput('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      handleError(err, '심층 분석 중 문제가 발생했습니다.');
    } finally {
      setIsRefining(false);
    }
  };

  const handleError = (err: any, fallback: string) => {
    console.error("Application Error:", err);
    let msg = err.message || fallback;
    if (msg.includes("Quota") || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
      setError("무료 사용 한도를 초과했습니다. 1분 뒤 다시 시도하거나 유료 API 키를 설정해주세요.");
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
    setAdditionalInput('');
  };

  const switchToAlternative = async (altTitle: string) => {
    if (!analysis) return;
    setIsRefining(true);
    setError(null);
    try {
      const result = await analyzeDecision(topic, questions, answers, undefined, altTitle);
      setAnalysis(result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      handleError(err, '대안 상세 분석 중 문제가 발생했습니다.');
    } finally {
      setIsRefining(false);
    }
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
            <p className="opacity-70 mt-2 text-sm font-medium tracking-wide">AI 맞춤형 의사결정 프레임워크</p>
          </div>
        </header>

        {error && (
          <div className="mx-8 mt-8 p-6 bg-rose-50 border border-rose-100 rounded-[2.5rem] text-rose-800 flex flex-col gap-4 animate-shake">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
                <i className="fas fa-triangle-exclamation"></i>
              </div>
              <p className="text-sm font-bold leading-relaxed flex-1">{error}</p>
              <button onClick={() => setError(null)} className="text-rose-300 hover:text-rose-500">
                <i className="fas fa-times"></i>
              </button>
            </div>
            {(error.includes("한도") || error.includes("API 키")) && (
              <button onClick={handleOpenKeySelector} className="w-full py-3 bg-rose-600 text-white rounded-xl font-bold text-xs hover:bg-rose-700 transition-colors flex items-center justify-center gap-2">
                <i className="fas fa-key"></i> API 키 설정 (한도 증설)
              </button>
            )}
          </div>
        )}

        <main className="p-8 md:p-12">
          {stage === AppStage.START && (
            <div className="space-y-10 animate-fadeIn">
              <div className="space-y-5 text-center">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">결정이 필요한 분야가 무엇인가요?</h2>
                <textarea 
                  className="w-full p-8 border-2 border-slate-50 bg-slate-50 rounded-[2.5rem] focus:border-indigo-500 focus:bg-white focus:ring-[12px] focus:ring-indigo-50 transition-all text-lg h-48 resize-none outline-none shadow-inner leading-relaxed"
                  placeholder="예: 이직 제안을 수락할까요? / 이번 달에 어떤 적금 상품에 가입할까요?"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>
              <button 
                onClick={startDecisionProcess}
                disabled={!topic.trim()}
                className="group w-full py-6 bg-slate-900 hover:bg-indigo-600 disabled:bg-slate-100 disabled:text-slate-300 text-white font-black text-xl rounded-[2.5rem] shadow-2xl transition-all flex items-center justify-center gap-4"
              >
                진단 질문 생성 <i className="fas fa-arrow-right-long group-hover:translate-x-2 transition-transform"></i>
              </button>
            </div>
          )}

          {(stage === AppStage.GENERATING_QUESTIONS || stage === AppStage.ANALYZING) && (
            <div className="flex flex-col items-center justify-center py-24 space-y-10 animate-fadeIn">
              <div className="relative">
                <div className="w-32 h-32 border-[12px] border-slate-50 border-t-indigo-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center text-indigo-600">
                  <i className={`fas ${stage === AppStage.ANALYZING ? 'fa-brain' : 'fa-microchip'} text-4xl animate-pulse`}></i>
                </div>
              </div>
              <p className="text-2xl font-black text-slate-800 tracking-tighter text-center">{loadingMessage}</p>
            </div>
          )}

          {stage === AppStage.ANSWERING && questions.length > 0 && (
            <div className="space-y-10 animate-fadeIn">
              <div className="space-y-3">
                <span className="px-3 py-1 bg-indigo-100 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest">Question {currentIndex + 1} / {questions.length}</span>
                <h2 className="text-2xl font-black text-slate-800 leading-[1.3] tracking-tight">{questions[currentIndex].text}</h2>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 transition-all duration-1000 ease-out" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}></div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {questions[currentIndex].options.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(option)}
                    className={`p-7 text-left rounded-[2rem] border-2 transition-all flex items-center gap-6 group ${
                      answers[questions[currentIndex].id] === option ? 'border-indigo-600 bg-indigo-50/50 shadow-md translate-x-1' : 'border-slate-50 hover:border-indigo-100 bg-slate-50/50 hover:bg-white'
                    }`}
                  >
                    <span className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${
                      answers[questions[currentIndex].id] === option ? 'bg-indigo-600 text-white shadow-lg rotate-3' : 'bg-white text-slate-300 group-hover:text-indigo-400'
                    }`}>{String.fromCharCode(65 + idx)}</span>
                    <span className={`font-bold text-lg ${answers[questions[currentIndex].id] === option ? 'text-indigo-900' : 'text-slate-600'}`}>{option}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between pt-10 border-t border-slate-50">
                <button onClick={handlePrev} disabled={currentIndex === 0} className="px-8 py-4 rounded-2xl font-bold text-slate-400 disabled:opacity-0 hover:bg-slate-50 transition-all flex items-center gap-3">
                  <i className="fas fa-arrow-left-long"></i> 이전
                </button>
                <button onClick={handleNext} disabled={!answers[questions[currentIndex].id]} className="px-14 py-5 bg-slate-900 hover:bg-indigo-600 text-white font-black rounded-[2rem] shadow-2xl transition-all flex items-center gap-3 active:scale-95">
                  {currentIndex === questions.length - 1 ? '최종 분석 리포트' : '다음'} <i className={`fas ${currentIndex === questions.length - 1 ? 'fa-award' : 'fa-arrow-right-long'}`}></i>
                </button>
              </div>
            </div>
          )}

          {stage === AppStage.RESULT && analysis && (
            <div className={`space-y-12 animate-fadeIn pb-10 ${isRefining ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
              {isRefining && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm pointer-events-auto">
                   <div className="w-16 h-16 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                   <p className="text-xl font-black text-slate-800">해당 선택지로 심층 분석 중입니다...</p>
                </div>
              )}

              <div className="flex flex-col items-center gap-4">
                 <div className="relative w-24 h-24 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100"/>
                      <circle cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={264} strokeDashoffset={264 - (264 * analysis.score) / 100} className="text-indigo-600 transition-all duration-1000 ease-out"/>
                    </svg>
                    <span className="absolute text-xl font-black text-slate-800">{analysis.score}%</span>
                 </div>
                 <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em]">Decision Confidence</p>
              </div>

              <div className="text-center space-y-6">
                <span className="inline-block px-5 py-2 bg-indigo-50 text-indigo-700 rounded-full text-xs font-black uppercase tracking-widest border border-indigo-100">Recommended Path</span>
                <h2 className="text-3xl md:text-5xl font-black text-slate-900 leading-tight tracking-tight">{analysis.finalRecommendation}</h2>
                <p className="text-slate-500 text-lg md:text-xl font-medium max-w-xl mx-auto">{analysis.summary}</p>
              </div>

              {analysis.refinedInsight && (
                <div className="bg-amber-50 border border-amber-100 p-8 rounded-[2.5rem] space-y-4 animate-fadeIn">
                   <h3 className="text-amber-800 font-black flex items-center gap-3 uppercase text-xs tracking-widest">
                      <i className="fas fa-magnifying-glass-plus"></i> 추가 고려사항 심층 진단
                   </h3>
                   <p className="text-amber-900 font-bold leading-relaxed">{analysis.refinedInsight}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-3">
                     <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center text-xs"><i className="fas fa-magnifying-glass"></i></div> 분석 근거
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
                     <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center text-xs"><i className="fas fa-scale-balanced"></i></div> 장단점 체크
                  </h3>
                  <div className="space-y-4">
                    <div className="p-6 bg-emerald-50 rounded-[2rem] border border-emerald-100">
                      <ul className="space-y-3">{analysis.pros.map((item, i) => (<li key={i} className="text-emerald-800 text-sm font-bold flex items-center gap-3"><i className="fas fa-check-circle text-emerald-400"></i> {item}</li>))}</ul>
                    </div>
                    <div className="p-6 bg-rose-50 rounded-[2rem] border border-rose-100">
                      <ul className="space-y-3">{analysis.cons.map((item, i) => (<li key={i} className="text-rose-800 text-sm font-bold flex items-center gap-3"><i className="fas fa-circle-info text-rose-300"></i> {item}</li>))}</ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* 추가 고려사항 입력 섹션 */}
              <div className="pt-10 border-t border-slate-100 space-y-6 no-print">
                 <div className="flex flex-col items-center text-center space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Custom Refinement</span>
                    <h3 className="text-2xl font-black text-slate-800">분석에 더 반영할 내용이 있나요?</h3>
                    <p className="text-sm text-slate-500">놓친 점이나 현재 가장 크게 걸리는 고민을 적어주시면 상세히 재분석해 드립니다.</p>
                 </div>
                 <div className="relative">
                    <textarea 
                      value={additionalInput}
                      onChange={(e) => setAdditionalInput(e.target.value)}
                      placeholder="예: '사실 예산보다 거리가 더 중요해요' 혹은 '이미 해당 지역에 아는 사람이 있어요' 등..."
                      className="w-full p-8 border-2 border-slate-50 bg-slate-50 rounded-[2.5rem] focus:border-indigo-500 focus:bg-white focus:ring-[12px] focus:ring-indigo-50 transition-all text-base h-32 resize-none outline-none leading-relaxed"
                    />
                    <button 
                      onClick={handleRefineAnalysis}
                      disabled={isRefining || !additionalInput.trim()}
                      className="absolute bottom-4 right-4 py-3 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black rounded-2xl shadow-xl transition-all flex items-center gap-2 text-sm"
                    >
                      {isRefining ? <i className="fas fa-spinner animate-spin"></i> : <i className="fas fa-wand-magic-sparkles"></i>} 
                      심층 재분석
                    </button>
                 </div>
              </div>

              {analysis.alternatives && analysis.alternatives.length > 0 && (
                <div className="space-y-8 pt-10 border-t border-slate-100">
                  <h3 className="text-2xl font-black text-slate-800 text-center">다른 최선의 대안들</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {analysis.alternatives.map((alt, i) => (
                      <div key={i} className="p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] hover:bg-white hover:shadow-xl transition-all flex flex-col justify-between">
                         <div className="space-y-4">
                           <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center text-xs font-black">ALT {i+1}</div>
                           <h4 className="text-xl font-black text-slate-900">{alt.title}</h4>
                           <p className="text-sm text-slate-500 font-medium leading-relaxed">{alt.summary}</p>
                           <p className="text-xs font-bold text-indigo-600 pt-2">차선책 사유: <span className="text-slate-600 font-medium">{alt.whyThis}</span></p>
                         </div>
                         <button 
                            onClick={() => switchToAlternative(alt.title)} 
                            className="mt-8 py-3 w-full bg-white border border-slate-200 text-slate-400 font-bold rounded-2xl hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all text-xs"
                         >
                            이 대안으로 상세 리포트 확인
                         </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl space-y-8 overflow-hidden relative">
                <h3 className="text-2xl font-black flex items-center gap-4 relative z-10"><i className="fas fa-paper-plane text-indigo-400"></i> 실행 가이드</h3>
                <div className="grid grid-cols-1 gap-4 relative z-10">
                  {analysis.nextSteps.map((step, i) => (
                    <div key={i} className="flex items-center gap-5 bg-white/5 p-5 rounded-[1.5rem] border border-white/10">
                      <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center font-black">{i+1}</div>
                      <p className="font-bold text-slate-100">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 no-print">
                <button onClick={() => window.print()} className="py-6 bg-white border-2 border-slate-100 text-slate-800 font-black rounded-[2rem] hover:bg-slate-50 flex items-center justify-center gap-3"><i className="fas fa-download"></i> PDF 보관</button>
                <button onClick={resetApp} className="py-6 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-[2rem] shadow-xl flex items-center justify-center gap-3 transition-transform active:scale-95"><i className="fas fa-rotate-left"></i> 처음으로</button>
              </div>
            </div>
          )}
        </main>
      </div>
      
      <footer className="mt-12 text-slate-300 text-[10px] font-black uppercase tracking-[0.5em] flex flex-col items-center gap-6 no-print pb-10">
        <div className="flex flex-wrap items-center justify-center gap-6 opacity-60">
          <button onClick={handleOpenKeySelector} className="flex items-center gap-2 hover:text-indigo-500 transition-colors border-b border-transparent hover:border-indigo-500 pb-1"><i className="fas fa-key"></i> API 키 설정</button>
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-indigo-500 transition-colors border-b border-transparent hover:border-indigo-500 pb-1"><i className="fas fa-circle-info"></i> API 한도 및 결제</a>
        </div>
        <div className="opacity-40 tracking-widest uppercase">decider20 &bull; Built with Gemini AI</div>
      </footer>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
        .animate-fadeIn { animation: fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-shake { animation: shake 0.5s ease-in-out; }
        @media print {
          body { background: white; }
          .min-h-screen { display: block; padding: 20px; }
          .max-w-2xl { max-width: 100%; box-shadow: none; border: none; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default App;
