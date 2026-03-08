import { useMemo } from 'react';

interface HighlightedTextProps {
  text: string;
  highlight?: string;
  className?: string;
}

// Escape special regex characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function HighlightedText({ text, highlight, className = '' }: HighlightedTextProps) {
  const parts = useMemo(() => {
    if (!highlight || !highlight.trim()) {
      return [{ text, isMatch: false }];
    }
    
    try {
      const regex = new RegExp(`(${escapeRegex(highlight)})`, 'gi');
      const splitParts = text.split(regex);
      
      return splitParts.map((part) => ({
        text: part,
        isMatch: part.toLowerCase() === highlight.toLowerCase(),
      }));
    } catch {
      // If regex fails for some reason, return plain text
      return [{ text, isMatch: false }];
    }
  }, [text, highlight]);
  
  if (!highlight || !highlight.trim()) {
    return <span className={className}>{text}</span>;
  }
  
  return (
    <span className={className}>
      {parts.map((part, index) => 
        part.isMatch ? (
          <mark 
            key={index} 
            className="bg-yellow-200 dark:bg-yellow-700 text-inherit rounded px-0.5"
          >
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </span>
  );
}
