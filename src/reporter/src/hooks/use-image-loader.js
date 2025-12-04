import { useEffect, useState } from 'react';

export default function useImageLoader(src) {
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!src) {
      setStatus('missing');
      return;
    }

    setStatus('loading');
    const img = new Image();
    img.onload = () => setStatus('loaded');
    img.onerror = () => setStatus('error');
    img.src = src;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return status;
}
