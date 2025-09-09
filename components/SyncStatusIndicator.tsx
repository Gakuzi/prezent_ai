import React from 'react';
import { SyncStatus } from '../types';
import { RefreshIcon, CheckCircleIcon, XCircleIcon, WarningIcon } from './icons';

interface SyncStatusIndicatorProps {
  status: SyncStatus;
}

const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ status }) => {
  const getStatusDetails = () => {
    switch (status) {
      case 'syncing':
        return {
          icon: <RefreshIcon className="w-5 h-5 text-blue-400 animate-spin" />,
          text: 'Синхронизация...',
          textColor: 'text-blue-300',
        };
      case 'success':
        return {
          icon: <CheckCircleIcon className="w-5 h-5 text-green-400" />,
          text: 'Сохранено',
          textColor: 'text-green-300',
        };
      case 'error':
        return {
          icon: <XCircleIcon className="w-5 h-5 text-red-400" />,
          text: 'Ошибка синхронизации',
          textColor: 'text-red-300',
        };
      case 'idle':
      default:
        return {
          icon: <WarningIcon className="w-5 h-5 text-gray-500" />,
          text: 'Ожидание изменений',
          textColor: 'text-gray-400',
        };
    }
  };

  const { icon, text, textColor } = getStatusDetails();

  return (
    <div className={`flex items-center gap-2 p-2 rounded-md transition-colors`}>
      {icon}
      <span className={`font-semibold text-sm ${textColor}`}>{text}</span>
    </div>
  );
};

export default SyncStatusIndicator;
