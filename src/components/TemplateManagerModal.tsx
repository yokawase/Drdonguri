import React, { useState } from 'react';
import { 
  X, 
  BookmarkPlus, 
  BookOpen, 
  Trash2, 
  Copy, 
  PlusCircle, 
  Check, 
  FileText,
  Sparkles,
  Layers
} from 'lucide-react';
import { MedicalTemplate } from '../types';

interface TemplateManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentInputText: string;
  templates: MedicalTemplate[];
  onApplyTemplate: (content: string, mode: 'replace' | 'append') => void;
  onSaveTemplate: (newTemplate: MedicalTemplate) => void;
  onDeleteTemplate: (templateId: string) => void;
  initialTab?: 'list' | 'save';
}

export const TemplateManagerModal: React.FC<TemplateManagerModalProps> = ({
  isOpen,
  onClose,
  currentInputText,
  templates,
  onApplyTemplate,
  onSaveTemplate,
  onDeleteTemplate,
  initialTab = 'list',
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'save'>(initialTab);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<'preset' | 'soap' | 'prescription' | 'custom'>('custom');
  const [newContent, setNewContent] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // モーダルオープン時に現在の入力を保存コンテンツの初期値にする
  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      if (initialTab === 'save' || !newContent) {
        setNewContent(currentInputText);
      }
    }
  }, [isOpen, initialTab, currentInputText]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) {
      return;
    }

    const created: MedicalTemplate = {
      id: `custom_${Date.now()}`,
      title: newTitle.trim(),
      category: newCategory,
      description: newDescription.trim() || 'カスタム作成された定型文',
      content: newContent.trim(),
      isCustom: true,
      createdAt: Date.now(),
    };

    onSaveTemplate(created);
    setNewTitle('');
    setNewDescription('');
    setNewContent('');
    setActiveTab('list');
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  const handleCopyClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-sky-100 text-sky-700">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">カルテ定型文マネージャー</h3>
              <p className="text-xs text-slate-500">よく使うカルテ文章の呼び出し・新規保存・管理</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="px-5 border-b border-slate-200 flex gap-4 bg-white text-xs font-semibold">
          <button
            onClick={() => setActiveTab('list')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'list'
                ? 'border-sky-600 text-sky-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>定型文一覧・呼出 ({templates.length})</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('save');
              if (!newContent) setNewContent(currentInputText);
            }}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'save'
                ? 'border-sky-600 text-sky-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BookmarkPlus className="w-4 h-4" />
            <span>現在のカルテを定型文として保存</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'list' ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Template List Column */}
              <div className="md:col-span-5 space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                  定型文を選択
                </div>
                {templates.map((tmpl) => {
                  const isSelected = tmpl.id === (selectedTemplate?.id || '');
                  return (
                    <div
                      key={tmpl.id}
                      onClick={() => setSelectedTemplateId(tmpl.id)}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        isSelected
                          ? 'border-sky-500 bg-sky-50/80 shadow-xs ring-1 ring-sky-400'
                          : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-bold text-xs text-slate-800 truncate">
                          {tmpl.title}
                        </span>
                        {tmpl.isCustom ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium shrink-0">
                            カスタム
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium shrink-0">
                            プリセット
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-1">{tmpl.description}</p>
                    </div>
                  );
                })}
              </div>

              {/* Template Preview & Actions Column */}
              <div className="md:col-span-7 bg-slate-50 rounded-xl border border-slate-200 p-4 flex flex-col justify-between">
                {selectedTemplate ? (
                  <div className="space-y-3 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-sm text-slate-800">{selectedTemplate.title}</h4>
                          {selectedTemplate.isCustom && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                              ユーザー保存
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{selectedTemplate.description}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopyClipboard(selectedTemplate.content, selectedTemplate.id)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 bg-white rounded-lg border border-slate-200 shadow-2xs hover:bg-slate-100 transition-colors"
                          title="クリップボードにコピー"
                        >
                          {copiedId === selectedTemplate.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {selectedTemplate.isCustom && (
                          <button
                            onClick={() => {
                              if (confirm(`定型文「${selectedTemplate.title}」を削除しますか？`)) {
                                onDeleteTemplate(selectedTemplate.id);
                              }
                            }}
                            className="p-1.5 text-red-500 hover:text-red-700 bg-white rounded-lg border border-slate-200 shadow-2xs hover:bg-red-50 transition-colors"
                            title="この定型文を削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 min-h-[160px] max-h-[260px] overflow-y-auto font-mono text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-200 whitespace-pre-wrap leading-relaxed">
                      {selectedTemplate.content}
                    </div>

                    {/* Action buttons */}
                    <div className="pt-2 flex flex-wrap gap-2 justify-end">
                      <button
                        onClick={() => {
                          onApplyTemplate(selectedTemplate.content, 'append');
                          onClose();
                        }}
                        className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition-colors flex items-center gap-1.5"
                      >
                        <PlusCircle className="w-4 h-4 text-slate-500" />
                        <span>カルテ末尾に追記</span>
                      </button>
                      <button
                        onClick={() => {
                          onApplyTemplate(selectedTemplate.content, 'replace');
                          onClose();
                        }}
                        className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 text-white shadow-xs transition-colors flex items-center gap-1.5"
                      >
                        <FileText className="w-4 h-4" />
                        <span>カルテへ上書き適用</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-slate-400">
                    定型文を選択してください
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Save Custom Template Tab */
            <form onSubmit={handleSave} className="space-y-4 max-w-xl mx-auto">
              <div className="bg-sky-50 rounded-xl p-3.5 border border-sky-200 flex items-start gap-2.5 text-xs text-sky-800">
                <Sparkles className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">入力中のカルテ内容を定型文としてワンクリック保存できます</p>
                  <p className="text-sky-700/80 mt-0.5">保存された定型文は次回以降、ショートカットボタンから即座に呼び出せます。</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  定型文タイトル <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="例: 急性胃腸炎、不眠症 定期処方、糖尿病 初診SOAP"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  説明・補足メモ (任意)
                </label>
                <input
                  type="text"
                  placeholder="例: 嘔気・下痢症状の対症療法と経口補水液指導"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  定型文本文 <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={8}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="定型文として保存したいカルテテキストを入力してください..."
                  className="w-full p-3 text-xs font-mono rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-white leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim() || !newContent.trim()}
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <BookmarkPlus className="w-4 h-4" />
                  <span>この内容で定型文を保存</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
