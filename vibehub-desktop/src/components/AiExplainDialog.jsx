import React, { useMemo } from 'react';
import { marked } from 'marked';
import { useStore } from '../store';

// Simple LaTeX delimiters → styled spans
function renderLatex(text) {
  return text.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => `<div class="latex-block">${escapeHtml(formula)}</div>`)
    .replace(/\$([^\$]+?)\$/g, (_, formula) => `<span class="latex-inline">${escapeHtml(formula)}</span>`);
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function AiExplainDialog() {
  const { showAi, setShowAi } = useStore();
  if (!showAi) return null;
  const { projectName, explanation } = showAi;

  const html = useMemo(() => {
    if (!explanation) return '';
    const withLatex = renderLatex(explanation);
    return marked.parse(withLatex);
  }, [explanation]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center dialog-overlay" onClick={() => setShowAi(null)}>
      <div className="popup-solid p-5 w-96 max-h-[70vh] overflow-y-auto shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-3">🤖 {projectName} 分析</h3>
        <div className="text-xs leading-relaxed ai-content" style={{ background: 'var(--btn-bg)', borderRadius: 10, padding: 14 }}
          dangerouslySetInnerHTML={{ __html: html }} />
        <style>{`
          .ai-content h1 { font-size: 1.1em; font-weight: 700; margin: 0.8em 0 0.3em; }
          .ai-content h2 { font-size: 1em; font-weight: 600; margin: 0.6em 0 0.2em; }
          .ai-content h3 { font-size: 0.9em; font-weight: 600; margin: 0.5em 0 0.2em; }
          .ai-content p { margin: 0.3em 0; }
          .ai-content ul, .ai-content ol { padding-left: 1.5em; margin: 0.3em 0; }
          .ai-content li { margin: 0.1em 0; }
          .ai-content code { background: var(--btn-bg); padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }
          .ai-content pre { background: rgba(0,0,0,0.06); padding: 8px 10px; border-radius: 6px; overflow-x: auto; margin: 0.4em 0; font-size: 0.85em; }
          .ai-content pre code { background: none; padding: 0; }
          .ai-content blockquote { border-left: 3px solid var(--accent); padding-left: 8px; margin: 0.3em 0; opacity: 0.8; }
          .ai-content .latex-block { display: block; text-align: center; padding: 6px 0; font-style: italic; opacity: 0.8; font-size: 0.95em; }
          .ai-content .latex-inline { font-style: italic; opacity: 0.85; }
          .ai-content strong { font-weight: 600; }
          .ai-content em { font-style: italic; }
          .ai-content table { border-collapse: collapse; width: 100%; margin: 0.4em 0; }
          .ai-content th, .ai-content td { border: 1px solid var(--border); padding: 4px 6px; font-size: 0.9em; }
          .ai-content th { background: var(--btn-bg); }
          .ai-content hr { border: none; border-top: 1px solid var(--border); margin: 0.8em 0; }
          .ai-content a { color: var(--accent); }
        `}</style>
        <div className="flex justify-end mt-4">
          <button onClick={() => setShowAi(null)} className="glass-btn primary text-xs">知道了</button>
        </div>
      </div>
    </div>
  );
}
