import React, { useState, useRef, useEffect } from 'react';
import { ExportFormat } from '../types';
import { DownloadIcon, PdfIcon, PptxIcon, VideoIcon, GlobeIcon } from './icons';
import { ExternalLinkIcon } from './icons'; // Assuming you have this icon

const GoogleSlidesIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
        <path d="M19.5 3H4.5C3.67 3 3 3.67 3 4.5V19.5C3 20.33 3.67 21 4.5 21H19.5C20.33 21 21 20.33 21 19.5V4.5C21 3.67 20.33 3 19.5 3ZM8 17H6V7H8V17ZM13 17H11V7H13V17ZM18 17H16V7H18V17Z" />
    </svg>
);


interface ExportMenuProps {
  onExport: (format: ExportFormat) => void;
  isExporting: boolean;
}

const ExportMenu: React.FC<ExportMenuProps> = ({ onExport, isExporting }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExportClick = (format: ExportFormat) => {
    setIsOpen(false);
    onExport(format);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
      >
        {isExporting ? (
            <div className="w-4 h-4 border-2 border-dashed rounded-full animate-spin border-white"></div>
        ) : (
            <DownloadIcon className="w-5 h-5" />
        )}
        Экспорт
      </button>
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl z-30">
          <ul className="py-1">
            <li>
              <button onClick={() => handleExportClick('pdf')} className="w-full flex items-center gap-3 px-4 py-2 text-left text-sm text-gray-200 hover:bg-indigo-600">
                <PdfIcon className="w-5 h-5" /> PDF Документ
              </button>
            </li>
            <li>
              <button onClick={() => handleExportClick('pptx')} className="w-full flex items-center gap-3 px-4 py-2 text-left text-sm text-gray-200 hover:bg-indigo-600">
                <PptxIcon className="w-5 h-5" /> PowerPoint (.pptx)
              </button>
            </li>
             <li>
              <button onClick={() => handleExportClick('video')} className="w-full flex items-center gap-3 px-4 py-2 text-left text-sm text-gray-200 hover:bg-indigo-600">
                <VideoIcon className="w-5 h-5" /> Видео (.mp4)
              </button>
            </li>
            <li className="my-1 border-t border-gray-700"></li>
            <li>
              <button onClick={() => handleExportClick('html')} className="w-full flex items-center gap-3 px-4 py-2 text-left text-sm text-gray-200 hover:bg-indigo-600">
                <GlobeIcon className="w-5 h-5" /> Веб-презентация (.html)
              </button>
            </li>
             <li className="my-1 border-t border-gray-700"></li>
            <li>
              <button onClick={() => handleExportClick('gsheets')} title="Скоро!" disabled className="w-full flex items-center gap-3 px-4 py-2 text-left text-sm text-gray-500 cursor-not-allowed">
                <GoogleSlidesIcon className="w-5 h-5" /> Google Slides <span className="text-xs bg-gray-600 px-1.5 py-0.5 rounded-full">Скоро</span>
              </button>
            </li>
             <li>
              <button onClick={() => handleExportClick('link')} title="Используйте экспорт в Веб-презентацию (.html) и разместите на хостинге" disabled className="w-full flex items-center gap-3 px-4 py-2 text-left text-sm text-gray-500 cursor-not-allowed">
                <ExternalLinkIcon className="w-5 h-5" /> Поделиться по ссылке <span className="text-xs bg-gray-600 px-1.5 py-0.5 rounded-full">Скоро</span>
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default ExportMenu;