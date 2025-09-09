import { useState, useEffect } from 'react';

/**
 * Кастомный хук для создания эффекта "печатающейся машинки".
 * @param text Текст для анимации.
 * @param speed Скорость печати в миллисекундах.
 * @returns Отображаемый в данный момент анимированный текст.
 */
const useTypingEffect = (text: string, speed: number = 50): string => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    // Сбрасываем текст при изменении пропса `text`
    setDisplayedText(''); 
    
    if (text) {
      let i = 0;
      const intervalId = setInterval(() => {
        if (i < text.length) {
          setDisplayedText(prev => prev + text.charAt(i));
          i++;
        } else {
          clearInterval(intervalId);
        }
      }, speed);
      
      // Очистка интервала при размонтировании компонента или изменении зависимостей
      return () => clearInterval(intervalId);
    }
  }, [text, speed]);

  return displayedText;
};

export default useTypingEffect;
