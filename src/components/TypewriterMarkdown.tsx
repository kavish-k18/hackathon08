import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

interface TypewriterMarkdownProps {
  content: string;
  speed?: number;
  animate?: boolean;
}

export default function TypewriterMarkdown({ content, speed = 15, animate = true }: TypewriterMarkdownProps) {
  const [displayedContent, setDisplayedContent] = useState(animate ? '' : content);
  const indexRef = useRef(animate ? 0 : content.length);

  useEffect(() => {
    if (!animate) {
      setDisplayedContent(content);
      return;
    }

    setDisplayedContent('');
    indexRef.current = 0;

    const timer = setInterval(() => {
      indexRef.current++;
      setDisplayedContent(content.slice(0, indexRef.current));
      
      if (indexRef.current >= content.length) {
        clearInterval(timer);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [content, animate, speed]);

  return <ReactMarkdown>{displayedContent}</ReactMarkdown>;
}
