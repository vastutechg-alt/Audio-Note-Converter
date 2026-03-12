/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  Upload, 
  FileAudio, 
  Loader2, 
  Copy, 
  Download, 
  Printer, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  HelpCircle,
  MessageSquare,
  ListChecks,
  BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun } from "docx";

// --- Types ---

type ProcessingMode = 'transcript' | 'article' | 'questions' | 'answers' | 'qa' | 'summary' | 'all';
type Language = 'auto' | 'si' | 'en';

interface ResultData {
  transcript?: string;
  article?: string;
  questions?: string;
  answers?: string;
  qa?: string;
  summary?: string;
}

// --- Constants ---

const MODES = [
  { id: 'transcript', label: 'සම්පූර්ණ ලිවීම', icon: FileText },
  { id: 'article', label: 'රචනය / ලිපිය', icon: BookOpen },
  { id: 'summary', label: 'සාරාංශය', icon: ListChecks },
  { id: 'qa', label: 'ප්‍රශ්න සහ පිළිතුරු', icon: MessageSquare },
  { id: 'questions', label: 'ප්‍රශ්න පමණක්', icon: HelpCircle },
  { id: 'all', label: 'සියල්ල', icon: CheckCircle2 },
];

const LANGUAGES = [
  { id: 'auto', label: 'ස්වයංක්‍රීය (Auto)' },
  { id: 'si', label: 'සිංහල (Sinhala)' },
  { id: 'en', label: 'ඉංග්‍රීසි (English)' },
];

// --- App Component ---

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<Language>('auto');
  const [mode, setMode] = useState<ProcessingMode>('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ResultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Handlers ---

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 20 * 1024 * 1024) { // 20MB limit for browser-side base64
        setError("ගොනුව විශාල වැඩියි. කරුණාකර මෙගාබයිට් 20 ට අඩු ගොනුවක් තෝරන්න.");
        return;
      }
      setFile(selectedFile);
      setError(null);
      setResults(null);
    }
  };

  const clearAll = () => {
    setFile(null);
    setResults(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleConvert = async () => {
    if (!file) {
      setError("කරුණාකර පළමුව හඬ පටයක් තෝරන්න.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const base64Data = await fileToBase64(file);

      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          base64Data,
          mimeType: file.type,
          language,
          mode
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const result = await response.json();
      const responseText = result.text;
      
      // Attempt to parse JSON from the response
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedData = JSON.parse(jsonMatch[0]);
          setResults(parsedData);
          // Set initial active tab based on mode or first available
          const firstKey = Object.keys(parsedData)[0];
          setActiveTab(mode === 'all' ? 'transcript' : (mode === 'qa' ? 'qa' : mode));
        } else {
          // Fallback if not JSON
          setResults({ transcript: responseText });
          setActiveTab('transcript');
        }
      } catch (e) {
        setResults({ transcript: responseText });
        setActiveTab('transcript');
      }

    } catch (err: any) {
      console.error(err);
      setError("සැකසීමේදී දෝෂයක් සිදු විය. කරුණාකර නැවත උත්සාහ කරන්න. (Error: " + (err.message || "Unknown") + ")");
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Simple alert for user feedback
    alert("පිටපත් කරන ලදී!");
  };

  const downloadTxt = (text: string, title: string) => {
    const element = document.createElement("a");
    const file = new Blob([text], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${title}.txt`;
    document.body.appendChild(element);
    element.click();
  };

  const downloadPdf = (text: string, title: string) => {
    const doc = new jsPDF();
    const splitText = doc.splitTextToSize(text, 180);
    doc.text(splitText, 10, 10);
    doc.save(`${title}.pdf`);
  };

  const downloadDocx = async (text: string, title: string) => {
    const doc = new Document({
      sections: [{
        properties: {},
        children: text.split('\n').map(line => new Paragraph({
          children: [new TextRun(line)],
        })),
      }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title}.docx`;
    link.click();
  };

  const printContent = (text: string) => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<html><head><title>Print</title><style>body{font-family:sans-serif;padding:40px;line-height:1.6;}</style></head><body>${text.replace(/\n/g, '<br>')}</body></html>`);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // --- Render Helpers ---

  const getLabel = (id: string) => MODES.find(m => m.id === id)?.label || id;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <header className="text-center mb-10">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-4xl font-bold text-slate-800 mb-2"
          >
            හඬ පට පරිවර්තකය
          </motion.h1>
          <p className="text-slate-500">Audio Note Converter for Architects</p>
        </header>

        {/* Main Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 overflow-hidden border border-slate-100">
          <div className="p-6 md:p-10">
            
            {/* Upload Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-slate-700 mb-1">හඬ පටය තෝරන්න</label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
                    ${file ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}`}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="audio/*,video/*"
                    className="hidden" 
                  />
                  {file ? (
                    <div className="flex flex-col items-center text-emerald-700">
                      <FileAudio className="w-12 h-12 mb-2" />
                      <span className="font-medium truncate max-w-full px-4">{file.name}</span>
                      <span className="text-xs opacity-70">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-slate-400">
                      <Upload className="w-12 h-12 mb-2" />
                      <span className="text-sm">ගොනුව මෙතැනට දමන්න හෝ ක්ලික් කරන්න</span>
                      <span className="text-xs mt-1">(MP3, WAV, M4A, MP4)</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">භාෂාව</label>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map(lang => (
                      <button
                        key={lang.id}
                        onClick={() => setLanguage(lang.id as Language)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all
                          ${language === lang.id 
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">සැකසුම් ආකාරය</label>
                  <div className="grid grid-cols-2 gap-2">
                    {MODES.map(m => (
                      <button
                        key={m.id}
                        onClick={() => setMode(m.id as ProcessingMode)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border
                          ${mode === m.id 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                            : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'}`}
                      >
                        <m.icon className="w-4 h-4" />
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-slate-50">
              <button
                disabled={!file || isProcessing}
                onClick={handleConvert}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 text-lg"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    සකසමින් පවතී...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-6 h-6" />
                    පරිවර්තනය කරන්න
                  </>
                )}
              </button>
              
              <button
                disabled={isProcessing || (!file && !results)}
                onClick={clearAll}
                className="px-8 py-4 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 font-bold rounded-2xl transition-all flex items-center justify-center gap-2"
              >
                <Trash2 className="w-5 h-5" />
                මකන්න
              </button>
            </div>

            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-700"
                >
                  <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                  <p className="text-sm font-medium">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>

        {/* Results Section */}
        <AnimatePresence>
          {results && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 space-y-6"
            >
              <div className="flex items-center justify-between px-2">
                <h2 className="text-2xl font-bold text-slate-800">ප්‍රතිඵල</h2>
              </div>

              {/* Tabs */}
              <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar">
                {Object.entries(results).map(([key, value]) => (
                  value && (
                    <button
                      key={key}
                      onClick={() => setActiveTab(key)}
                      className={`px-6 py-3 rounded-2xl font-bold whitespace-nowrap transition-all border
                        ${activeTab === key 
                          ? 'bg-white border-indigo-200 text-indigo-700 shadow-sm' 
                          : 'bg-slate-100 border-transparent text-slate-500 hover:bg-slate-200'}`}
                    >
                      {getLabel(key)}
                    </button>
                  )
                ))}
              </div>

              {/* Content Area */}
              <div className="bg-white rounded-3xl shadow-lg border border-slate-100 overflow-hidden">
                <div className="p-6 md:p-8">
                  <div className="flex justify-end gap-2 mb-6">
                    <button 
                      onClick={() => copyToClipboard(results[activeTab as keyof ResultData] || '')}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors" 
                      title="පිටපත් කරන්න"
                    >
                      <Copy className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => downloadTxt(results[activeTab as keyof ResultData] || '', getLabel(activeTab))}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors flex items-center gap-1 text-xs" 
                      title="TXT බාගන්න"
                    >
                      <Download className="w-4 h-4" />
                      TXT
                    </button>
                    <button 
                      onClick={() => downloadPdf(results[activeTab as keyof ResultData] || '', getLabel(activeTab))}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors flex items-center gap-1 text-xs" 
                      title="PDF බාගන්න"
                    >
                      <Download className="w-4 h-4" />
                      PDF
                    </button>
                    <button 
                      onClick={() => downloadDocx(results[activeTab as keyof ResultData] || '', getLabel(activeTab))}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors flex items-center gap-1 text-xs" 
                      title="Word බාගන්න"
                    >
                      <Download className="w-4 h-4" />
                      Word
                    </button>
                    <button 
                      onClick={() => printContent(results[activeTab as keyof ResultData] || '')}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors" 
                      title="මුද්‍රණය කරන්න"
                    >
                      <Printer className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <textarea
                    value={results[activeTab as keyof ResultData] || ''}
                    onChange={(e) => setResults({...results, [activeTab]: e.target.value})}
                    className="w-full min-h-[400px] p-0 border-none focus:ring-0 text-slate-700 sinhala-text text-lg resize-none"
                    placeholder="ප්‍රතිඵල මෙතැන දිස්වේ..."
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Info */}
        <footer className="mt-16 text-center text-slate-400 text-sm pb-8">
          <p>© 2026 හඬ පට පරිවර්තකය - Architect's Digital Assistant</p>
        </footer>

      </div>
    </div>
  );
}
